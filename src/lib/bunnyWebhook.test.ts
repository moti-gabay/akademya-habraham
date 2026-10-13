// pnpm test:unit — the Bunny webhook address: right secret processed once, wrong secret
// or wrong provider answers as if it did not exist. Fake provider, mock records.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockRepos } from "@/server/mock/repos";
import { buildStore } from "@/server/mock/store";
import { createFakeFileStorage, createFakeMediaProvider, createFakeMediaState } from "@/server/media/fake";
import type { MediaDeps } from "@/server/media/service";
import { handleBunnyWebhook } from "./bunnyWebhook";

const env = { MEDIA_PROVIDER: "bunny", BUNNY_WEBHOOK_SECRET: "long-random-secret" };
const LESSON = "shabbat-6";

function setup() {
  const store = buildStore();
  const state = createFakeMediaState();
  const provider = createFakeMediaProvider(state, { processingMs: 0 });
  const deps: MediaDeps = { repo: createMockRepos(store).mediaRepo, provider, storage: createFakeFileStorage(state) };
  let built = 0;
  const call = (secret: string, body: unknown, withEnv: Record<string, string | undefined> = env) =>
    handleBunnyWebhook(
      // No cookie, no Origin: this is how the provider calls.
      new Request("https://app.example.com/api/webhooks/bunny/x", { method: "POST", body: JSON.stringify(body) }),
      secret,
      () => (built++, deps),
      withEnv,
    );
  return { store, provider, deps, call, built: () => built };
}

test("the right secret processes the event once, also when it is delivered again", async () => {
  const { store, provider, deps, call } = setup();
  const { videoId, libraryId } = await provider.createVideo("lesson");
  await deps.repo.saveVideo(LESSON, { videoId, libraryId, status: "processing", durationSec: null, thumbnailUrl: null, readyAt: null });
  provider.receiveUpload(videoId, 10);
  const payload = { VideoLibraryId: 1, VideoGuid: videoId, Status: 4 };

  const first = await call(env.BUNNY_WEBHOOK_SECRET, payload);
  assert.deepEqual([first.status, await first.json()], [200, { result: "processed" }]);
  assert.equal(store.videos.get(LESSON)?.status, "ready");

  store.videos.get(LESSON)!.status = "processing";
  const again = await call(env.BUNNY_WEBHOOK_SECRET, payload);
  assert.deepEqual([again.status, await again.json()], [200, { result: "duplicate" }]);
  assert.equal(store.videos.get(LESSON)?.status, "processing");
});

test("a wrong secret, or another provider, gets a 404 and touches nothing", async () => {
  const { store, call, built } = setup();
  const payload = { VideoGuid: store.videos.get(LESSON)!.videoId, Status: 5 };
  assert.equal((await call("wrong-secret", payload)).status, 404);
  assert.equal((await call("", payload)).status, 404);
  assert.equal((await call(env.BUNNY_WEBHOOK_SECRET, payload, { BUNNY_WEBHOOK_SECRET: env.BUNNY_WEBHOOK_SECRET })).status, 404);
  assert.equal((await call("undefined", payload, { MEDIA_PROVIDER: "bunny" })).status, 404);
  assert.equal(store.videos.get(LESSON)?.status, "ready");
  assert.equal(store.webhooks.size, 0);
  // The provider is not even constructed (it would need keys).
  assert.equal(built(), 0);
});

test("a body that is not JSON, or names no video, is ignored", async () => {
  const { deps, call } = setup();
  const raw = new Request("https://app.example.com/api/webhooks/bunny/x", { method: "POST", body: "not json" });
  assert.deepEqual(await (await handleBunnyWebhook(raw, env.BUNNY_WEBHOOK_SECRET, () => deps, env)).json(), { result: "ignored" });
  assert.deepEqual(await (await call(env.BUNNY_WEBHOOK_SECRET, { VideoGuid: 7 })).json(), { result: "ignored" });
});
