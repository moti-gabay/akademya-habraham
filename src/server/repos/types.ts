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

export type Lesson = {
  id: string;
  title: string;
  teacher: string;
  durationSec: number;
  stepNumber: number;
  stepName: string;
  lessonNumber: number;
  lessonsInStep: number;
  videoUrl: string;
  subtitles: { locale: Locale; url: string }[];
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
  getNext(locale: Locale): Promise<Holiday | null>;
}
