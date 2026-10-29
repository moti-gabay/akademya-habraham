import { readFile } from "node:fs/promises";
import path from "node:path";
import { fakeRoutesEnabled } from "@/lib/media";
import { type FakeMediaState, fakeMediaState, PLAYLIST_FILE, rewritePlaylist, verifyFakePlaybackToken } from "@/server/media/fake";

// Fake media only: stands in for the video CDN. Every video plays the same local clip
// (dev-assets/clip, outside public/ so it never ships), and only with a valid token for
// that video id, like the CDN's token authentication. 404 with a real provider or on Vercel.
const CLIP_DIR = path.join(process.cwd(), "dev-assets", "clip");
const SEGMENT = /^seg-\d{2}\.mpegts$/;

const contentType = (file: string) =>
  file === PLAYLIST_FILE ? "application/vnd.apple.mpegurl" : SEGMENT.test(file) ? "video/mp2t" : null;

export async function serveFakePlayback(
  request: Request,
  videoId: string,
  file: string,
  { env = process.env, state = fakeMediaState, now = Date.now }: { env?: Record<string, string | undefined>; state?: FakeMediaState; now?: () => number } = {},
): Promise<Response> {
  if (!fakeRoutesEnabled(env)) return new Response(null, { status: 404 });
  const type = contentType(file);
  if (!type) return new Response(null, { status: 404 });

  const query = new URL(request.url).searchParams;
  const expires = Number(query.get("expires"));
  const token = query.get("token") ?? "";
  if (!verifyFakePlaybackToken(state, videoId, expires, token, now)) return new Response(null, { status: 403 });

  const bytes = await readFile(path.join(CLIP_DIR, file)).catch(() => null);
  if (!bytes) return new Response(null, { status: 404 });
  const body = file === PLAYLIST_FILE ? rewritePlaylist(bytes.toString("utf8"), `expires=${expires}&token=${encodeURIComponent(token)}`) : bytes;
  return new Response(body as BodyInit, {
    headers: { "content-type": type, "x-content-type-options": "nosniff", "cache-control": "private, no-store" },
  });
}
