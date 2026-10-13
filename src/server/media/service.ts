import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Actor } from "../auth/actor";
import { admin, fail, notFound, removeEntity, type Result } from "../catalog/service";
import type { AdminCatalogRepo } from "../catalog/types";
import { LOCALES, localeNames, type Locale } from "../i18n/locales";
import type { FileStorage, LessonMedia, MediaProvider, MediaRepo, UploadTarget, VideoAsset } from "./types";

// Lesson media: video upload and encoding status, captions, thumbnail. Like the catalog
// service, every operation is for admins with a verified second factor and is audited.
// Nothing here is about playback: that is /api/play, in Milestone 4.

export type MediaDeps = { repo: MediaRepo; provider: MediaProvider; storage: FileStorage; now?: () => Date };

const MAX_CAPTION_BYTES = 1024 * 1024;
const THUMBNAIL_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const captionKey = (lessonId: string, locale: Locale) => `captions/${lessonId}/${locale}.vtt`;
const isLocale = (value: string): value is Locale => LOCALES.includes(value as Locale);
const providerFailed = fail(502, "provider_failed");

// Removes things at the provider and in file storage after our own records are gone.
// Best-effort: what could not be removed is written to the audit log, and the caller's
// operation still succeeds.
async function cleanUp(deps: MediaDeps, actorId: string, lessonId: string, tasks: [what: string, run: () => Promise<void>][], ip?: string | null) {
  const left: string[] = [];
  for (const [what, run] of tasks) {
    try {
      await run();
    } catch {
      left.push(what);
    }
  }
  if (left.length === 0) return;
  await deps.repo
    .audit({ actorId, action: "media.cleanup_failed", targetType: "lessons", targetId: lessonId, diff: { left }, ip })
    .catch(() => {});
}

// Sends one caption to the video provider. Null when it could not be sent (no finished
// video yet, or the provider failed); it is then sent when the video becomes ready or
// when an admin asks again.
async function sendCaption(deps: MediaDeps, video: VideoAsset | null, locale: Locale, vtt: string): Promise<Date | null> {
  if (video?.status !== "ready") return null;
  try {
    await deps.provider.putCaption(video.videoId, locale, localeNames[locale], vtt);
    return (deps.now ?? (() => new Date()))();
  } catch {
    return null;
  }
}

async function sendPendingCaptions(deps: MediaDeps, media: LessonMedia, video: VideoAsset) {
  for (const caption of media.captions) {
    if (caption.syncedAt) continue;
    const body = await deps.storage.get(caption.key);
    const syncedAt = body && (await sendCaption(deps, video, caption.locale, new TextDecoder().decode(body)));
    if (syncedAt) await deps.repo.saveCaption(media.lessonId, { ...caption, syncedAt });
  }
}

// Starts a new video for the lesson and returns what the browser needs to upload the
// file straight to the provider. A previous video is replaced.
export async function startVideoUpload(
  deps: MediaDeps,
  actor: Actor | null,
  lessonId: string,
  ip?: string | null,
): Promise<Result<{ upload: UploadTarget }>> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  if (!media) return notFound;

  let created: { videoId: string; libraryId: string };
  let upload: UploadTarget;
  try {
    created = await deps.provider.createVideo(media.title || lessonId);
    upload = await deps.provider.createUpload(created.videoId);
  } catch {
    return providerFailed;
  }
  await deps.repo.saveVideo(lessonId, { ...created, status: "created", durationSec: null, thumbnailUrl: null, readyAt: null });
  // The new video has no captions yet: they are sent again once it is ready.
  for (const caption of media.captions) await deps.repo.saveCaption(lessonId, { ...caption, syncedAt: null });
  const old = media.video;
  if (old) await cleanUp(deps, userId, lessonId, [[`video ${old.videoId}`, () => deps.provider.deleteVideo(old.videoId)]], ip);
  await deps.repo.audit({
    actorId: userId,
    action: "media.video.start",
    targetType: "lessons",
    targetId: lessonId,
    diff: { before: old?.videoId ?? null, after: created.videoId },
    ip,
  });
  return { ok: true, upload };
}

// Asks the provider how the video is doing and records it. The only place a video's
// status changes: the admin screen polls through it and the provider's webhook calls it.
// When the video becomes ready the lesson takes its length, and waiting captions are sent.
export async function refreshVideo(deps: MediaDeps, lessonId: string): Promise<LessonMedia | null> {
  const media = await deps.repo.getLessonMedia(lessonId);
  if (!media?.video) return media;
  const before = media.video;
  const state = await deps.provider.getVideo(before.videoId);
  const status = state?.status ?? "error";
  const becameReady = status === "ready" && before.status !== "ready";
  const video: VideoAsset = {
    ...before,
    status,
    durationSec: state?.durationSec ?? before.durationSec,
    thumbnailUrl: state?.thumbnailUrl ?? null,
    readyAt: status === "ready" ? (before.readyAt ?? (deps.now ?? (() => new Date()))()) : null,
  };
  if (status !== before.status || video.durationSec !== before.durationSec || video.thumbnailUrl !== before.thumbnailUrl) {
    await deps.repo.saveVideo(lessonId, video, state?.raw);
  }
  if (becameReady) {
    if (video.durationSec) await deps.repo.setLessonDuration(lessonId, video.durationSec);
    await sendPendingCaptions(deps, media, video);
  }
  return deps.repo.getLessonMedia(lessonId);
}

export async function getMedia(deps: MediaDeps, actor: Actor | null, lessonId: string): Promise<Result<{ media: LessonMedia }>> {
  admin(actor);
  try {
    const media = await refreshVideo(deps, lessonId);
    return media ? { ok: true, media } : notFound;
  } catch {
    return providerFailed;
  }
}

export async function removeVideo(deps: MediaDeps, actor: Actor | null, lessonId: string, ip?: string | null): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  const video = media?.video;
  if (!media || !video) return notFound;
  // A published lesson keeps its video; it can be replaced, or the lesson unpublished.
  if (media.published) return fail(409, "not_draft");
  await deps.repo.removeVideo(lessonId);
  for (const caption of media.captions) await deps.repo.saveCaption(lessonId, { ...caption, syncedAt: null });
  await cleanUp(deps, userId, lessonId, [[`video ${video.videoId}`, () => deps.provider.deleteVideo(video.videoId)]], ip);
  await deps.repo.audit({ actorId: userId, action: "media.video.remove", targetType: "lessons", targetId: lessonId, diff: { before: video.videoId }, ip });
  return { ok: true };
}

// Stores a caption file for one language and sends it to the video provider when there
// is a finished video. `synced` tells the admin whether it got there.
export async function saveCaption(
  deps: MediaDeps,
  actor: Actor | null,
  lessonId: string,
  locale: string,
  file: Uint8Array,
  ip?: string | null,
): Promise<Result<{ synced: boolean }>> {
  const { userId } = admin(actor);
  if (!isLocale(locale)) return notFound;
  let vtt: string;
  try {
    vtt = new TextDecoder("utf-8", { fatal: true }).decode(file).replace(/^﻿/, "");
  } catch {
    return fail(400, "invalid_caption");
  }
  if (file.byteLength > MAX_CAPTION_BYTES || !/^WEBVTT(\s|$)/.test(vtt)) return fail(400, "invalid_caption");
  const media = await deps.repo.getLessonMedia(lessonId);
  if (!media) return notFound;

  const key = captionKey(lessonId, locale);
  await deps.storage.put(key, new TextEncoder().encode(vtt), "text/vtt; charset=utf-8");
  const syncedAt = await sendCaption(deps, media.video, locale, vtt);
  await deps.repo.saveCaption(lessonId, { locale, key, syncedAt });
  await deps.repo.audit({ actorId: userId, action: "media.caption.save", targetType: "lessons", targetId: lessonId, diff: { locale, synced: Boolean(syncedAt) }, ip });
  return { ok: true, synced: Boolean(syncedAt) };
}

// Sends a stored caption to the video provider again.
export async function syncCaption(deps: MediaDeps, actor: Actor | null, lessonId: string, locale: string, ip?: string | null): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  const caption = media?.captions.find((item) => item.locale === locale);
  if (!media || !caption) return notFound;
  if (media.video?.status !== "ready") return fail(409, "video_not_ready");
  const body = await deps.storage.get(caption.key);
  const syncedAt = body && (await sendCaption(deps, media.video, caption.locale, new TextDecoder().decode(body)));
  if (!syncedAt) return providerFailed;
  await deps.repo.saveCaption(lessonId, { ...caption, syncedAt });
  await deps.repo.audit({ actorId: userId, action: "media.caption.sync", targetType: "lessons", targetId: lessonId, diff: { locale }, ip });
  return { ok: true };
}

export async function removeCaption(deps: MediaDeps, actor: Actor | null, lessonId: string, locale: string, ip?: string | null): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  const caption = media?.captions.find((item) => item.locale === locale);
  if (!media || !caption) return notFound;
  await deps.repo.removeCaption(lessonId, caption.locale);
  const video = media.video;
  await cleanUp(
    deps,
    userId,
    lessonId,
    [
      [`file ${caption.key}`, () => deps.storage.delete(caption.key)],
      ...(video ? [[`caption ${locale} of video ${video.videoId}`, () => deps.provider.deleteCaption(video.videoId, caption.locale)] as [string, () => Promise<void>]] : []),
    ],
    ip,
  );
  await deps.repo.audit({ actorId: userId, action: "media.caption.remove", targetType: "lessons", targetId: lessonId, diff: { locale }, ip });
  return { ok: true };
}

// Thumbnail: the browser uploads the image straight to file storage, then confirms.
export async function startThumbnailUpload(
  deps: MediaDeps,
  actor: Actor | null,
  lessonId: string,
  contentType: unknown,
): Promise<Result<{ key: string; upload: { url: string; headers: Record<string, string> } }>> {
  admin(actor);
  const extension = typeof contentType === "string" ? THUMBNAIL_TYPES[contentType] : undefined;
  if (!extension) return fail(400, "unsupported_type");
  if (!(await deps.repo.getLessonMedia(lessonId))) return notFound;
  const key = `thumbnails/${lessonId}/${randomUUID()}.${extension}`;
  return { ok: true, key, upload: await deps.storage.presignUpload(key, contentType as string) };
}

export async function confirmThumbnail(deps: MediaDeps, actor: Actor | null, lessonId: string, key: unknown, ip?: string | null): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  if (!media) return notFound;
  // Only a key this lesson was given, and only once the file is really there.
  if (typeof key !== "string" || !key.startsWith(`thumbnails/${lessonId}/`)) return fail(400, "invalid_body");
  if (!(await deps.storage.exists(key))) return fail(400, "upload_missing");
  await deps.repo.setThumbnailKey(lessonId, key);
  const old = media.thumbnailKey;
  if (old && old !== key) await cleanUp(deps, userId, lessonId, [[`file ${old}`, () => deps.storage.delete(old)]], ip);
  await deps.repo.audit({ actorId: userId, action: "media.thumbnail.set", targetType: "lessons", targetId: lessonId, diff: { before: old, after: key }, ip });
  return { ok: true };
}

// Back to the image the video provider generated.
export async function removeThumbnail(deps: MediaDeps, actor: Actor | null, lessonId: string, ip?: string | null): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  const old = media?.thumbnailKey;
  if (!media || !old) return notFound;
  await deps.repo.setThumbnailKey(lessonId, null);
  await cleanUp(deps, userId, lessonId, [[`file ${old}`, () => deps.storage.delete(old)]], ip);
  await deps.repo.audit({ actorId: userId, action: "media.thumbnail.remove", targetType: "lessons", targetId: lessonId, diff: { before: old }, ip });
  return { ok: true };
}

// Deletes a draft lesson with its media: our records first (the catalog rules decide
// whether it may be deleted at all), then the video and files, best-effort.
export async function deleteLesson(
  deps: MediaDeps & { catalog: AdminCatalogRepo },
  actor: Actor | null,
  lessonId: string,
  ip?: string | null,
): Promise<Result> {
  const { userId } = admin(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  const result = await removeEntity(deps.catalog, actor, "lessons", lessonId, ip);
  if (!result.ok || !media) return result;
  const { video, thumbnailKey } = media;
  await cleanUp(
    deps,
    userId,
    lessonId,
    [
      ...(video ? [[`video ${video.videoId}`, () => deps.provider.deleteVideo(video.videoId)] as [string, () => Promise<void>]] : []),
      ...media.captions.map((caption): [string, () => Promise<void>] => [`file ${caption.key}`, () => deps.storage.delete(caption.key)]),
      ...(thumbnailKey ? [[`file ${thumbnailKey}`, () => deps.storage.delete(thumbnailKey)] as [string, () => Promise<void>]] : []),
    ],
    ip,
  );
  return result;
}

// The secret in the webhook's address, compared in constant time.
export function webhookSecretMatches(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const [a, b] = [Buffer.from(given), Buffer.from(expected)];
  return a.length === b.length && timingSafeEqual(a, b);
}

// The provider's "encoding status changed" call. Its content is only a hint (it is not
// signed): the video is looked up and its real state is fetched from the provider.
export async function handleVideoWebhook(deps: MediaDeps, payload: unknown): Promise<"processed" | "duplicate" | "ignored"> {
  const { VideoGuid: videoId, Status: status } = (payload ?? {}) as { VideoGuid?: unknown; Status?: unknown };
  if (typeof videoId !== "string" || !videoId) return "ignored";
  const eventId = `${videoId}:${String(status)}`;
  if (!(await deps.repo.claimWebhook(eventId, "video.status", payload))) return "duplicate";
  try {
    const lessonId = await deps.repo.findLessonByVideo(videoId);
    if (lessonId) await refreshVideo(deps, lessonId);
    await deps.repo.finishWebhook(eventId);
    return lessonId ? "processed" : "ignored";
  } catch (error) {
    await deps.repo.finishWebhook(eventId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
