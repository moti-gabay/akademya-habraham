import { and, asc, eq } from "drizzle-orm";
import { writeAudit } from "../auth/audit";
import type { MediaRepo } from "../media/types";
import type { Db } from "./client";
import * as t from "./schema";
import { isUuid } from "./uuid";

// Drizzle implementation of the media records.
export function createDrizzleMediaRepo(getDb: () => Db): MediaRepo {
  const webhook = (eventId: string) => and(eq(t.webhookEvents.provider, "bunny"), eq(t.webhookEvents.eventId, eventId));

  return {
    async getLessonMedia(lessonId) {
      if (!isUuid(lessonId)) return null;
      const db = getDb();
      const [lesson] = await db
        .select({ thumbnailKey: t.lessons.thumbnailKey, title: t.lessonTranslations.title })
        .from(t.lessons)
        .leftJoin(t.lessonTranslations, and(eq(t.lessonTranslations.lessonId, t.lessons.id), eq(t.lessonTranslations.locale, "he")))
        .where(eq(t.lessons.id, lessonId))
        .limit(1);
      if (!lesson) return null;
      const [video] = await db.select().from(t.videoAssets).where(eq(t.videoAssets.lessonId, lessonId)).limit(1);
      const captions = await db
        .select({ locale: t.lessonSubtitles.locale, key: t.lessonSubtitles.r2Key, syncedAt: t.lessonSubtitles.bunnySyncedAt })
        .from(t.lessonSubtitles)
        .where(eq(t.lessonSubtitles.lessonId, lessonId))
        .orderBy(asc(t.lessonSubtitles.locale));
      return {
        lessonId,
        title: lesson.title ?? "",
        thumbnailKey: lesson.thumbnailKey,
        video: video
          ? {
              videoId: video.bunnyVideoId,
              libraryId: video.bunnyLibraryId,
              status: video.status,
              durationSec: video.durationSec,
              thumbnailUrl: video.thumbnailUrl,
              readyAt: video.readyAt,
            }
          : null,
        captions,
      };
    },

    async findLessonByVideo(videoId) {
      const [row] = await getDb()
        .select({ lessonId: t.videoAssets.lessonId })
        .from(t.videoAssets)
        .where(eq(t.videoAssets.bunnyVideoId, videoId))
        .limit(1);
      return row?.lessonId ?? null;
    },

    async saveVideo(lessonId, video, raw) {
      const values = {
        bunnyVideoId: video.videoId,
        bunnyLibraryId: video.libraryId,
        status: video.status,
        durationSec: video.durationSec,
        thumbnailUrl: video.thumbnailUrl,
        readyAt: video.readyAt,
        raw: raw ?? null,
      };
      await getDb()
        .insert(t.videoAssets)
        .values({ lessonId, ...values })
        .onConflictDoUpdate({ target: t.videoAssets.lessonId, set: values });
    },

    async removeVideo(lessonId) {
      if (isUuid(lessonId)) await getDb().delete(t.videoAssets).where(eq(t.videoAssets.lessonId, lessonId));
    },

    async setLessonDuration(lessonId, durationSec) {
      await getDb().update(t.lessons).set({ durationSec }).where(eq(t.lessons.id, lessonId));
    },

    async saveCaption(lessonId, caption) {
      const values = { r2Key: caption.key, bunnySyncedAt: caption.syncedAt, updatedAt: new Date() };
      await getDb()
        .insert(t.lessonSubtitles)
        .values({ lessonId, locale: caption.locale, ...values })
        .onConflictDoUpdate({ target: [t.lessonSubtitles.lessonId, t.lessonSubtitles.locale], set: values });
    },

    async removeCaption(lessonId, locale) {
      await getDb()
        .delete(t.lessonSubtitles)
        .where(and(eq(t.lessonSubtitles.lessonId, lessonId), eq(t.lessonSubtitles.locale, locale)));
    },

    async setThumbnailKey(lessonId, key) {
      await getDb().update(t.lessons).set({ thumbnailKey: key }).where(eq(t.lessons.id, lessonId));
    },

    // Same idempotency as the Clerk webhook: the event is recorded first, and one that
    // was already processed is skipped.
    async claimWebhook(eventId, type, payload) {
      const db = getDb();
      await db.insert(t.webhookEvents).values({ provider: "bunny", eventId, type, payload }).onConflictDoNothing();
      const [stored] = await db.select({ processedAt: t.webhookEvents.processedAt }).from(t.webhookEvents).where(webhook(eventId)).limit(1);
      return !stored?.processedAt;
    },

    async finishWebhook(eventId, error) {
      await getDb()
        .update(t.webhookEvents)
        .set(error === undefined ? { processedAt: new Date(), error: null } : { error })
        .where(webhook(eventId));
    },

    audit: (entry) => writeAudit(getDb(), entry),
  };
}
