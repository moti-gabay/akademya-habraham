import { nextHolidayOccurrence } from "../catalog/holidayCalendar";
import { formatHebrewDate } from "../i18n/hebrewDate";
import { LOCALES, localize, type Locale } from "../i18n/locales";
import { SAMPLE_HLS, sampleSubtitles } from "../media/sample";
import type {
  CatalogLesson,
  CatalogRepo,
  GlossaryRepo,
  GlossaryTerm,
  HolidayCategory,
  HolidayRepo,
  Lesson,
  LessonRepo,
  PathRepo,
  ProgressRepo,
  UserRepo,
} from "../repos/types";
import { createMockAdminCatalogRepo } from "./adminCatalog";
import { lessons as sampleLessons, steps as sampleSteps, users } from "./data";
import { mockStore, type MockStore } from "./store";

// Mock implementations of the repo interfaces, reading the in-memory store.

type Translations<Row> = { he: Row } & Partial<Record<Exclude<Locale, "he">, Row>>;

// One field in the requested language, or in Hebrew when it is missing or empty there.
function text<Row, Key extends keyof Row>(translations: Translations<Row>, locale: Locale, key: Key): NonNullable<Row[Key]> {
  const value = translations[locale]?.[key];
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  return (empty ? translations.he[key] : value) as NonNullable<Row[Key]>;
}

export function createMockRepos(store: MockStore) {
  const published = (id: string) => {
    const lesson = store.lessons.get(id);
    return lesson?.status === "published" ? lesson : null;
  };
  const publishedIn = (categoryId: string) =>
    [...store.lessons.values()]
      .filter((lesson) => lesson.categoryId === categoryId && lesson.status === "published")
      .sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
  const teacherName = (teacherId: string | null, locale: Locale) => {
    const teacher = teacherId === null ? undefined : store.teachers.get(teacherId);
    return teacher ? text(teacher.translations, locale, "name") : "";
  };

  function toLesson(id: string, locale: Locale): Lesson | null {
    const lesson = published(id);
    if (!lesson) return null;
    const [stepId, stepLessons] = [...store.stepLessons].find(([, ids]) => ids.includes(id)) ?? [];
    const step = stepId === undefined ? undefined : store.steps.get(stepId);
    // The sample steps stand for more lessons than the few the sample data names.
    const sampleStep = sampleSteps.find((item) => item.id === stepId);
    return {
      id,
      title: text(lesson.translations, locale, "title"),
      teacher: teacherName(lesson.teacherId, locale),
      durationSec: lesson.durationSec ?? 0,
      access: lesson.access,
      stepNumber: step?.sortOrder ?? 0,
      stepName: step ? text(step.translations, locale, "name") : "",
      lessonNumber: sampleLessons[id]?.lessonNumber ?? (stepLessons ? stepLessons.indexOf(id) + 1 : 0),
      lessonsInStep: sampleStep?.lessonsTotal ?? stepLessons?.length ?? 0,
      videoUrl: SAMPLE_HLS,
      subtitles: sampleSubtitles,
    };
  }

  const toTerm = (id: string, locale: Locale): GlossaryTerm[] => {
    const term = store.terms.get(id);
    return term
      ? [{ id, term: text(term.translations, locale, "term"), definition: text(term.translations, locale, "shortDefinition") }]
      : [];
  };

  const toCatalogLesson = (lesson: NonNullable<ReturnType<typeof published>>, locale: Locale): CatalogLesson => ({
    id: lesson.id,
    slug: text(lesson.translations, locale, "slug"),
    title: text(lesson.translations, locale, "title"),
    teacher: teacherName(lesson.teacherId, locale),
    durationSec: lesson.durationSec ?? 0,
    access: lesson.access,
    description: text(lesson.translations, locale, "description") ?? "",
    keyPoints: text(lesson.translations, locale, "keyPoints"),
  });

  const holidayCategories = (locale: Locale): HolidayCategory[] =>
    [...store.categories.values()]
      .filter((category) => category.kind === "holiday")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({
        id: category.id,
        slug: text(category.translations, locale, "slug"),
        name: text(category.translations, locale, "name"),
        lessonCount: publishedIn(category.id).length,
      }))
      .filter((category) => category.lessonCount > 0);

  const userRepo: UserRepo = {
    async getById(userId, locale) {
      const user = users[userId];
      return user ? { id: userId, name: localize(user.name, locale) } : null;
    },
  };

  const pathRepo: PathRepo = {
    async getSteps(_userId, locale) {
      // One track at launch: the first published one.
      const track = [...store.tracks.values()].sort((a, b) => a.sortOrder - b.sortOrder).find((item) => item.status === "published");
      return [...store.steps.values()]
        .filter((step) => step.trackId === track?.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((step) => {
          // Sample steps keep the progress drawn in the sketch; new ones are untouched.
          const sample = sampleSteps.find((item) => item.id === step.id);
          return {
            id: step.id,
            number: step.sortOrder,
            name: text(step.translations, locale, "name"),
            status: sample?.status ?? "later",
            lessonsDone: sample?.lessonsDone ?? 0,
            lessonsTotal: sample?.lessonsTotal ?? store.stepLessons.get(step.id)?.length ?? 0,
          };
        });
    },
  };

  const lessonRepo: LessonRepo = {
    async getById(lessonId, locale) {
      return toLesson(lessonId, locale);
    },
  };

  const progressRepo: ProgressRepo = {
    async getContinueWatching(userId, locale) {
      const entries = [...(store.progress.get(userId)?.values() ?? [])];
      const latest = entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const lesson = latest && toLesson(latest.lessonId, locale);
      return lesson ? { lesson, positionSec: latest.positionSec } : null;
    },
    async getPosition(userId, lessonId) {
      return store.progress.get(userId)?.get(lessonId)?.positionSec ?? 0;
    },
    async save(userId, lessonId, positionSec) {
      if (!published(lessonId)) return;
      const byLesson = store.progress.get(userId) ?? new Map();
      byLesson.set(lessonId, { lessonId, positionSec, updatedAt: Date.now() });
      store.progress.set(userId, byLesson);
    },
  };

  const glossaryRepo: GlossaryRepo = {
    async list(locale, limit) {
      return [...store.terms.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, limit)
        .flatMap((term) => toTerm(term.id, locale));
    },
    async forLesson(lessonId, locale) {
      return (store.lessonTerms.get(lessonId) ?? []).flatMap((id) => toTerm(id, locale));
    },
  };

  const holidayRepo: HolidayRepo = {
    async getNext(locale, now = new Date()) {
      const withLessons = [...store.categories.values()].filter(
        (category) => category.kind === "holiday" && category.hebcalCode && publishedIn(category.id).length > 0,
      );
      const next = nextHolidayOccurrence(new Set(withLessons.map((category) => category.hebcalCode ?? "")), now);
      const holiday = next && withLessons.find((category) => category.hebcalCode === next.code);
      if (!next || !holiday) return null;
      // The first published lesson of a holiday is its introduction.
      const [intro] = publishedIn(holiday.id);
      return {
        id: holiday.id,
        name: text(holiday.translations, locale, "name"),
        hebrewDate: formatHebrewDate(next.start, locale),
        description: text(intro.translations, locale, "description") ?? "",
        lessonId: intro.id,
        lessonMinutes: Math.round((intro.durationSec ?? 0) / 60),
      };
    },
  };

  const catalogRepo: CatalogRepo = {
    async listHolidayCategories(locale) {
      return holidayCategories(locale);
    },
    async getHolidayCategory(slug, locale) {
      const categories = [...store.categories.values()];
      // The requested locale's slug wins when two languages use the same word.
      const match = [locale, ...LOCALES]
        .map((l) => categories.find((item) => item.translations[l]?.slug === slug))
        .find((item) => item !== undefined);
      const category = match && holidayCategories(locale).find((item) => item.id === match.id);
      if (!category) return null;
      return { category, lessons: publishedIn(category.id).map((lesson) => toCatalogLesson(lesson, locale)) };
    },
    async findLessonBySlug(slug) {
      const lesson = [...store.lessons.values()].find(
        (item) => item.status === "published" && Object.values(item.translations).some((row) => row?.slug === slug),
      );
      return lesson?.id ?? null;
    },
  };

  return {
    userRepo,
    pathRepo,
    lessonRepo,
    progressRepo,
    glossaryRepo,
    holidayRepo,
    catalogRepo,
    adminCatalogRepo: createMockAdminCatalogRepo(store),
  };
}

export const { userRepo, pathRepo, lessonRepo, progressRepo, glossaryRepo, holidayRepo, catalogRepo, adminCatalogRepo } =
  createMockRepos(mockStore);
