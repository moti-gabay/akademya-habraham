import { randomUUID } from "node:crypto";
import type { Locale } from "../i18n/locales";
import type { FileStorage, MediaProvider, VideoState } from "./types";

// Stand-ins that need no keys and no network. Like the mock repos they keep their state
// in memory (on globalThis, so route handlers and pages share it) and reset on restart.
// Video bytes are only counted; small files are kept so they can be served back.

export type FakeMediaState = {
  videos: Map<string, { title: string; uploadedAt: number | null; bytes: number; captions: Map<Locale, string> }>;
  files: Map<string, { body: Uint8Array; contentType: string }>;
};
export const createFakeMediaState = (): FakeMediaState => ({ videos: new Map(), files: new Map() });

const globalState = globalThis as { __fakeMedia?: FakeMediaState };
export const fakeMediaState = (globalState.__fakeMedia ??= createFakeMediaState());

// Every fake id carries this prefix, so a fake video can never be mistaken for a real one.
export const FAKE_VIDEO_PREFIX = "fake-";
export const FAKE_LIBRARY_ID = "fake-library";
const FAKE_DURATION_SEC = 10 * 60 + 34;
const FAKE_THUMBNAIL = "/samples/thumbnail.svg";

export type FakeMediaProvider = MediaProvider & {
  // Called by the local upload route when the browser has sent the file.
  receiveUpload(videoId: string, bytes: number): boolean;
};

// "Encoding" takes `processingMs` after the upload, then the video is ready.
export function createFakeMediaProvider(state: FakeMediaState, { now = Date.now, processingMs = 3000 } = {}): FakeMediaProvider {
  const video = (videoId: string) => {
    const found = state.videos.get(videoId);
    if (!found) throw new Error(`Unknown fake video ${videoId}`);
    return found;
  };
  return {
    async createVideo(title) {
      const videoId = `${FAKE_VIDEO_PREFIX}${randomUUID()}`;
      state.videos.set(videoId, { title, uploadedAt: null, bytes: 0, captions: new Map() });
      return { videoId, libraryId: FAKE_LIBRARY_ID };
    },
    async createUpload(videoId) {
      video(videoId);
      return { protocol: "put", url: `/api/dev/media/video/${videoId}` };
    },
    async getVideo(videoId): Promise<VideoState | null> {
      const found = state.videos.get(videoId);
      if (!found) return null;
      const raw = { fake: true, bytes: found.bytes };
      if (found.uploadedAt === null) return { status: "created", durationSec: null, thumbnailUrl: null, raw };
      return now() - found.uploadedAt < processingMs
        ? { status: "processing", durationSec: null, thumbnailUrl: null, raw }
        : { status: "ready", durationSec: FAKE_DURATION_SEC, thumbnailUrl: FAKE_THUMBNAIL, raw };
    },
    async deleteVideo(videoId) {
      state.videos.delete(videoId);
    },
    async putCaption(videoId, locale, _label, vtt) {
      video(videoId).captions.set(locale, vtt);
    },
    async deleteCaption(videoId, locale) {
      state.videos.get(videoId)?.captions.delete(locale);
    },
    receiveUpload(videoId, bytes) {
      const found = state.videos.get(videoId);
      if (!found) return false;
      found.bytes = bytes;
      found.uploadedAt = now();
      return true;
    },
  };
}

export const fakeFileUrl = (key: string) => `/api/dev/media/files/${key.split("/").map(encodeURIComponent).join("/")}`;

export function createFakeFileStorage(state: FakeMediaState): FileStorage {
  return {
    async presignUpload(key) {
      return { url: fakeFileUrl(key), headers: {} };
    },
    async put(key, body, contentType) {
      state.files.set(key, { body, contentType });
    },
    async get(key) {
      return state.files.get(key)?.body ?? null;
    },
    async exists(key) {
      return state.files.has(key);
    },
    async delete(key) {
      state.files.delete(key);
    },
    publicUrl: fakeFileUrl,
  };
}
