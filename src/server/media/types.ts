import type { AuditEntry } from "../auth/audit";
import type { Locale } from "../i18n/locales";
import type { LessonAccess } from "../repos/types";

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

// Video hosting: upload, encoding status, captions, and the signed address the player
// loads. Who may play is decided by /api/play; this only signs.
export interface MediaProvider {
  createVideo(title: string): Promise<{ videoId: string; libraryId: string }>;
  createUpload(videoId: string): Promise<UploadTarget>;
  // Null when the provider no longer has the video.
  getVideo(videoId: string): Promise<VideoState | null>;
  deleteVideo(videoId: string): Promise<void>;
  putCaption(videoId: string, locale: Locale, label: string, vtt: string): Promise<void>;
  deleteCaption(videoId: string, locale: Locale): Promise<void>;
  // An address the player can load until `expiresAt` (unix seconds). The address is the
  // credential: it is handed out by /api/play only and never rendered into a page.
  playbackUrl(videoId: string, expiresAt: number): Promise<string>;
}

// What the database records about a lesson's media.
export type VideoAsset = {
  videoId: string;
  libraryId: string;
  status: VideoStatus;
  durationSec: number | null;
  thumbnailUrl: string | null;
  readyAt: Date | null;
};
export type Caption = { locale: Locale; key: string; syncedAt: Date | null };
export type LessonMedia = {
  lessonId: string;
  // Hebrew title, used to name the video at the provider.
  title: string;
  published: boolean;
  access: LessonAccess;
  thumbnailKey: string | null;
  video: VideoAsset | null;
  captions: Caption[];
};

// Storage for media records. Rules live in service.ts; implementations only read and write.
export interface MediaRepo {
  // Null when there is no such lesson.
  getLessonMedia(lessonId: string): Promise<LessonMedia | null>;
  findLessonByVideo(videoId: string): Promise<string | null>;
  // Creates or replaces the lesson's video record.
  saveVideo(lessonId: string, video: VideoAsset, raw?: unknown): Promise<void>;
  removeVideo(lessonId: string): Promise<void>;
  setLessonDuration(lessonId: string, durationSec: number): Promise<void>;
  saveCaption(lessonId: string, caption: Caption): Promise<void>;
  removeCaption(lessonId: string, locale: Locale): Promise<void>;
  setThumbnailKey(lessonId: string, key: string | null): Promise<void>;
  // Webhook idempotency: false when this event was already processed.
  claimWebhook(eventId: string, type: string, payload: unknown): Promise<boolean>;
  finishWebhook(eventId: string, error?: string): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

// Small files: caption masters and thumbnails.
export interface FileStorage {
  // For a direct upload from the browser (PUT).
  presignUpload(key: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  // Address of a file anyone may see (thumbnails), served by the app. Captions have their own route.
  publicUrl(key: string): string;
}
