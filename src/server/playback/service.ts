import { type Actor, requireActor } from "../auth/actor";
import { canWatch as canWatchLesson } from "../catalog/access";
import { fail, notFound, type Result } from "../catalog/service";
import type { MediaProvider, MediaRepo } from "../media/types";

// Who may play what. The only way to a video address is startPlayback, which checks in
// this order: a signed-in actor, a published lesson, canWatch, a ready video. Then the
// provider signs an address that expires. Same-origin is checked before this runs, in
// the proxy, like every mutating API call. Nothing here asks the provider for the
// video's state (that is refreshVideo, in the media service) and nothing is written.

export const PLAYBACK_TTL_SEC = 2 * 60 * 60;

export type PlaybackDeps = {
  repo: Pick<MediaRepo, "getLessonMedia">;
  // Only the signing method: the provider's state calls are out of reach by type.
  provider: Pick<MediaProvider, "playbackUrl">;
  canWatch?: typeof canWatchLesson;
  now?: () => Date;
};

// `expiresAt` is ISO 8601; clients must ignore fields they do not know (a session id
// may be added with the device limit).
export type Playback = { url: string; expiresAt: string };

export async function startPlayback(deps: PlaybackDeps, actor: Actor | null, lessonId: string): Promise<Result<Playback>> {
  const { userId } = requireActor(actor);
  const media = await deps.repo.getLessonMedia(lessonId);
  if (!media?.published) return notFound;
  if (!(deps.canWatch ?? canWatchLesson)({ userId }, media)) return fail(403, "members_only");
  if (media.video?.status !== "ready") return fail(409, "video_not_ready");

  const expires = Math.floor((deps.now ?? (() => new Date()))().getTime() / 1000) + PLAYBACK_TTL_SEC;
  try {
    const url = await deps.provider.playbackUrl(media.video.videoId, expires);
    return { ok: true, url, expiresAt: new Date(expires * 1000).toISOString() };
  } catch (error) {
    // The adapters' messages name an operation or a variable, never a key or an address.
    console.error("Signing a playback address failed:", error instanceof Error ? error.message : error);
    return fail(502, "provider_failed");
  }
}
