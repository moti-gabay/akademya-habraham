// pnpm test:unit — who gets a playable address, on both storages (Drizzle on PGlite,
// in-memory mock) with the fake video provider. No network, no keys.
import assert from "node:assert/strict";
import { before, describe, mock, test } from "node:test";
import { AuthError, type Actor } from "../auth/actor";
import { saveEntity, setPublished } from "../catalog/service";
import type { AdminCatalogRepo } from "../catalog/types";
import { createDrizzleAdminCatalogRepo } from "../db/adminCatalog";
import type { Db } from "../db/client";
import { createDrizzleMediaRepo } from "../db/media";
import { lessonSeedId, seed } from "../db/seed";
import { createTestDb } from "../db/testDb";
import { createFakeFileStorage, createFakeMediaProvider, createFakeMediaState, type FakeMediaProvider } from "../media/fake";
import { getMedia, type MediaDeps, startVideoUpload } from "../media/service";
import type { MediaRepo } from "../media/types";
import { SAMPLE_USER_ID } from "../mock/data";
import { createMockRepos } from "../mock/repos";
import { buildStore } from "../mock/store";
import { PLAYBACK_TTL_SEC, type PlaybackDeps, startPlayback } from "./service";

const viewer: Actor = { userId: SAMPLE_USER_ID, role: "user", locale: "he", secondFactorVerified: false };
const admin: Actor = { ...viewer, role: "admin", secondFactorVerified: true };
const NOW = new Date("2026-10-29T12:00:00Z");
const expiresAt = new Date(NOW.getTime() + PLAYBACK_TTL_SEC * 1000).toISOString();

type Storage = { catalog: AdminCatalogRepo; repo: MediaRepo; sampleLesson: string };
const storages: Record<string, Storage> = {};

before(async () => {
  const db: Db = await createTestDb();
  await seed(db);
  storages.db = { catalog: createDrizzleAdminCatalogRepo(() => db), repo: createDrizzleMediaRepo(() => db), sampleLesson: lessonSeedId("shabbat-6") };
  const mock = createMockRepos(buildStore());
  storages.mock = { catalog: mock.adminCatalogRepo, repo: mock.mediaRepo, sampleLesson: "shabbat-6" };
});

for (const name of ["db", "mock"]) {
  describe(name, () => {
    function setup() {
      const clock = { ms: 1_000_000 };
      const state = createFakeMediaState();
      const provider: FakeMediaProvider = createFakeMediaProvider(state, { now: () => clock.ms, processingMs: 3000 });
      const { catalog, repo, sampleLesson } = storages[name];
      const media: MediaDeps = { repo, provider, storage: createFakeFileStorage(state), now: () => new Date(clock.ms) };
      const deps: PlaybackDeps = { repo, provider, now: () => NOW };
      const play = (actor: Actor | null, lessonId: string, extra: Partial<PlaybackDeps> = {}) => startPlayback({ ...deps, ...extra }, actor, lessonId);
      // A new lesson with a ready video, published or not.
      const lesson = async (slug: string, published: boolean) => {
        const saved = await saveEntity(catalog, admin, "lessons", {
          categoryId: null,
          teacherId: null,
          durationSec: null,
          access: "members",
          translations: { he: { title: `שיעור ${slug}`, description: null, keyPoints: [], slug: `${name}-play-${slug}` } },
        });
        assert.ok(saved.ok, JSON.stringify(saved));
        assert.ok((await startVideoUpload(media, admin, saved.id)).ok);
        provider.receiveUpload((await repo.getLessonMedia(saved.id))!.video!.videoId, 5000);
        clock.ms += 3000;
        await getMedia(media, admin, saved.id);
        if (published) assert.ok((await setPublished(catalog, admin, "lessons", saved.id, true)).ok);
        return saved.id;
      };
      return { state, provider, repo, media, play, lesson, sampleLesson };
    }

    test("a signed-in viewer of a published lesson with a ready video gets an address that expires", async () => {
      const { state, play, lesson, repo } = setup();
      const id = await lesson("ready", true);
      assert.equal((await repo.getLessonMedia(id))?.access, "members");
      const result = await play(viewer, id);
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(result.expiresAt, expiresAt);
      const url = new URL(result.url, "http://localhost");
      const videoId = (await repo.getLessonMedia(id))!.video!.videoId;
      assert.equal(url.pathname, `/api/dev/media/play/${videoId}/playlist.m3u8`);
      assert.equal(url.searchParams.get("expires"), String(Math.floor(NOW.getTime() / 1000) + PLAYBACK_TTL_SEC));
      assert.ok(url.searchParams.get("token"));
      assert.deepEqual(Object.keys(result).sort(), ["expiresAt", "ok", "url"]);
      assert.ok(createFakeMediaProvider(state) && state.playbackSecret.length === 32);
    });

    test("the seeded sample lesson plays, and its address is never asked from the provider", async () => {
      const { provider, play, sampleLesson } = setup();
      // The sample video exists in the records only; the fake provider has never seen it.
      assert.equal(await provider.getVideo("fake-sample-shabbat-6"), null);
      const strict = { ...provider, getVideo: async (): Promise<never> => assert.fail("startPlayback must not ask the provider for state") };
      const result = await play(viewer, sampleLesson, { provider: strict });
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(result.url, /^\/api\/dev\/media\/play\/fake-sample-shabbat-6\/playlist\.m3u8\?expires=\d+&token=/);
    });

    test("signed out is refused before anything is read", async () => {
      const { play } = setup();
      let reads = 0;
      const repo = { getLessonMedia: async () => (reads++, null) };
      await assert.rejects(play(null, "shabbat-6", { repo }), (error: unknown) => error instanceof AuthError && error.code === "signed_out");
      assert.equal(reads, 0);
    });

    test("an unknown or unpublished lesson is not found, even for someone who could not watch it", async () => {
      const { play, lesson } = setup();
      const draft = await lesson("draft", false);
      const notFound = { ok: false, status: 404, error: "not_found" };
      assert.deepEqual(await play(viewer, "00000000-0000-4000-8000-000000000000"), notFound);
      assert.deepEqual(await play(viewer, "no-such-lesson"), notFound);
      assert.deepEqual(await play(viewer, draft), notFound);
      assert.deepEqual(await play(viewer, draft, { canWatch: () => false }), notFound);
    });

    test("a viewer who may not watch gets members_only, before the video is even looked at", async () => {
      const { play, lesson, repo, media } = setup();
      const id = await lesson("members", true);
      const seen: unknown[] = [];
      const canWatch: PlaybackDeps["canWatch"] = (actor, l) => (seen.push([actor, l.access]), false);
      assert.deepEqual(await play(viewer, id, { canWatch }), { ok: false, status: 403, error: "members_only" });
      assert.deepEqual(seen, [[{ userId: SAMPLE_USER_ID }, "members"]]);
      // Replacing the video leaves it unready; canWatch still answers first.
      assert.ok((await startVideoUpload(media, admin, id)).ok);
      assert.equal((await repo.getLessonMedia(id))?.video?.status, "created");
      assert.deepEqual(await play(viewer, id, { canWatch: () => false }), { ok: false, status: 403, error: "members_only" });
      assert.deepEqual(await play(viewer, id), { ok: false, status: 409, error: "video_not_ready" });
    });

    test("a failure to sign is a 502 that names nothing secret", async () => {
      const { play, lesson } = setup();
      const id = await lesson("unsigned", true);
      const provider = { playbackUrl: async (): Promise<string> => { throw new Error("BUNNY_TOKEN_SECURITY_KEY is not set"); } };
      const logged = mock.method(console, "error", () => {});
      try {
        assert.deepEqual(await play(viewer, id, { provider }), { ok: false, status: 502, error: "provider_failed" });
        assert.equal(logged.mock.callCount(), 1);
        assert.doesNotMatch(JSON.stringify(logged.mock.calls[0].arguments), /token=|https?:/);
      } finally {
        logged.mock.restore();
      }
    });
  });
}
