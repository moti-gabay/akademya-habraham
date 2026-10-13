import type { Locale } from "../i18n/locales";

// Media sits behind two interfaces, so the app runs with no external account: the
// fakes in fake.ts are the default, and the real adapters are opt-in (see index.ts).

export const VIDEO_STATUSES = ["created", "uploading", "processing", "ready", "error"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

// What the browser needs to send a video file straight to the provider.
export type UploadTarget =
  | { protocol: "tus"; endpoint: string; headers: Record<string, string> }
  | { protocol: "put"; url: string };

export type VideoState = {
  status: VideoStatus;
  durationSec: number | null;
  // The thumbnail the provider generated, if any.
  thumbnailUrl: string | null;
  raw: unknown;
};

// Video hosting: upload, encoding status, captions. Playback is not part of this
// interface; signed playback comes with /api/play (Milestone 4).
export interface MediaProvider {
  createVideo(title: string): Promise<{ videoId: string; libraryId: string }>;
  createUpload(videoId: string): Promise<UploadTarget>;
  // Null when the provider no longer has the video.
  getVideo(videoId: string): Promise<VideoState | null>;
  deleteVideo(videoId: string): Promise<void>;
  putCaption(videoId: string, locale: Locale, label: string, vtt: string): Promise<void>;
  deleteCaption(videoId: string, locale: Locale): Promise<void>;
}

// Small files: caption masters and thumbnails.
export interface FileStorage {
  // For a direct upload from the browser (PUT).
  presignUpload(key: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  // Only for files anyone may see (thumbnails). Captions are served by the app.
  publicUrl(key: string): string;
}
