import type { Locale } from "../i18n/locales";

// View models returned by the repos, already localized (with fallback to he).
// The mock repos and the future Drizzle repos implement the same interfaces.

export type User = { id: string; name: string };

export type StepStatus = "completed" | "in_progress" | "up_next" | "later";
export type PathStep = {
  id: string;
  number: number;
  name: string;
  status: StepStatus;
  // Published lessons only.
  lessonsDone: number;
  lessonsTotal: number;
  // False while the step has no published lesson: shown as "coming soon", without a link.
  available: boolean;
};

export type StepLessonState = "done" | "in_progress" | "not_started";
export type StepLesson = {
  id: string;
  // Position among the step's published lessons.
  number: number;
  title: string;
  durationSec: number;
  state: StepLessonState;
  positionSec: number;
  // The video can be played; a lesson whose video is not ready is shown as "being prepared".
  ready: boolean;
  // The one lesson the step page points to: the first ready lesson not done yet.
  isNext: boolean;
};
export type StepDetail = {
  id: string;
  number: number;
  name: string;
  lessonsDone: number;
  lessonsTotal: number;
  lessons: StepLesson[];
  // The next step that has a published lesson.
  nextStep: { id: string; name: string } | null;
};
// The end of a path lesson: its step, the next ready lesson in path order (and whether it
// starts a new step), and whether the learner has now finished every published lesson.
export type LessonEnd = { stepId: string; next: { lesson: Lesson; newStep: boolean } | null; pathFinished: boolean };

export type GlossaryTerm = { id: string; term: string; definition: string };

export type LessonAccess = "free" | "members";

export type Lesson = {
  id: string;
  title: string;
  teacher: string;
  durationSec: number;
  access: LessonAccess;
  stepNumber: number;
  stepName: string;
  lessonNumber: number;
  lessonsInStep: number;
  // Media facts; src/lib/media.ts turns them into addresses.
  thumbnailKey: string | null;
  videoThumbnailUrl: string | null;
  captions: Locale[];
};

export type ContinueWatching = { lesson: Lesson; positionSec: number };

export type Holiday = {
  id: string;
  name: string;
  hebrewDate: string;
  description: string;
  lessonId: string;
  lessonMinutes: number;
};

export interface UserRepo {
  getById(userId: string, locale: Locale): Promise<User | null>;
}
export interface PathRepo {
  getSteps(userId: string, locale: Locale): Promise<PathStep[]>;
  // Null for an unknown step or one outside the published track.
  getStep(userId: string, stepId: string, locale: Locale): Promise<StepDetail | null>;
  // The first ready lesson in path order that the user has not finished: home's "Start".
  getStartLesson(userId: string, locale: Locale): Promise<Lesson | null>;
  // What the end of a lesson offers. Null for a lesson that is not in the path.
  getLessonEnd(userId: string, lessonId: string, locale: Locale): Promise<LessonEnd | null>;
}
export interface LessonRepo {
  getById(lessonId: string, locale: Locale): Promise<Lesson | null>;
}
export interface ProgressRepo {
  getContinueWatching(userId: string, locale: Locale): Promise<ContinueWatching | null>;
  getPosition(userId: string, lessonId: string): Promise<number>;
  // ended: the video played to its end, which finishes the lesson whatever its stored length.
  save(userId: string, lessonId: string, positionSec: number, ended?: boolean): Promise<void>;
}
export interface GlossaryRepo {
  list(locale: Locale, limit?: number): Promise<GlossaryTerm[]>;
  forLesson(lessonId: string, locale: Locale): Promise<GlossaryTerm[]>;
}
export interface HolidayRepo {
  // `now` exists so tests can pin the date.
  getNext(locale: Locale, now?: Date): Promise<Holiday | null>;
}

// Public catalog (holiday pages). Slugs are per locale, with the Hebrew slug as fallback.
export type HolidayCategory = { id: string; slug: string; name: string; lessonCount: number };
export type CatalogLesson = {
  id: string;
  slug: string;
  title: string;
  teacher: string;
  durationSec: number;
  access: LessonAccess;
  description: string;
  keyPoints: string[];
};
export interface CatalogRepo {
  // Holiday categories that have at least one published lesson.
  listHolidayCategories(locale: Locale): Promise<HolidayCategory[]>;
  // Finds the category by its slug in any language; `category.slug` is the one for `locale`.
  getHolidayCategory(slug: string, locale: Locale): Promise<{ category: HolidayCategory; lessons: CatalogLesson[] } | null>;
  // Id of a published lesson by its slug in any language.
  findLessonBySlug(slug: string): Promise<string | null>;
}

// A learner's own data, for a data subject access request (README, "Data subject
// requests"). Dates are ISO strings. Lesson titles are in the user's locale, with he
// as fallback. accountChanges are admin changes to the account, without who made them.
export type UserExport = {
  account: { id: string; email: string; name: string; locale: Locale; role: string; status: string; createdAt: string };
  progress: {
    lessonId: string;
    lessonTitle: string;
    lastPositionSec: number;
    watchedPct: number;
    completedAt: string | null;
    updatedAt: string;
  }[];
  accountChanges: { action: string; at: string; change: unknown }[];
};
export interface UserDataRepo {
  // Id of the user with this email, ignoring deleted users.
  findIdByEmail(email: string): Promise<string | null>;
  // Null for an unknown or deleted user. Progress is ordered by updatedAt, latest first.
  buildExport(userId: string): Promise<UserExport | null>;
}
