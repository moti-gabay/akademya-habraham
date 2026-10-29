// pnpm test:unit — the fake video CDN: the local clip plays only with a valid token for
// that video, the playlist carries the token into every segment, and the address does
// not exist on Vercel or with a real provider.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeMediaProvider, createFakeMediaState } from "@/server/media/fake";
import { serveFakePlayback } from "./fakePlayback";

const NOW_MS = 1_800_000_000_000;
const VIDEO = "fake-sample-shabbat-6";

async function setup() {
  const state = createFakeMediaState();
  const expires = NOW_MS / 1000 + 7200;
  const url = new URL(await createFakeMediaProvider(state).playbackUrl(VIDEO, expires), "http://localhost:3000");
  const token = url.searchParams.get("token")!;
  const serve = (videoId: string, file: string, query: string, env: Record<string, string> = {}, now = () => NOW_MS) =>
    serveFakePlayback(new Request(`http://localhost:3000/api/dev/media/play/${videoId}/${file}?${query}`), videoId, file, { env, state, now });
  return { url, token, expires, serve };
}

test("the playlist and its segments are served with a valid token, and every segment line carries it", async () => {
  const { token, expires, serve } = await setup();
  const query = `expires=${expires}&token=${token}`;
  const playlist = await serve(VIDEO, "playlist.m3u8", query);
  assert.equal(playlist.status, 200);
  assert.equal(playlist.headers.get("content-type"), "application/vnd.apple.mpegurl");
  assert.equal(playlist.headers.get("cache-control"), "private, no-store");
  const lines = (await playlist.text()).split("\n").filter((line) => line && !line.startsWith("#"));
  assert.ok(lines.length >= 2);
  for (const line of lines) assert.match(line, new RegExp(`^seg-\\d{2}\\.mpegts\\?expires=${expires}&token=${token}$`));

  const segment = await serve(VIDEO, "seg-00.mpegts", query);
  assert.equal(segment.status, 200);
  assert.equal(segment.headers.get("content-type"), "video/mp2t");
  assert.ok((await segment.arrayBuffer()).byteLength > 1000);
});

test("anything but a valid, unexpired token for this video is refused", async () => {
  const { token, expires, serve } = await setup();
  assert.equal((await serve(VIDEO, "playlist.m3u8", `expires=${expires}&token=${token}x`)).status, 403, "tampered");
  assert.equal((await serve(VIDEO, "playlist.m3u8", `expires=${expires + 1}&token=${token}`)).status, 403, "other expiry");
  assert.equal((await serve("fake-other", "playlist.m3u8", `expires=${expires}&token=${token}`)).status, 403, "other video");
  assert.equal((await serve(VIDEO, "playlist.m3u8", "")).status, 403, "no token");
  assert.equal((await serve(VIDEO, "playlist.m3u8", `expires=${expires}&token=${token}`, {}, () => (expires + 1) * 1000)).status, 403, "expired");
  // Only the clip's own files, never anything else on disk.
  assert.equal((await serve(VIDEO, "../README.md", `expires=${expires}&token=${token}`)).status, 404);
  assert.equal((await serve(VIDEO, "seg-99.mpegts", `expires=${expires}&token=${token}`)).status, 404);
});

test("the fake CDN does not exist on Vercel or with a real provider", async () => {
  const { token, expires, serve } = await setup();
  const query = `expires=${expires}&token=${token}`;
  assert.equal((await serve(VIDEO, "playlist.m3u8", query, { VERCEL: "1" })).status, 404);
  assert.equal((await serve(VIDEO, "playlist.m3u8", query, { MEDIA_PROVIDER: "bunny" })).status, 404);
});
