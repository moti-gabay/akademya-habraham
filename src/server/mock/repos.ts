import { nextHolidayOccurrence } from "../catalog/holidayCalendar";
import { COMPLETED_AT_PCT, lessonAfter, NO_USER, type PathEntry, startLessonId, stepDetail, stepStatuses } from "../catalog/path";
import { formatHebrewDate } from "../i18n/hebrewDate";
import { byLocale, LOCALES, localize, type Locale } from "../i18n/locales";
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
import { createMockMediaRepo } from "./media";
import { users } from "./data";
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
  const ready = (id: string) => store.videos.get(id)?.status === "ready";
  const progressOf = (userId: string, lessonId: string) => store.progress.get(userId)?.get(lessonId);
  const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;
  // A step's published lessons, in order.
  const publishedInStep = (stepId: string) => (store.stepLessons.get(stepId) ?? []).filter((id) => published(id));
  // One track at launch: the first published one.
  const trackSteps = () => {
    const track = [...store.tracks.values()].sort(bySortOrder).find((item) => item.status === "published");
    return [...store.steps.values()].filter((step) => step.trackId === track?.id).sort(bySortOrder);
  };
  const pathOf = (userId: string): PathEntry[] =>
    trackSteps().flatMap((step) =>
      publishedInStep(step.id).map((id) => ({ id, stepId: step.id, ready: ready(id), done: progressOf(userId, id)?.completedAt != null })),
    );
  const teacherName = (teacherId: string | null, locale: Locale) => {
    const teacher = teacherId === null ? undefined : store.teachers.get(teacherId);
    return teacher ? text(teacher.translations, locale, "name") : "";
  };

  function toLesson(id: string, locale: Locale): Lesson | null {
    const lesson = published(id);
    if (!lesson) return null;
    // A lesson listed in two steps belongs to the first one.
    const step = [...store.steps.values()].sort(bySortOrder).find((item) => store.stepLessons.get(item.id)?.includes(id));
    const inStep = step ? publishedInStep(step.id) : [];
    return {
      id,
      title: text(lesson.translations, locale, "title"),
      teacher: teacherName(lesson.teacherId, locale),
      durationSec: lesson.durationSec ?? 0,
      access: lesson.access,
      stepNumber: step?.sortOrder ?? 0,
      stepName: step ? text(step.translations, locale, "name") : "",
      // Counted among published lessons only.
      lessonNumber: inStep.indexOf(id) + 1,
      lessonsInStep: inStep.length,
      thumbnailKey: lesson.thumbnailKey,
      videoThumbnailUrl: store.videos.get(id)?.thumbnailUrl ?? null,
      captions: (store.captions.get(id) ?? []).map((caption) => caption.locale).sort(byLocale),
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
    async getSteps(userId, locale) {
      const steps = trackSteps();
      const rows = steps.map((step) => {
        const entries = publishedInStep(step.id).map((id) => progressOf(userId, id));
        return {
          total: entries.length,
          started: entries.filter(Boolean).length,
          done: entries.filter((entry) => entry?.completedAt != null).length,
        };
      });
      const statuses = stepStatuses(rows);
      return steps.map((step, index) => ({
        id: step.id,
        number: step.sortOrder,
        name: text(step.translations, locale, "name"),
        status: statuses[index],
        lessonsDone: rows[index].done,
        lessonsTotal: rows[index].total,
        available: rows[index].total > 0,
      }));
    },
    async getStep(userId, stepId, locale) {
      return stepDetail(await pathRepo.getSteps(userId, locale), stepId, async (id) =>
        publishedInStep(id).map((lessonId) => {
          const lesson = store.lessons.get(lessonId)!;
          const entry = progressOf(userId, lessonId);
          return {
            id: lessonId,
            title: text(lesson.translations, locale, "title"),
            durationSec: lesson.durationSec ?? 0,
            state: !entry ? "not_started" : entry.completedAt != null ? "done" : "in_progress",
            positionSec: entry?.positionSec ?? 0,
            ready: ready(lessonId),
          };
        }),
      );
    },
    async getStartLesson(userId, locale) {
      const id = startLessonId(pathOf(userId));
      return id ? toLesson(id, locale) : null;
    },
    async getLessonAfter(lessonId, locale) {
      const next = lessonAfter(pathOf(NO_USER), lessonId);
      const lesson = next && toLesson(next.id, locale);
      return lesson ? { lesson, newStep: next.newStep } : null;
    },
  };

  const lessonRepo: LessonRepo = {
    async getById(lessonId, locale) {
      return toLesson(lessonId, locale);
    },
  };

  const progressRepo: ProgressRepo = {
    async getContinueWatching(userId, locale) {
      // The latest unfinished lesson that is still published.
      const latest = [...(store.progress.get(userId)?.values() ?? [])]
        .filter((entry) => entry.completedAt === null && published(entry.lessonId))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const lesson = latest && toLesson(latest.lessonId, locale);
      return lesson ? { lesson, positionSec: latest.positionSec } : null;
    },
    async getPosition(userId, lessonId) {
      return progressOf(userId, lessonId)?.positionSec ?? 0;
    },
    async save(userId, lessonId, positionSec) {
      const lesson = published(lessonId);
      if (!lesson) return;
      // As in the database: finished once, never un-finished, and the share never goes down.
      const previous = progressOf(userId, lessonId);
      const pct = lesson.durationSec ? Math.min(100, Math.round((positionSec / lesson.durationSec) * 100)) : 0;
      const now = Date.now();
      const byLesson = store.progress.get(userId) ?? new Map();
      byLesson.set(lessonId, {
        lessonId,
        positionSec,
        watchedPct: Math.max(previous?.watchedPct ?? 0, pct),
        completedAt: previous?.completedAt ?? (pct >= COMPLETED_AT_PCT ? now : null),
        updatedAt: now,
      });
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
    mediaRepo: createMockMediaRepo(store),
  };
}

export const { userRepo, pathRepo, lessonRepo, progressRepo, glossaryRepo, holidayRepo, catalogRepo, adminCatalogRepo, mediaRepo } =
 
  createMockRepos(mockStore);
