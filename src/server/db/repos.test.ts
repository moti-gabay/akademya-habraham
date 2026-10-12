// pnpm test:db — runs migrations, the seed and the Drizzle repos on PGlite (Postgres
// in-process) and checks them against the mock repos. No network, no DATABASE_URL.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { SAMPLE_USER_ID } from "../mock/data";
import * as mock from "../mock/repos";
import type { Db } from "./client";
import { createDrizzleRepos } from "./repos";
import * as t from "./schema";
import { lessonSeedId, seed } from "./seed";

const LESSON = "shabbat-6";
const lessonId = lessonSeedId(LESSON);
// The seeded holiday lesson is found from this date on (before Hanukkah 5787).
const NOW = new Date("2026-10-12T00:00:00Z");

let db: Db;
let repos: ReturnType<typeof createDrizzleRepos>;

// Ids differ between the two sources (keys in the mock, UUIDs in the database).
const omit = <T extends object>(value: T, ...keys: (keyof T)[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key as keyof T)));
const withoutId = <T extends { id: string }>(value: T) => omit(value, "id");

before(async () => {
  const pglite = drizzle(new PGlite({ extensions: { citext } }));
  await migrate(pglite, { migrationsFolder: "drizzle" });
  db = pglite;
  await seed(db);
  repos = createDrizzleRepos(() => db);
});

for (const locale of ["he", "en"] as const) {
  test(`${locale}: seeded database gives the same view models as the mock repos`, async () => {
    assert.deepEqual(
      (await repos.pathRepo.getSteps(SAMPLE_USER_ID, locale)).map(withoutId),
      (await mock.pathRepo.getSteps(SAMPLE_USER_ID, locale)).map(withoutId),
    );

    const lesson = await repos.lessonRepo.getById(lessonId, locale);
    const mockLesson = await mock.lessonRepo.getById(LESSON, locale);
    assert.ok(lesson && mockLesson);
    assert.deepEqual(withoutId(lesson), withoutId(mockLesson));

    const resume = await repos.progressRepo.getContinueWatching(SAMPLE_USER_ID, locale);
    const mockResume = await mock.progressRepo.getContinueWatching(SAMPLE_USER_ID, locale);
    assert.equal(resume?.lesson.id, lessonId);
    assert.equal(resume?.positionSec, mockResume?.positionSec);

    assert.deepEqual(
      (await repos.glossaryRepo.list(locale, 3)).map(withoutId),
      (await mock.glossaryRepo.list(locale, 3)).map(withoutId),
    );
    assert.equal((await repos.glossaryRepo.list(locale)).length, (await mock.glossaryRepo.list(locale)).length);
    assert.deepEqual(
      (await repos.glossaryRepo.forLesson(lessonId, locale)).map(withoutId),
      (await mock.glossaryRepo.forLesson(LESSON, locale)).map(withoutId),
    );

    const holiday = await repos.holidayRepo.getNext(locale, NOW);
    const mockHoliday = await mock.holidayRepo.getNext(locale);
    assert.ok(holiday && mockHoliday);
    assert.deepEqual(omit(holiday, "id", "lessonId"), omit(mockHoliday, "id", "lessonId"));
    assert.equal(holiday.lessonId, lessonSeedId(mockHoliday.lessonId));
  });
}

test("the sample user is fictional and has one name for every locale", async () => {
  assert.deepEqual(await repos.userRepo.getById(SAMPLE_USER_ID, "en"), { id: SAMPLE_USER_ID, name: "משה" });
  const [row] = await db.select({ email: t.users.email }).from(t.users);
  assert.equal(row.email, "moshe@example.com");
});

test("ids that are not UUIDs match nothing instead of failing", async () => {
  assert.equal(await repos.lessonRepo.getById("shabbat-6", "he"), null);
  assert.equal(await repos.userRepo.getById("mock-user", "he"), null);
  assert.equal(await repos.progressRepo.getPosition("x", "y"), 0);
  assert.deepEqual(await repos.glossaryRepo.forLesson("x", "he"), []);
  await repos.progressRepo.save("x", "y", 10);
});

test("a holiday under way keeps showing its first day; afterwards next year's is offered", async () => {
  // Hanukkah 5787: 25 Kislev = 4 Dec 2026 (first candle on the evening of the 3rd), last day 11 Dec.
  for (const day of ["2026-12-04", "2026-12-07", "2026-12-11"]) {
    const holiday = await repos.holidayRepo.getNext("en", new Date(`${day}T12:00:00`));
    assert.equal(holiday?.hebrewDate, "25 Kislev", day);
  }
  assert.equal((await repos.holidayRepo.getNext("he", new Date("2026-12-07T12:00:00")))?.hebrewDate, "כ״ה בכסלו");
  assert.equal((await repos.holidayRepo.getNext("en", new Date("2026-12-20T12:00:00")))?.hebrewDate, "25 Kislev");
});

test("seeding again changes nothing and keeps existing progress", async () => {
  await repos.progressRepo.save(SAMPLE_USER_ID, lessonId, 900);
  const rowsBefore = await db.select({ n: count() }).from(t.lessons);
  await seed(db);
  assert.deepEqual(await db.select({ n: count() }).from(t.lessons), rowsBefore);
  assert.equal(await repos.progressRepo.getPosition(SAMPLE_USER_ID, lessonId), 900);
});

test("seed refuses to run in production", async () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    await assert.rejects(seed(db), /NODE_ENV=production/);
  } finally {
    Object.assign(process.env, { NODE_ENV: previous });
  }
});

test("a missing translation falls back to Hebrew", async () => {
  const [term] = await repos.glossaryRepo.list("ru", 1);
  await db
    .delete(t.glossaryTermTranslations)
    .where(and(eq(t.glossaryTermTranslations.termId, term.id), eq(t.glossaryTermTranslations.locale, "ru")));
  const [fallback] = await repos.glossaryRepo.list("ru", 1);
  assert.equal(fallback.term, (await repos.glossaryRepo.list("he", 1))[0].term);
});

// Last: it changes the sample user's progress.
test("watching to the end completes the lesson and moves the path forward", async () => {
  const lesson = await repos.lessonRepo.getById(lessonId, "he");
  assert.ok(lesson);
  await repos.progressRepo.save(SAMPLE_USER_ID, lessonId, lesson.durationSec);

  const steps = await repos.pathRepo.getSteps(SAMPLE_USER_ID, "he");
  assert.deepEqual(
    steps.map((step) => [step.status, step.lessonsDone]),
    [["completed", 8], ["in_progress", 6], ["up_next", 0], ["later", 0], ["later", 0]],
  );
  assert.equal(await repos.progressRepo.getContinueWatching(SAMPLE_USER_ID, "he"), null);

  // Rewinding a finished lesson does not un-finish it.
  await repos.progressRepo.save(SAMPLE_USER_ID, lessonId, 30);
  assert.equal((await repos.pathRepo.getSteps(SAMPLE_USER_ID, "he"))[1].lessonsDone, 6);
});
