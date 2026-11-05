import type { PathStep, StepDetail, StepLesson, StepStatus } from "../repos/types";

// The learning path's rules, shared by the database and mock repos so the two cannot
// disagree. Only published lessons count; drafts are invisible to the learner.

// A lesson counts as finished from this share watched on; it never goes back.
export const COMPLETED_AT_PCT = 95;

// Completed = every published lesson done; in progress = some watched; the first
// untouched step that has lessons is "up next", and the rest come later.
export function stepStatuses(rows: { total: number; started: number; done: number }[]): StepStatus[] {
  let upNextGiven = false;
  return rows.map((row) => {
    if (row.total > 0 && row.done === row.total) return "completed";
    if (row.started > 0) return "in_progress";
    if (row.total > 0 && !upNextGiven) {
      upNextGiven = true;
      return "up_next";
    }
    return "later";
  });
}

export type StepLessonRow = Omit<StepLesson, "number" | "isNext">;

// A step's page. Null for an unknown step or one with no published lesson yet.
export async function stepDetail(
  steps: PathStep[],
  stepId: string,
  lessonsOf: (stepId: string) => Promise<StepLessonRow[]>,
): Promise<StepDetail | null> {
  const index = steps.findIndex((step) => step.id === stepId && step.available);
  if (index < 0) return null;
  const step = steps[index];
  const rows = await lessonsOf(step.id);
  const next = rows.findIndex((row) => row.ready && row.state !== "done");
  const nextStep = steps.slice(index + 1).find((item) => item.available);
  return {
    id: step.id,
    number: step.number,
    name: step.name,
    lessonsDone: step.lessonsDone,
    lessonsTotal: step.lessonsTotal,
    lessons: rows.map((row, i) => ({ ...row, number: i + 1, isNext: i === next })),
    nextStep: nextStep ? { id: nextStep.id, name: nextStep.name } : null,
  };
}

// The published lessons of the published track in path order (step, then lesson).
// The order is the same for everyone; NO_USER reads it without anyone's progress.
export const NO_USER = "";
export type PathEntry = { id: string; stepId: string; ready: boolean; done: boolean };

// Home's "Start": the first ready lesson the user has not finished. Earlier steps are
// complete by definition, so this is also the first open lesson of the current step.
export const startLessonId = (path: PathEntry[]) => path.find((entry) => entry.ready && !entry.done)?.id ?? null;

// The next ready lesson after this one. A lesson listed in two steps counts from the first.
export function lessonAfter(path: PathEntry[], lessonId: string): { id: string; newStep: boolean } | null {
  const index = path.findIndex((entry) => entry.id === lessonId);
  if (index < 0) return null;
  const next = path.slice(index + 1).find((entry) => entry.ready && entry.id !== lessonId);
  return next ? { id: next.id, newStep: next.stepId !== path[index].stepId } : null;
}
