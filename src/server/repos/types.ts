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
  lessonsDone: number;
  lessonsTotal: number;
};

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
}
export interface LessonRepo {
  getById(lessonId: string, locale: Locale): Promise<Lesson | null>;
}
export interface ProgressRepo {
  getContinueWatching(userId: string, locale: Locale): Promise<ContinueWatching | null>;
  getPosition(userId: string, lessonId: string): Promise<number>;
  save(userId: string, lessonId: string, positionSec: number): Promise<void>;
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
