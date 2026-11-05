// pnpm test:unit — the learning path (steps, a step's lessons, Start, the lesson after),
// run against both storages: Drizzle on PGlite (seeded) and the in-memory mock.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import * as t from "../db/schema";
import { createDrizzleRepos } from "../db/repos";
import { lessonSeedId, seed } from "../db/seed";
import { createTestDb } from "../db/testDb";
import type { VideoAsset } from "../media/types";
import { NEW_USER_ID, SAMPLE_USER_ID } from "../mock/data";
import { createMockRepos } from "../mock/repos";
import { buildStore } from "../mock/store";
import type { PathRepo, ProgressRepo } from "../repos/types";

// Sample lessons are addressed by their key ("shabbat-6"); each storage maps it to its id.
type Storage = {
  path: PathRepo;
  progress: ProgressRepo;
  id: (key: string) => string;
  setVideo: (key: string, status: VideoAsset["status"]) => Promise<void>;
  setLessons: (keys: string[], status: "draft" | "published") => Promise<void>;
  setTrack: (status: "draft" | "published") => Promise<void>;
};

async function dbStorage(): Promise<Storage> {
  const db = await createTestDb();
  await seed(db);
  const repos = createDrizzleRepos(() => db);
  return {
    path: repos.pathRepo,
    progress: repos.progressRepo,
    id: lessonSeedId,
    setVideo: async (key, status) => {
      await db.update(t.videoAssets).set({ status }).where(eq(t.videoAssets.lessonId, lessonSeedId(key)));
    },
    setLessons: async (keys, status) => {
      await db.update(t.lessons).set({ status }).where(inArray(t.lessons.id, keys.map(lessonSeedId)));
    },
    setTrack: async (status) => {
      await db.update(t.tracks).set({ status });
    },
  };
}

function mockStorage(): Storage {
  const store = buildStore();
  const repos = createMockRepos(store);
  return {
    path: repos.pathRepo,
    progress: repos.progressRepo,
    id: (key) => key,
    setVideo: async (key, status) => {
      store.videos.get(key)!.status = status;
    },
    setLessons: async (keys, status) => {
      for (const key of keys) store.lessons.get(key)!.status = status;
    },
    setTrack: async (status) => {
      for (const track of store.tracks.values()) track.status = status;
    },
  };
}

const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const range = (prefix: string, from: number, to: number) => numbers(from, to).map((n) => `${prefix}-${n}`);

for (const [name, create] of [
  ["db", dbStorage],
  ["mock", async () => mockStorage()],
] as const) {
  describe(name, () => {
    // Read-only checks share one storage; the tests that change data each get their own.
    let shared: Promise<Storage> | undefined;
    const storage = () => (shared ??= create());
    const stepIds = async (s: Storage) => (await s.path.getSteps(SAMPLE_USER_ID, "he")).map((step) => step.id);

    test("the sample user's path matches the sketch, counting published lessons only", async () => {
      const steps = await (await storage()).path.getSteps(SAMPLE_USER_ID, "en");
      assert.deepEqual(
        steps.map((step) => [step.name, step.status, step.lessonsDone, step.lessonsTotal, step.available]),
        [
          ["Foundations of faith", "completed", 8, 8, true],
          ["Shabbat", "in_progress", 5, 12, true],
          // 11 lessons, one of them a draft.
          ["Kashrut", "up_next", 0, 10, true],
          ["Prayer and blessings", "later", 0, 10, true],
          // 9 lessons, one of them a draft.
          ["The Jewish holidays", "later", 0, 8, true],
        ],
      );
    });

    test("a step lists its published lessons with the user's state, and one of them is next", async () => {
      const s = await storage();
      const [, shabbat, kashrut] = await stepIds(s);
      const step = await s.path.getStep(SAMPLE_USER_ID, shabbat, "he");
      assert.ok(step);
      assert.deepEqual([step.number, step.name, step.lessonsDone, step.lessonsTotal], [2, "שבת", 5, 12]);
      assert.deepEqual(step.nextStep, { id: kashrut, name: "כשרות" });
      assert.deepEqual(
        step.lessons.map((lesson) => [lesson.number, lesson.state, lesson.isNext]),
        [
          ...numbers(1, 5).map((n) => [n, "done", false]),
          [6, "in_progress", true],
          ...numbers(7, 12).map((n) => [n, "not_started", false]),
        ],
      );
      const sixth = step.lessons[5];
      assert.deepEqual(
        [sixth.id, sixth.title, sixth.positionSec, sixth.durationSec, sixth.ready],
        [s.id("shabbat-6"), "הלכות שבת: ל״ט מלאכות, חלק א", 12 * 60 + 40, 42 * 60 + 15, true],
      );
    });

    test("a draft is left out of a step, and the lessons after it are numbered without it", async () => {
      const s = await storage();
      const [, , kashrut] = await stepIds(s);
      const step = await s.path.getStep(SAMPLE_USER_ID, kashrut, "he");
      assert.ok(step);
      assert.deepEqual(
        step.lessons.map((lesson) => lesson.id),
        [...range("kashrut", 1, 3), ...range("kashrut", 5, 11)].map(s.id),
      );
      assert.deepEqual(step.lessons.map((lesson) => lesson.number), numbers(1, 10));
      assert.equal(step.lessons[0].isNext, true);

      const after = (await s.path.getLessonAfter(s.id("kashrut-5"), "he"))?.lesson;
      assert.deepEqual([after?.id, after?.lessonNumber, after?.lessonsInStep], [s.id("kashrut-6"), 5, 10]);
    });

    test("an unknown step is not found", async () => {
      const s = await storage();
      assert.equal(await s.path.getStep(SAMPLE_USER_ID, "not-a-step", "he"), null);
      assert.equal(await s.path.getStep(SAMPLE_USER_ID, "00000000-0000-4000-8000-000000000000", "he"), null);
    });

    test("a new user has nothing to continue and starts at the first lesson of the path", async () => {
      const s = await storage();
      const steps = await s.path.getSteps(NEW_USER_ID, "he");
      assert.deepEqual(
        steps.map((step) => [step.status, step.lessonsDone]),
        [["up_next", 0], ["later", 0], ["later", 0], ["later", 0], ["later", 0]],
      );
      assert.equal(await s.progress.getContinueWatching(NEW_USER_ID, "he"), null);

      const start = await s.path.getStartLesson(NEW_USER_ID, "he");
      assert.deepEqual(
        [start?.id, start?.title, start?.stepNumber, start?.lessonNumber, start?.lessonsInStep],
        [s.id("faith-1"), "יסודות האמונה · שיעור 1", 1, 1, 8],
      );
      const first = await s.path.getStep(NEW_USER_ID, steps[0].id, "he");
      assert.deepEqual(first?.lessons.filter((lesson) => lesson.isNext).map((lesson) => lesson.id), [s.id("faith-1")]);
    });

    test("Start for a returning user is the first lesson not finished, even one under way", async () => {
      const s = await storage();
      assert.equal((await s.path.getStartLesson(SAMPLE_USER_ID, "he"))?.id, s.id("shabbat-6"));
    });

    test("the lesson after one follows path order, across steps, and ends with the path", async () => {
      const s = await storage();
      const after = async (key: string) => {
        const next = await s.path.getLessonAfter(s.id(key), "he");
        return next && [next.lesson.id, next.newStep];
      };
      assert.deepEqual(await after("shabbat-6"), [s.id("shabbat-7"), false]);
      assert.deepEqual(await after("shabbat-12"), [s.id("kashrut-1"), true]);
      assert.deepEqual(await after("kashrut-3"), [s.id("kashrut-5"), false]);
      assert.equal(await after("holidays-9"), null);
      // A draft is not in the path, so nothing follows it.
      assert.equal(await after("kashrut-meat-milk"), null);
    });

    test("a lesson whose video is not ready is shown but never offered", async () => {
      const s = await create();
      await s.setVideo("shabbat-7", "processing");
      await s.setVideo("faith-1", "processing");
      const [faith, shabbat] = await stepIds(s);

      const step = await s.path.getStep(SAMPLE_USER_ID, shabbat, "he");
      assert.deepEqual(
        step?.lessons.slice(5, 8).map((lesson) => [lesson.id, lesson.ready, lesson.isNext]),
        [
          [s.id("shabbat-6"), true, true],
          [s.id("shabbat-7"), false, false],
          [s.id("shabbat-8"), true, false],
        ],
      );
      assert.equal((await s.path.getLessonAfter(s.id("shabbat-6"), "he"))?.lesson.id, s.id("shabbat-8"));
      assert.equal((await s.path.getStartLesson(NEW_USER_ID, "he"))?.id, s.id("faith-2"));
      const first = await s.path.getStep(NEW_USER_ID, faith, "he");
      assert.deepEqual(first?.lessons.slice(0, 2).map((lesson) => lesson.isNext), [false, true]);
    });

    test("an unpublished lesson in progress no longer counts or hides the card", async () => {
      const s = await create();
      await s.progress.save(SAMPLE_USER_ID, s.id("shabbat-8"), 60);
      assert.equal((await s.progress.getContinueWatching(SAMPLE_USER_ID, "he"))?.lesson.id, s.id("shabbat-8"));

      await s.setLessons(["shabbat-8"], "draft");
      // The earlier lesson under way comes back instead of an empty home page.
      assert.equal((await s.progress.getContinueWatching(SAMPLE_USER_ID, "he"))?.lesson.id, s.id("shabbat-6"));
      const shabbat = (await s.path.getSteps(SAMPLE_USER_ID, "he"))[1];
      assert.deepEqual([shabbat.lessonsDone, shabbat.lessonsTotal], [5, 11]);
      const lesson = await s.path.getLessonAfter(s.id("shabbat-7"), "he");
      assert.deepEqual([lesson?.lesson.id, lesson?.lesson.lessonNumber], [s.id("shabbat-9"), 8]);
    });

    test("a step with no published lesson is coming soon, and up next moves past it", async () => {
      const s = await create();
      await s.setLessons([...range("kashrut", 1, 3), ...range("kashrut", 5, 11)], "draft");
      const steps = await s.path.getSteps(SAMPLE_USER_ID, "he");
      assert.deepEqual(
        steps.slice(2).map((step) => [step.status, step.lessonsTotal, step.available]),
        [
          ["later", 0, false],
          ["up_next", 10, true],
          ["later", 8, true],
        ],
      );
      assert.equal(await s.path.getStep(SAMPLE_USER_ID, steps[2].id, "he"), null);
      assert.equal((await s.path.getStep(SAMPLE_USER_ID, steps[1].id, "he"))?.nextStep?.id, steps[3].id);
      assert.equal((await s.path.getLessonAfter(s.id("shabbat-12"), "he"))?.lesson.id, s.id("prayer-1"));
    });

    test("after the whole path is finished there is nothing to start", async () => {
      const s = await create();
      const steps = await s.path.getSteps(NEW_USER_ID, "he");
      for (const { id } of steps) {
        for (const lesson of (await s.path.getStep(NEW_USER_ID, id, "he"))?.lessons ?? []) {
          await s.progress.save(NEW_USER_ID, lesson.id, lesson.durationSec);
        }
      }
      assert.equal(await s.path.getStartLesson(NEW_USER_ID, "he"), null);
      assert.equal(await s.progress.getContinueWatching(NEW_USER_ID, "he"), null);
      assert.ok((await s.path.getSteps(NEW_USER_ID, "he")).every((step) => step.status === "completed"));
    });

    test("the end of the video finishes a lesson whatever its length, for published lessons only", async () => {
      const s = await create();
      const prayer = (await stepIds(s))[3];
      const state = async (key: string) =>
        (await s.path.getStep(NEW_USER_ID, prayer, "he"))?.lessons.find((lesson) => lesson.id === s.id(key))?.state;

      // 60 s of a 30-minute placeholder: far below 95%, but the video ended.
      await s.progress.save(NEW_USER_ID, s.id("prayer-1"), 60, true);
      assert.equal(await state("prayer-1"), "done");
      // A later save without "ended" (rewinding, watching again) moves the stop point only.
      await s.progress.save(NEW_USER_ID, s.id("prayer-1"), 10);
      assert.equal(await state("prayer-1"), "done");
      assert.equal(await s.progress.getPosition(NEW_USER_ID, s.id("prayer-1")), 10);
      // The same share without "ended" does not finish a lesson.
      await s.progress.save(NEW_USER_ID, s.id("prayer-3"), 60);
      assert.equal(await state("prayer-3"), "in_progress");

      await s.setLessons(["prayer-2"], "draft");
      await s.progress.save(NEW_USER_ID, s.id("prayer-2"), 60, true);
      await s.setLessons(["prayer-2"], "published");
      assert.equal(await state("prayer-2"), "not_started");
    });

    test("without a published track there is no path at all", async () => {
      const s = await create();
      const [, shabbat] = await stepIds(s);
      await s.setTrack("draft");
      assert.deepEqual(await s.path.getSteps(SAMPLE_USER_ID, "he"), []);
      assert.equal(await s.path.getStep(SAMPLE_USER_ID, shabbat, "he"), null);
      assert.equal(await s.path.getStartLesson(NEW_USER_ID, "he"), null);
      assert.equal(await s.path.getLessonAfter(s.id("shabbat-6"), "he"), null);
    });
  });
}
