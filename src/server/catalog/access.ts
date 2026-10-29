import type { LessonAccess } from "../repos/types";

// Who may watch a lesson. Enforced in /api/play (the only way to a video address) and in
// /api/captions; the lesson page uses it to show the preview card instead of the player.
export function canWatch(actor: { userId: string } | null, lesson: { access: LessonAccess }): boolean {
  if (!actor) return false;
  if (lesson.access === "free") return true;
  // TODO(Milestone 5, billing): require an active subscription. Until billing exists,
  // every signed-in user counts as subscribed.
  return true;
}
