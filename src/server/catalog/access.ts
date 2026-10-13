import type { LessonAccess } from "../repos/types";

// Whether the player is shown. This is UI-level gating only: nothing here protects the
// video itself. Real enforcement belongs in /api/play (Milestone 4).
export function canWatch(actor: { userId: string } | null, lesson: { access: LessonAccess }): boolean {
  if (!actor) return false;
  if (lesson.access === "free") return true;
  // TODO(Milestone 5, billing): require an active subscription. Until billing exists,
  // every signed-in user counts as subscribed.
  return true;
}
