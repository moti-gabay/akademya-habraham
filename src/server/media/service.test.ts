// pnpm test:unit — the media service on both storages (Drizzle on PGlite, in-memory
// mock), with the fake video provider and fake file storage. No network, no keys.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { AuthError, type Actor } from "../auth/actor";
import { saveEntity, setPublished } from "../catalog/service";
import type { AdminCatalogRepo } from "../catalog/types";
import { createDrizzleAdminCatalogRepo } from "../db/adminCatalog";
import type { Db } from "../db/client";
import { createDrizzleMediaRepo } from "../db/media";
import * as t from "../db/schema";
import { seed } from "../db/seed";
import { createTestDb } from "../db/testDb";
import { SAMPLE_USER_ID } from "../mock/data";
import { createMockRepos } from "../mock/repos";
import { buildStore } from "../mock/store";
import { createFakeFileStorage, createFakeMediaProvider, createFakeMediaState, type FakeMediaProvider } from "./fake";
import {
  captionKey,
  confirmThumbnail,
  deleteLesson,
  getMedia,
  handleVideoWebhook,
  removeCaption,
  removeThumbnail,
  removeVideo,
  saveCaption,
  startThumbnailUpload,
  startVideoUpload,
  syncCaption,
  thumbnailContentType,
  webhookSecretMatches,
  type MediaDeps,
} from "./service";
import type { FileStorage, MediaRepo } from "./types";

const actor = (role: Actor["role"], secondFactorVerified = true): Actor => ({ userId: SAMPLE_USER_ID, role, locale: "he", secondFactorVerified });
const admin = actor("admin");
const code = (expected: string) => (error: unknown) => error instanceof AuthError && error.code === expected;
const vtt = (text: string) => new TextEncoder().encode(`WEBVTT\n\n00:00.000 --> 00:02.000\n${text}\n`);

type Storage = { catalog: AdminCatalogRepo; repo: MediaRepo; audits: () => Promise<{ action: string; diff: unknown }[]> };
const storages: Record<string, Storage> = {};

before(async () => {
  const db: Db = await createTestDb();
  await seed(db);
  storages.db = {
    catalog: createDrizzleAdminCatalogRepo(() => db),
    repo: createDrizzleMediaRepo(() => db),
    audits: () => db.select({ action: t.auditLog.action, diff: t.auditLog.diff }).from(t.auditLog),
  };
  const store = buildStore();
  const mock = createMockRepos(store);
  storages.mock = { catalog: mock.adminCatalogRepo, repo: mock.mediaRepo, audits: async () => store.audit.map(({ action, diff }) => ({ action, diff })) };
});

for (const name of ["db", "mock"]) {
  describe(name, () => {
    // A fresh fake provider and file storage per test, with a clock the test moves.
    function setup() {
      const clock = { ms: 1_000_000 };
      const state = createFakeMediaState();
      const provider: FakeMediaProvider = createFakeMediaProvider(state, { now: () => clock.ms, processingMs: 3000 });
      const storage: FileStorage = createFakeFileStorage(state);
      const { catalog, repo, audits } = storages[name];
      const deps: MediaDeps = { repo, provider, storage, now: () => new Date(clock.ms) };
      const lesson = async (slug: string) => {
        const result = await saveEntity(catalog, admin, "lessons", {
          categoryId: null,
          teacherId: null,
          durationSec: null,
          access: "members",
          translations: { he: { title: `שיעור ${slug}`, description: null, keyPoints: [], slug: `${name}-${slug}` } },
        });
        assert.ok(result.ok, JSON.stringify(result));
        return result.id;
      };
      // Upload, and let the fake finish "encoding".
      const ready = async (lessonId: string) => {
        const started = await startVideoUpload(deps, admin, lessonId);
        assert.ok(started.ok);
        const { video } = (await repo.getLessonMedia(lessonId))!;
        provider.receiveUpload(video!.videoId, 5000);
        clock.ms += 3000;
        await getMedia(deps, admin, lessonId);
        return video!.videoId;
      };
      return { clock, state, provider, storage, deps, catalog, repo, audits, lesson, ready };
    }

    test("a video is uploaded, processed and ready; only then can the lesson be published", async () => {
      const { clock, provider, deps, catalog, repo, lesson } = setup();
      const id = await lesson("upload");
      assert.deepEqual(await setPublished(catalog, admin, "lessons", id, true), { ok: false, status: 409, error: "video_not_ready" });

      const started = await startVideoUpload(deps, admin, id);
      assert.ok(started.ok);
      const videoId = (await repo.getLessonMedia(id))!.video!.videoId;
      assert.ok(videoId.startsWith("fake-"));
      assert.deepEqual(started.upload, { protocol: "put", url: `/api/dev/media/video/${videoId}` });
      const status = async () => {
        const result = await getMedia(deps, admin, id);
        assert.ok(result.ok);
        return result.media.video?.status;
      };
      assert.equal(await status(), "created");

      provider.receiveUpload(videoId, 5000);
      assert.equal(await status(), "processing");
      assert.equal((await setPublished(catalog, admin, "lessons", id, true)).ok, false);

      clock.ms += 3000;
      assert.equal(await status(), "ready");
      const media = (await repo.getLessonMedia(id))!;
      assert.deepEqual([media.video?.durationSec, media.video?.thumbnailUrl, media.video?.readyAt], [634, "/samples/thumbnail.svg", new Date(clock.ms)]);
      // The lesson takes its length from the video.
      assert.equal((await catalog.get("lessons", id))?.durationSec, 634);
      assert.ok((await setPublished(catalog, admin, "lessons", id, true)).ok);

      // A published lesson keeps its video; it can be replaced, not removed.
      assert.deepEqual(await removeVideo(deps, admin, id), { ok: false, status: 409, error: "not_draft" });
      assert.ok((await startVideoUpload(deps, admin, id)).ok);
      assert.equal(await provider.getVideo(videoId), null);
      assert.ok((await setPublished(catalog, admin, "lessons", id, false)).ok);
      assert.ok((await removeVideo(deps, admin, id)).ok);
      assert.equal((await repo.getLessonMedia(id))?.video, null);
      assert.equal((await getMedia(deps, admin, "00000000-0000-4000-8000-000000000000")).ok, false);
    });

    test("captions are validated, stored, and sent to the provider when the video is ready", async () => {
      const { state, storage, deps, repo, lesson, ready } = setup();
      const id = await lesson("captions");
      const synced = async () => (await repo.getLessonMedia(id))!.captions.map((caption) => [caption.locale, Boolean(caption.syncedAt)]);

      for (const bad of [new TextEncoder().encode("1\n00:00 --> 00:01\nsrt"), new Uint8Array([0xff, 0xfe, 0xfd]), vtt("x".repeat(1024 * 1024))]) {
        assert.deepEqual(await saveCaption(deps, admin, id, "he", bad), { ok: false, status: 400, error: "invalid_caption" });
      }
      assert.equal((await saveCaption(deps, admin, id, "fr", vtt("x"))).ok, false);
      assert.deepEqual(await synced(), []);

      // No video yet: the caption is kept and waits.
      assert.deepEqual(await saveCaption(deps, admin, id, "en", vtt("Hello")), { ok: true, synced: false });
      assert.deepEqual(await saveCaption(deps, admin, id, "he", vtt("שלום")), { ok: true, synced: false });
      assert.match(new TextDecoder().decode((await storage.get(captionKey(id, "he")))!), /שלום/);
      assert.deepEqual(await synced(), [["he", false], ["en", false]]);
      assert.deepEqual(await syncCaption(deps, admin, id, "he"), { ok: false, status: 409, error: "video_not_ready" });

      const videoId = await ready(id);
      assert.deepEqual(await synced(), [["he", true], ["en", true]]);
      assert.match(state.videos.get(videoId)!.captions.get("en")!, /Hello/);

      // With a finished video a new caption goes straight through; replacing one too.
      assert.deepEqual(await saveCaption(deps, admin, id, "en", vtt("Hello again")), { ok: true, synced: true });
      assert.match(state.videos.get(videoId)!.captions.get("en")!, /Hello again/);

      // The provider is down: the caption is still stored, marked as not sent, and can be sent again.
      const down: MediaDeps = { ...deps, provider: { ...deps.provider, putCaption: async () => Promise.reject(new Error("down")) } };
      assert.deepEqual(await saveCaption(down, admin, id, "ru", vtt("Привет")), { ok: true, synced: false });
      assert.deepEqual(await syncCaption(down, admin, id, "ru"), { ok: false, status: 502, error: "provider_failed" });
      assert.deepEqual(await synced(), [["he", true], ["en", true], ["ru", false]]);
      assert.ok((await syncCaption(deps, admin, id, "ru")).ok);
      assert.deepEqual(await synced(), [["he", true], ["en", true], ["ru", true]]);

      assert.ok((await removeCaption(deps, admin, id, "en")).ok);
      assert.equal(await storage.get(captionKey(id, "en")), null);
      assert.equal(state.videos.get(videoId)!.captions.has("en"), false);
      assert.equal((await removeCaption(deps, admin, id, "en")).ok, false);

      // A replacement video starts without captions, so they are sent again when it is ready.
      assert.ok((await startVideoUpload(deps, admin, id)).ok);
      assert.deepEqual(await synced(), [["he", false], ["ru", false]]);
    });

    test("a thumbnail is uploaded by the browser, confirmed, replaced and removed", async () => {
      const { storage, deps, repo, lesson } = setup();
      const id = await lesson("thumbnail");
      assert.deepEqual(await startThumbnailUpload(deps, admin, id, "image/gif"), { ok: false, status: 400, error: "unsupported_type" });
      const first = await startThumbnailUpload(deps, admin, id, "image/jpeg");
      assert.ok(first.ok);
      assert.match(first.key, new RegExp(`^thumbnails/${id}/[0-9a-f-]{36}\\.jpg$`));
      assert.equal(thumbnailContentType(first.key), "image/jpeg");

      // Not confirmed before the file exists, and never with a key from somewhere else.
      assert.deepEqual(await confirmThumbnail(deps, admin, id, first.key), { ok: false, status: 400, error: "upload_missing" });
      await storage.put("thumbnails/other/x.jpg", new Uint8Array([1]), "image/jpeg");
      assert.deepEqual(await confirmThumbnail(deps, admin, id, "thumbnails/other/x.jpg"), { ok: false, status: 400, error: "invalid_body" });

      await storage.put(first.key, new Uint8Array([1, 2, 3]), "image/jpeg");
      assert.ok((await confirmThumbnail(deps, admin, id, first.key)).ok);
      assert.equal((await repo.getLessonMedia(id))?.thumbnailKey, first.key);

      const second = await startThumbnailUpload(deps, admin, id, "image/webp");
      assert.ok(second.ok);
      await storage.put(second.key, new Uint8Array([4]), "image/webp");
      assert.ok((await confirmThumbnail(deps, admin, id, second.key)).ok);
      assert.equal(await storage.exists(first.key), false);

      assert.ok((await removeThumbnail(deps, admin, id)).ok);
      assert.equal((await repo.getLessonMedia(id))?.thumbnailKey, null);
      assert.equal(await storage.exists(second.key), false);
      assert.equal((await removeThumbnail(deps, admin, id)).ok, false);
    });

    test("deleting a draft lesson removes its records, then its video and files", async () => {
      const { state, storage, deps, catalog, repo, lesson, ready } = setup();
      const id = await lesson("delete");
      const videoId = await ready(id);
      await saveCaption(deps, admin, id, "he", vtt("שלום"));
      const thumbnail = await startThumbnailUpload(deps, admin, id, "image/png");
      assert.ok(thumbnail.ok);
      await storage.put(thumbnail.key, new Uint8Array([1]), "image/png");
      await confirmThumbnail(deps, admin, id, thumbnail.key);

      assert.ok((await deleteLesson({ ...deps, catalog }, admin, id)).ok);
      assert.equal(await repo.getLessonMedia(id), null);
      assert.equal(await repo.findLessonByVideo(videoId), null);
      assert.equal(state.videos.has(videoId), false);
      assert.deepEqual([...state.files.keys()], []);
    });

    test("a provider failure during cleanup is audited and does not fail the delete", async () => {
      const { state, deps, catalog, repo, audits, lesson, ready } = setup();
      const id = await lesson("cleanup");
      const videoId = await ready(id);
      await saveCaption(deps, admin, id, "he", vtt("שלום"));
      const broken: MediaDeps = {
        ...deps,
        provider: { ...deps.provider, deleteVideo: async () => Promise.reject(new Error("down")) },
        storage: { ...deps.storage, delete: async () => Promise.reject(new Error("down")) },
      };

      assert.deepEqual(await deleteLesson({ ...broken, catalog }, admin, id), { ok: true });
      assert.equal(await repo.getLessonMedia(id), null);
      assert.equal(await catalog.get("lessons", id), null);
      // What was left behind is on record.
      assert.equal(state.videos.has(videoId), true);
      const failed = (await audits()).filter((entry) => entry.action === "media.cleanup_failed").at(-1);
      assert.deepEqual(failed?.diff, { left: [`video ${videoId}`, `file ${captionKey(id, "he")}`] });

      // The catalog rules still decide: a published lesson is not deleted, and nothing is cleaned up.
      const kept = await lesson("kept");
      const keptVideo = await ready(kept);
      await setPublished(catalog, admin, "lessons", kept, true);
      assert.deepEqual(await deleteLesson({ ...deps, catalog }, admin, kept), { ok: false, status: 409, error: "not_draft" });
      assert.equal(state.videos.has(keptVideo), true);
    });

    test("the provider's webhook refreshes the video once, however often it is delivered", async () => {
      const { clock, provider, deps, repo, lesson } = setup();
      const id = await lesson("webhook");
      await startVideoUpload(deps, admin, id);
      const videoId = (await repo.getLessonMedia(id))!.video!.videoId;
      provider.receiveUpload(videoId, 10);
      clock.ms += 3000;

      const payload = { VideoLibraryId: 1, VideoGuid: videoId, Status: 4 };
      assert.equal(await handleVideoWebhook(deps, payload), "processed");
      assert.equal((await repo.getLessonMedia(id))?.video?.status, "ready");
      assert.equal(await handleVideoWebhook(deps, payload), "duplicate");
      // The payload is only a hint: an unknown video or a malformed body changes nothing.
      assert.equal(await handleVideoWebhook(deps, { VideoGuid: "fake-unknown", Status: 4 }), "ignored");
      assert.equal(await handleVideoWebhook(deps, { nothing: true }), "ignored");
      assert.equal(await handleVideoWebhook(deps, null), "ignored");
    });

    test("only admins with a second factor may change media, and every change is audited", async () => {
      const { deps, catalog, audits, lesson } = setup();
      const id = await lesson("roles");
      const refused: [Actor | null, string][] = [[null, "signed_out"], [actor("editor"), "forbidden"], [actor("admin", false), "second_factor_required"]];
      for (const [who, expected] of refused) {
        await assert.rejects(startVideoUpload(deps, who, id), code(expected));
        await assert.rejects(getMedia(deps, who, id), code(expected));
        await assert.rejects(saveCaption(deps, who, id, "he", vtt("x")), code(expected));
        await assert.rejects(startThumbnailUpload(deps, who, id, "image/png"), code(expected));
        await assert.rejects(confirmThumbnail(deps, who, id, "k"), code(expected));
        await assert.rejects(deleteLesson({ ...deps, catalog }, who, id), code(expected));
      }
      const actions = new Set((await audits()).map((entry) => entry.action));
      for (const action of ["media.video.start", "media.video.remove", "media.caption.save", "media.caption.sync", "media.caption.remove", "media.thumbnail.set", "media.thumbnail.remove"]) {
        assert.ok(actions.has(action), action);
      }
    });
  });
}

test("the webhook secret is compared exactly", () => {
  assert.equal(webhookSecretMatches("s3cret", "s3cret"), true);
  assert.equal(webhookSecretMatches("s3cres", "s3cret"), false);
  assert.equal(webhookSecretMatches("s3cret-longer", "s3cret"), false);
  assert.equal(webhookSecretMatches("", ""), false);
  assert.equal(webhookSecretMatches("anything", undefined), false);
});

test("the thumbnail route serves only thumbnail keys", () => {
  const uuid = "0b7e2c4a-9f1d-4e3b-8a6c-5d2f1e0a9b8c";
  assert.equal(thumbnailContentType(`thumbnails/lesson-1/${uuid}.jpg`), "image/jpeg");
  assert.equal(thumbnailContentType(`thumbnails/lesson-1/${uuid}.png`), "image/png");
  assert.equal(thumbnailContentType(`thumbnails/lesson-1/${uuid}.webp`), "image/webp");
  for (const key of [
    "captions/lesson-1/he.vtt",
    `captions/lesson-1/${uuid}.jpg`,
    `thumbnails/../${uuid}.jpg`,
    `thumbnails/lesson-1/../${uuid}.jpg`,
    `thumbnails/lesson-1/${uuid}.gif`,
    `thumbnails/lesson-1/${uuid}.jpg.vtt`,
    "thumbnails/lesson-1/a.jpg",
  ]) {
    assert.equal(thumbnailContentType(key), null, key);
  }
});
