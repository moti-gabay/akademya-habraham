// pnpm test:unit — the access-request export, the same checks on the mock store and on
// a seeded PGlite, then what only the database has (deleted users, locales, audit).
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import { writeAudit } from "../auth/audit";
import { handleClerkEvent } from "../auth/clerkSync";
import { NEW_USER_ID, SAMPLE_USER_ID } from "../mock/data";
import { buildStore } from "../mock/store";
import { createMockUserDataRepo } from "../mock/userData";
import type { UserDataRepo, UserExport } from "../repos/types";
import type { Db } from "./client";
import * as t from "./schema";
import { seed } from "./seed";
import { createTestDb } from "./testDb";
import { createDrizzleUserDataRepo } from "./userData";

let db: Db;
const sources: Record<"mock" | "db", UserDataRepo> = { mock: createMockUserDataRepo(buildStore()), db: null! };
before(async () => {
  db = await createTestDb();
  await seed(db);
  sources.db = createDrizzleUserDataRepo(() => db);
});

// Lesson ids differ between the sources (keys in the mock, UUIDs in the database).
const comparable = (progress: UserExport["progress"]) =>
  progress.map((row) => ({ ...row, lessonId: undefined })).sort((a, b) => a.lessonTitle.localeCompare(b.lessonTitle));

for (const name of ["mock", "db"] as const) {
  test(`${name}: finds a user by email, in any case`, async () => {
    const repo = sources[name];
    assert.equal(await repo.findIdByEmail("moshe@example.com"), SAMPLE_USER_ID);
    assert.equal(await repo.findIdByEmail("MOSHE@Example.com"), SAMPLE_USER_ID);
    assert.equal(await repo.findIdByEmail("nobody@example.com"), null);
  });

  test(`${name}: exports the account and the user's progress, latest first`, async () => {
    const data = await sources[name].buildExport(SAMPLE_USER_ID);
    assert.ok(data);
    assert.deepEqual(data.account, {
      id: SAMPLE_USER_ID,
      email: "moshe@example.com",
      name: "משה",
      locale: "he",
      role: "user",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    assert.ok(data.progress.length > 0);
    const times = data.progress.map((row) => row.updatedAt);
    assert.deepEqual(times, [...times].sort().reverse());
    // One lesson stopped midway, the rest finished.
    assert.equal(data.progress.filter((row) => row.completedAt === null).length, 1);
    assert.deepEqual(data.accountChanges, []);
  });

  test(`${name}: a user with no progress, and an unknown user`, async () => {
    const repo = sources[name];
    assert.deepEqual((await repo.buildExport(NEW_USER_ID))?.progress, []);
    assert.equal(await repo.buildExport("5a3b1c2d-0000-4000-8000-0000000000ff"), null);
    assert.equal(await repo.buildExport("not-a-uuid"), null);
  });
}

test("mock and database export the same progress", async () => {
  const [mock, real] = await Promise.all([sources.mock.buildExport(SAMPLE_USER_ID), sources.db.buildExport(SAMPLE_USER_ID)]);
  assert.deepEqual(comparable(real!.progress), comparable(mock!.progress));
});

test("db: titles follow the user's locale, and admin changes come without who made them", async () => {
  await db.update(t.users).set({ locale: "en" }).where(eq(t.users.id, SAMPLE_USER_ID));
  await writeAudit(db, {
    actorId: NEW_USER_ID,
    action: "user.update",
    targetType: "user",
    targetId: SAMPLE_USER_ID,
    diff: { before: { role: "user", blocked: false }, after: { role: "user", blocked: true } },
    ip: "203.0.113.9",
  });
  const data = await sources.db.buildExport(SAMPLE_USER_ID);
  const titles = await db.select().from(t.lessonTranslations);
  const titleOf = (lessonId: string, locale: string) =>
    titles.find((row) => row.lessonId === lessonId && row.locale === locale && row.title)?.title;
  assert.ok(data!.progress.some((row) => titleOf(row.lessonId, "en")));
  for (const row of data!.progress) {
    assert.equal(row.lessonTitle, titleOf(row.lessonId, "en") ?? titleOf(row.lessonId, "he"));
  }
  assert.equal(data!.account.locale, "en");
  assert.equal(data!.accountChanges.length, 1);
  assert.deepEqual(Object.keys(data!.accountChanges[0]).sort(), ["action", "at", "change"]);
  assert.deepEqual(data!.accountChanges[0].change, { before: { role: "user", blocked: false }, after: { role: "user", blocked: true } });
});

test("db: a deleted user has nothing to export and cannot be found", async () => {
  await handleClerkEvent(db, "evt_export_delete", { type: "user.deleted", data: { id: "seed_sample_user", deleted: true } });
  assert.equal(await sources.db.buildExport(SAMPLE_USER_ID), null);
  assert.equal(await sources.db.findIdByEmail("moshe@example.com"), null);
  // The other user is still there.
  assert.equal(await sources.db.findIdByEmail("david@example.com"), NEW_USER_ID);
});
