import { nextHolidayOccurrence } from "../catalog/holidayCalendar";
import { formatHebrewDate } from "../i18n/hebrewDate";
import { localize, type Locale } from "../i18n/locales";
import type {
  GlossaryRepo,
  GlossaryTerm,
  HolidayRepo,
  Lesson,
  LessonRepo,
  PathRepo,
  ProgressRepo,
  UserRepo,
} from "../repos/types";
import { glossary, holidayCategories, initialProgress, lessons, steps, users } from "./data";

// Mock only: the one place in src/server that keeps state in memory. It lives on
// globalThis so route handlers and pages share it, and it resets on restart.
type ProgressStore = Map<string, { lessonId: string; positionSec: number; updatedAt: number }>;
const globalStore = globalThis as { __mockProgress?: Map<string, ProgressStore> };
const progressByUser = (globalStore.__mockProgress ??= new Map(
  initialProgress.map(([userId, lessonId, positionSec]) => [
    userId,
    new Map([[lessonId, { lessonId, positionSec, updatedAt: 0 }]]),
  ]),
));

const toTerm = (term: (typeof glossary)[number], locale: Locale): GlossaryTerm => ({
  id: term.id,
  term: localize(term.term, locale),
  definition: localize(term.definition, locale),
});

function toLesson(id: string, locale: Locale): Lesson | null {
  const lesson = lessons[id];
  if (!lesson || lesson.status === "draft") return null;
  const stepIndex = steps.findIndex((step) => step.id === lesson.stepId);
  const step = steps[stepIndex];
  return {
    id,
    title: localize(lesson.title, locale),
    teacher: localize(lesson.teacher, locale),
    durationSec: lesson.durationSec,
    access: lesson.access ?? "members",
    stepNumber: stepIndex + 1,
    stepName: step ? localize(step.name, locale) : "",
    lessonNumber: lesson.lessonNumber,
    lessonsInStep: step?.lessonsTotal ?? 0,
    videoUrl: lesson.videoUrl,
    subtitles: lesson.subtitles,
  };
}

export const userRepo: UserRepo = {
  async getById(userId, locale) {
    const user = users[userId];
    return user ? { id: userId, name: localize(user.name, locale) } : null;
  },
};

export const pathRepo: PathRepo = {
  async getSteps(_userId, locale) {
    return steps.map((step, index) => ({ ...step, number: index + 1, name: localize(step.name, locale) }));
  },
};

export const lessonRepo: LessonRepo = {
  async getById(lessonId, locale) {
    return toLesson(lessonId, locale);
  },
};

export const progressRepo: ProgressRepo = {
  async getContinueWatching(userId, locale) {
    const entries = [...(progressByUser.get(userId)?.values() ?? [])];
    const latest = entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const lesson = latest && toLesson(latest.lessonId, locale);
    return lesson ? { lesson, positionSec: latest.positionSec } : null;
  },
  async getPosition(userId, lessonId) {
    return progressByUser.get(userId)?.get(lessonId)?.positionSec ?? 0;
  },
  async save(userId, lessonId, positionSec) {
    if (!lessons[lessonId] || lessons[lessonId].status === "draft") return;
    const store = progressByUser.get(userId) ?? new Map();
    store.set(lessonId, { lessonId, positionSec, updatedAt: Date.now() });
    progressByUser.set(userId, store);
  },
};

export const glossaryRepo: GlossaryRepo = {
  async list(locale, limit) {
    return glossary.slice(0, limit).map((term) => toTerm(term, locale));
  },
  async forLesson(lessonId, locale) {
    const ids = lessons[lessonId]?.termIds ?? [];
    return ids.flatMap((id) => glossary.filter((term) => term.id === id)).map((term) => toTerm(term, locale));
  },
};

export const holidayRepo: HolidayRepo = {
  async getNext(locale, now = new Date()) {
    // The first published lesson of each holiday is its introduction.
    const introOf = (categoryId: string) =>
      Object.entries(lessons).find(([, lesson]) => lesson.categoryId === categoryId && lesson.status !== "draft");
    const withLessons = holidayCategories.filter((category) => introOf(category.id));
    const next = nextHolidayOccurrence(new Set(withLessons.map((category) => category.hebcalCode)), now);
    const holiday = next && withLessons.find((category) => category.hebcalCode === next.code);
    const intro = holiday && introOf(holiday.id);
    if (!next || !holiday || !intro) return null;
    const [lessonId, lesson] = intro;
    return {
      id: holiday.id,
      name: localize(holiday.name, locale),
      hebrewDate: formatHebrewDate(next.start, locale),
      description: lesson.description ? localize(lesson.description, locale) : "",
      lessonId,
      lessonMinutes: Math.round(lesson.durationSec / 60),
    };
  },
};
