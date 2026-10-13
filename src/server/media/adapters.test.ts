// pnpm test:unit — the media adapters, with no account and no network: the fakes as
// they are, the real ones against a recording stand-in for fetch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createBunnyMediaProvider } from "./bunny";
import { createFakeFileStorage, createFakeMediaProvider, createFakeMediaState, FAKE_VIDEO_PREFIX } from "./fake";
import { fileStorageName, getFileStorage, getMediaProvider, mediaProviderName } from "./index";
import { createR2FileStorage } from "./r2";
import { presignUrl } from "./sigv4";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
// Answers each request from `reply` and records it.
function recorder(reply: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { calls, fetchFn };
}

test("the fake video goes created → processing → ready, and its ids are marked as fake", async () => {
  let clock = 1_000;
  const state = createFakeMediaState();
  const provider = createFakeMediaProvider(state, { now: () => clock, processingMs: 3000 });
  const { videoId } = await provider.createVideo("שיעור");
  assert.ok(videoId.startsWith(FAKE_VIDEO_PREFIX));
  assert.deepEqual(await provider.createUpload(videoId), { protocol: "put", url: `/api/dev/media/video/${videoId}` });
  assert.equal((await provider.getVideo(videoId))?.status, "created");

  assert.equal(provider.receiveUpload(videoId, 1234), true);
  assert.equal(provider.receiveUpload("fake-unknown", 1), false);
  assert.equal((await provider.getVideo(videoId))?.status, "processing");
  clock += 3000;
  const ready = await provider.getVideo(videoId);
  assert.deepEqual([ready?.status, ready?.durationSec, ready?.thumbnailUrl], ["ready", 634, "/samples/thumbnail.svg"]);

  await provider.putCaption(videoId, "he", "עברית", "WEBVTT");
  assert.equal(state.videos.get(videoId)?.captions.get("he"), "WEBVTT");
  await provider.deleteVideo(videoId);
  assert.equal(await provider.getVideo(videoId), null);
  await assert.rejects(provider.putCaption(videoId, "he", "עברית", "WEBVTT"));
});

test("the fake file storage keeps and returns small files", async () => {
  const storage = createFakeFileStorage(createFakeMediaState());
  const body = new TextEncoder().encode("WEBVTT");
  assert.equal(await storage.exists("captions/a/he.vtt"), false);
  await storage.put("captions/a/he.vtt", body, "text/vtt");
  assert.deepEqual(await storage.get("captions/a/he.vtt"), body);
  assert.equal(storage.publicUrl("thumbnails/a b.jpg"), "/api/dev/media/files/thumbnails/a%20b.jpg");
  assert.equal((await storage.presignUpload("thumbnails/x.jpg", "image/jpeg")).url, "/api/dev/media/files/thumbnails/x.jpg");
  await storage.delete("captions/a/he.vtt");
  assert.equal(await storage.get("captions/a/he.vtt"), null);
});

test("presigned URLs match the example in the AWS Signature Version 4 documentation", () => {
  // "Authenticating Requests: Using Query Parameters", Amazon S3 API reference.
  const url = presignUrl({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expiresSec: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });
  assert.equal(
    url,
    "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
      "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

test("R2 storage signs every request and never puts the secret in an address", async () => {
  const config = { accountId: "acct", accessKeyId: "key-id", secretAccessKey: "very-secret", bucket: "media", publicUrl: "https://files.example.com" };
  const { calls, fetchFn } = recorder((call) => new Response(call.method === "GET" ? "WEBVTT" : null, { status: call.url.includes("missing") ? 404 : 200 }));
  const storage = createR2FileStorage(config, fetchFn, () => new Date("2026-10-14T10:00:00Z"));

  const upload = await storage.presignUpload("thumbnails/l1/a.jpg", "image/jpeg");
  assert.match(upload.url, /^https:\/\/acct\.r2\.cloudflarestorage\.com\/media\/thumbnails\/l1\/a\.jpg\?X-Amz-Algorithm=AWS4-HMAC-SHA256&/);
  assert.match(upload.url, /X-Amz-Credential=key-id%2F20261014%2Fauto%2Fs3%2Faws4_request/);
  assert.match(upload.url, /X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=[0-9a-f]{64}$/);
  assert.deepEqual(upload.headers, { "content-type": "image/jpeg" });
  assert.equal(calls.length, 0);

  await storage.put("captions/l1/he.vtt", new TextEncoder().encode("WEBVTT"), "text/vtt");
  assert.equal(new TextDecoder().decode((await storage.get("captions/l1/he.vtt"))!), "WEBVTT");
  assert.equal(await storage.get("captions/missing.vtt"), null);
  assert.equal(await storage.exists("captions/l1/he.vtt"), true);
  assert.equal(await storage.exists("captions/missing.vtt"), false);
  await storage.delete("captions/l1/he.vtt");
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET", "GET", "HEAD", "HEAD", "DELETE"]);
  for (const call of calls) {
    assert.match(call.url, /X-Amz-Signature=[0-9a-f]{64}$/);
    assert.doesNotMatch(call.url, /very-secret/);
  }
  assert.equal(storage.publicUrl("thumbnails/l1/a b.jpg"), "https://files.example.com/thumbnails/l1/a%20b.jpg");

  const failing = createR2FileStorage(config, recorder(() => new Response("denied: very-secret", { status: 403 })).fetchFn);
  await assert.rejects(failing.put("x", new Uint8Array(), "text/vtt"), (error: Error) => error.message === "File storage PUT failed: 403");
});

test("the Bunny adapter sends the documented requests and keeps the API key on the server", async () => {
  const config = { libraryId: "777", apiKey: "api-key", pullZoneHost: "vz-test.example.net" };
  let status = 2;
  const { calls, fetchFn } = recorder((call) => {
    if (call.url.endsWith("/videos") && call.method === "POST") return Response.json({ guid: "vid-1" });
    if (call.url.endsWith("/videos/gone")) return new Response(null, { status: 404 });
    if (call.method === "GET") return Response.json({ status, length: 2534.6, thumbnailFileName: "thumbnail.jpg" });
    return Response.json({ success: true });
  });
  const provider = createBunnyMediaProvider(config, fetchFn, () => 1_800_000_000_000);

  assert.deepEqual(await provider.createVideo("Lesson"), { videoId: "vid-1", libraryId: "777" });
  assert.deepEqual([calls[0].url, calls[0].method, calls[0].body], ["https://video.bunnycdn.com/library/777/videos", "POST", { title: "Lesson" }]);
  assert.equal(calls[0].headers.AccessKey, "api-key");

  // The browser gets a signature for this one video, valid for an hour, not the key.
  const upload = await provider.createUpload("vid-1");
  const expires = 1_800_000_000 + 3600;
  assert.deepEqual(upload, {
    protocol: "tus",
    endpoint: "https://video.bunnycdn.com/tusupload",
    headers: {
      AuthorizationSignature: createHash("sha256").update(`777api-key${expires}vid-1`).digest("hex"),
      AuthorizationExpire: String(expires),
      VideoId: "vid-1",
      LibraryId: "777",
    },
  });
  assert.doesNotMatch(JSON.stringify(upload), /api-key/);

  assert.deepEqual([(await provider.getVideo("vid-1"))?.status, (await provider.getVideo("vid-1"))?.thumbnailUrl], ["processing", null]);
  status = 4;
  const ready = await provider.getVideo("vid-1");
  assert.deepEqual([ready?.status, ready?.durationSec, ready?.thumbnailUrl], ["ready", 2535, "https://vz-test.example.net/vid-1/thumbnail.jpg"]);
  for (const [code, expected] of [[0, "created"], [1, "processing"], [3, "processing"], [5, "error"], [6, "error"], [9, "processing"]] as const) {
    status = code;
    assert.equal((await provider.getVideo("vid-1"))?.status, expected, String(code));
  }
  assert.equal(await provider.getVideo("gone"), null);

  await provider.putCaption("vid-1", "he", "עברית", "WEBVTT\n");
  const caption = calls.at(-1)!;
  assert.deepEqual([caption.url, caption.method], ["https://video.bunnycdn.com/library/777/videos/vid-1/captions/he", "POST"]);
  assert.deepEqual(caption.body, { srclang: "he", label: "עברית", captionsFile: Buffer.from("WEBVTT\n").toString("base64") });
  await provider.deleteCaption("vid-1", "he");
  await provider.deleteVideo("gone");
  assert.deepEqual(calls.slice(-2).map((call) => call.method), ["DELETE", "DELETE"]);

  const failing = createBunnyMediaProvider(config, recorder(() => new Response("bad key api-key", { status: 401 })).fetchFn);
  await assert.rejects(failing.createVideo("x"), (error: Error) => error.message === "Video provider create failed: 401");
});

test("the real services are opt-in, and a missing key is named without showing any value", () => {
  assert.deepEqual([mediaProviderName({}), fileStorageName({})], ["fake", "fake"]);
  // Keys alone select nothing.
  assert.equal(mediaProviderName({ BUNNY_API_KEY: "k", BUNNY_LIBRARY_ID: "1" }), "fake");
  assert.equal(fileStorageName({ R2_BUCKET: "b" }), "fake");
  assert.deepEqual([mediaProviderName({ MEDIA_PROVIDER: "bunny" }), fileStorageName({ FILE_STORAGE: "r2" })], ["bunny", "r2"]);

  assert.throws(() => getMediaProvider({ MEDIA_PROVIDER: "bunny", BUNNY_LIBRARY_ID: "1" }), /^Error: BUNNY_API_KEY is not set$/);
  assert.throws(
    () => getFileStorage({ FILE_STORAGE: "r2", R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "id-value" }),
    (error: Error) => error.message === "R2_SECRET_ACCESS_KEY is not set" && !error.message.includes("id-value"),
  );
  assert.ok(getMediaProvider({}) && getFileStorage({}));
});
