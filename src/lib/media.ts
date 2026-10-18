import { fileStorageName, getFileStorage, getMediaProvider, mediaProviderName } from "@/server/media";
import { createFakeMediaProvider, fakeMediaState } from "@/server/media/fake";
import type { MediaDeps } from "@/server/media/service";
import { sampleSubtitles } from "@/server/media/sample";
import { mediaRepo, type Lesson } from "@/server/repos";

// What the media service works with in this deployment.
export const mediaDeps = (): MediaDeps => ({ repo: mediaRepo, provider: getMediaProvider(), storage: getFileStorage() });

// The thumbnail of a lesson: the uploaded image, else the one the video provider made.
export const lessonThumbnailUrl = (lesson: Pick<Lesson, "thumbnailKey" | "videoThumbnailUrl">): string | null =>
  lesson.thumbnailKey ? getFileStorage().publicUrl(lesson.thumbnailKey) : lesson.videoThumbnailUrl;

// Subtitle tracks for the player: the uploaded captions, served by the app, or the
// sample files while a lesson has none.
export const lessonSubtitles = (lesson: Pick<Lesson, "id" | "captions">) =>
  lesson.captions.length > 0
    ? lesson.captions.map((locale) => ({ locale, url: `/api/captions/${lesson.id}/${locale}` }))
    : sampleSubtitles;

// True when no real media service is configured. The fake's own routes (/api/dev/media)
// exist only then, and never on Vercel.
type Env = Record<string, string | undefined>;
export const fakeMediaActive = (env: Env = process.env) => mediaProviderName(env) === "fake" && fileStorageName(env) === "fake";
export const fakeRoutesEnabled = (env: Env = process.env) => fakeMediaActive(env) && !env.VERCEL;
export const fakeProvider = () => createFakeMediaProvider(fakeMediaState);
