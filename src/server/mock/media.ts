import { byLocale } from "../i18n/locales";
import type { MediaRepo } from "../media/types";
import type { MockStore } from "./store";

// In-memory media records, next to the mock catalog they belong to.
export function createMockMediaRepo(store: MockStore): MediaRepo {
  return {
    async getLessonMedia(lessonId) {
      const lesson = store.lessons.get(lessonId);
      if (!lesson) return null;
      return structuredClone({
        lessonId,
        title: lesson.translations.he.title,
        published: lesson.status === "published",
        access: lesson.access,
        thumbnailKey: lesson.thumbnailKey,
        video: store.videos.get(lessonId) ?? null,
        captions: [...(store.captions.get(lessonId) ?? [])].sort((a, b) => byLocale(a.locale, b.locale)),
      });
    },
    async findLessonByVideo(videoId) {
      for (const [lessonId, video] of store.videos) if (video.videoId === videoId) return lessonId;
      return null;
    },
    async saveVideo(lessonId, video) {
      store.videos.set(lessonId, { ...video });
    },
    async removeVideo(lessonId) {
      store.videos.delete(lessonId);
    },
    async setLessonDuration(lessonId, durationSec) {
      const lesson = store.lessons.get(lessonId);
      if (lesson) lesson.durationSec = durationSec;
    },
    async saveCaption(lessonId, caption) {
      const rest = (store.captions.get(lessonId) ?? []).filter((item) => item.locale !== caption.locale);
      store.captions.set(lessonId, [...rest, { ...caption }]);
    },
    async removeCaption(lessonId, locale) {
      store.captions.set(lessonId, (store.captions.get(lessonId) ?? []).filter((item) => item.locale !== locale));
    },
    async setThumbnailKey(lessonId, key) {
      const lesson = store.lessons.get(lessonId);
      if (lesson) lesson.thumbnailKey = key;
    },
    async claimWebhook(eventId) {
      const event = store.webhooks.get(eventId) ?? { processed: false };
      store.webhooks.set(eventId, event);
      return !event.processed;
    },
    async finishWebhook(eventId, error) {
      if (error === undefined) store.webhooks.set(eventId, { processed: true });
    },
    async audit(entry) {
      store.audit.push(entry);
    },
  };
}
