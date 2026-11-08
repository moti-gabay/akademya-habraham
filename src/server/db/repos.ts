import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { nextHolidayOccurrence } from "../catalog/holidayCalendar";
import { COMPLETED_AT_PCT, lessonEnd, type PathEntry, startLessonId, stepDetail, stepStatuses } from "../catalog/path";
import { formatHebrewDate } from "../i18n/hebrewDate";
import type { Locale } from "../i18n/locales";
import type {
  GlossaryRepo,
  HolidayRepo,
  Lesson,
  LessonRepo,
  PathRepo,
  ProgressRepo,
  UserRepo,
} from "../repos/types";
import { createDrizzleAdminCatalogRepo } from "./adminCatalog";
import { createDrizzleCatalogRepo } from "./catalog";
import type { Db } from "./client";
import { createDrizzleMediaRepo } from "./media";
import * as t from "./schema";
import { isUuid, uuidOrNil } from "./uuid";

// Drizzle implementations of the repo interfaces. Content is localized in SQL: each
// query joins the Hebrew row (required) and the requested-locale row (optional).

export function createDrizzleRepos(getDb: () => Db) {
  // One track at launch: the first published one.
  const publishedTrackId = () =>
    sql`(select ${t.tracks.id} from ${t.tracks} where ${t.tracks.status} = 'published' order by ${t.tracks.sortOrder} limit 1)`;
  const publishedLesson = (lessonId: AnyPgColumn) =>
    and(eq(t.lessons.id, lessonId), eq(t.lessons.status, "published"));


  async function lessonById(lessonId: string, locale: Locale): Promise<Lesson | null> {
    if (!isUuid(lessonId)) return null;
    const lessonHe = alias(t.lessonTranslations, "lesson_he");
    const lessonLoc = alias(t.lessonTranslations, "lesson_loc");
    const teacherHe = alias(t.teacherTranslations, "teacher_he");
    const teacherLoc = alias(t.teacherTranslations, "teacher_loc");
    const stepHe = alias(t.trackStepTranslations, "step_he");
    const stepLoc = alias(t.trackStepTranslations, "step_loc");
    const siblings = alias(t.trackStepLessons, "siblings");
    const siblingLesson = alias(t.lessons, "sibling_lesson");
    // The step's published lessons: numbers and counts skip drafts.
    const publishedSiblings = sql`from ${t.trackStepLessons} as ${siblings} join ${t.lessons} as ${siblingLesson} on ${siblingLesson.id} = ${siblings.lessonId} and ${siblingLesson.status} = 'published' where ${siblings.stepId} = ${t.trackSteps.id}`;

    const [row] = await getDb()
      .select({
        id: t.lessons.id,
        durationSec: t.lessons.durationSec,
        access: t.lessons.access,
        thumbnailKey: t.lessons.thumbnailKey,
        videoThumbnailUrl: t.videoAssets.thumbnailUrl,
        title: sql<string>`coalesce(${lessonLoc.title}, ${lessonHe.title})`,
        teacher: sql<string | null>`coalesce(${teacherLoc.name}, ${teacherHe.name})`,
        stepNumber: t.trackSteps.sortOrder,
        stepName: sql<string | null>`coalesce(${stepLoc.name}, ${stepHe.name})`,
        lessonNumber: sql<number>`(select count(*)::int ${publishedSiblings} and ${siblings.sortOrder} <= ${t.trackStepLessons.sortOrder})`,
        lessonsInStep: sql<number>`(select count(*)::int ${publishedSiblings})`,
      })
      .from(t.lessons)
      .innerJoin(lessonHe, and(eq(lessonHe.lessonId, t.lessons.id), eq(lessonHe.locale, "he")))
      .leftJoin(lessonLoc, and(eq(lessonLoc.lessonId, t.lessons.id), eq(lessonLoc.locale, locale)))
      .leftJoin(teacherHe, and(eq(teacherHe.teacherId, t.lessons.teacherId), eq(teacherHe.locale, "he")))
      .leftJoin(teacherLoc, and(eq(teacherLoc.teacherId, t.lessons.teacherId), eq(teacherLoc.locale, locale)))
      .leftJoin(t.trackStepLessons, eq(t.trackStepLessons.lessonId, t.lessons.id))
      .leftJoin(t.trackSteps, eq(t.trackSteps.id, t.trackStepLessons.stepId))
      .leftJoin(t.videoAssets, eq(t.videoAssets.lessonId, t.lessons.id))
      .leftJoin(stepHe, and(eq(stepHe.stepId, t.trackSteps.id), eq(stepHe.locale, "he")))
      .leftJoin(stepLoc, and(eq(stepLoc.stepId, t.trackSteps.id), eq(stepLoc.locale, locale)))
      .where(and(eq(t.lessons.id, lessonId), eq(t.lessons.status, "published")))
      // A lesson listed in two steps belongs to the first one.
      .orderBy(asc(t.trackSteps.sortOrder))
      .limit(1);
    if (!row) return null;
    const captions = await getDb()
      .select({ locale: t.lessonSubtitles.locale })
      .from(t.lessonSubtitles)
      .where(eq(t.lessonSubtitles.lessonId, lessonId))
      .orderBy(asc(t.lessonSubtitles.locale));

    return {
      id: row.id,
      title: row.title,
      teacher: row.teacher ?? "",
      durationSec: row.durationSec ?? 0,
      access: row.access,
      stepNumber: row.stepNumber ?? 0,
      stepName: row.stepName ?? "",
      lessonNumber: row.lessonNumber ?? 0,
      lessonsInStep: row.lessonsInStep ?? 0,
      thumbnailKey: row.thumbnailKey,
      videoThumbnailUrl: row.videoThumbnailUrl,
      captions: captions.map((caption) => caption.locale),
    };
  }

  const userRepo: UserRepo = {
    async getById(userId) {
      const [row] = await getDb()
        .select({ id: t.users.id, name: t.users.name })
        .from(t.users)
        .where(and(eq(t.users.id, uuidOrNil(userId)), eq(t.users.status, "active")))
        .limit(1);
      return row ?? null;
    },
  };

  // The published lessons of the published track in path order, with this user's progress.
  async function pathOf(userId: string): Promise<PathEntry[]> {
    const rows = await getDb()
      .select({
        id: t.trackStepLessons.lessonId,
        stepId: t.trackStepLessons.stepId,
        videoStatus: t.videoAssets.status,
        completedAt: t.userLessonProgress.completedAt,
      })
      .from(t.trackStepLessons)
      .innerJoin(t.trackSteps, eq(t.trackSteps.id, t.trackStepLessons.stepId))
      .innerJoin(t.lessons, publishedLesson(t.trackStepLessons.lessonId))
      .leftJoin(t.videoAssets, eq(t.videoAssets.lessonId, t.lessons.id))
      .leftJoin(
        t.userLessonProgress,
        and(eq(t.userLessonProgress.lessonId, t.lessons.id), eq(t.userLessonProgress.userId, uuidOrNil(userId))),
      )
      .where(eq(t.trackSteps.trackId, publishedTrackId()))
      .orderBy(asc(t.trackSteps.sortOrder), asc(t.trackStepLessons.sortOrder));
    return rows.map((row) => ({ id: row.id, stepId: row.stepId, ready: row.videoStatus === "ready", done: row.completedAt !== null }));
  }

  const pathRepo: PathRepo = {
    async getSteps(userId, locale) {
      const stepHe = alias(t.trackStepTranslations, "step_he");
      const stepLoc = alias(t.trackStepTranslations, "step_loc");
      const rows = await getDb()
        .select({
          id: t.trackSteps.id,
          number: t.trackSteps.sortOrder,
          name: sql<string>`coalesce(${stepLoc.name}, ${stepHe.name})`,
          total: sql<number>`count(${t.lessons.id})::int`,
          started: sql<number>`count(${t.userLessonProgress.lessonId})::int`,
          done: sql<number>`count(${t.userLessonProgress.completedAt})::int`,
        })
        .from(t.trackSteps)
        .innerJoin(stepHe, and(eq(stepHe.stepId, t.trackSteps.id), eq(stepHe.locale, "he")))
        .leftJoin(stepLoc, and(eq(stepLoc.stepId, t.trackSteps.id), eq(stepLoc.locale, locale)))
        .leftJoin(t.trackStepLessons, eq(t.trackStepLessons.stepId, t.trackSteps.id))
        // Published lessons only: a draft neither counts nor carries progress.
        .leftJoin(t.lessons, publishedLesson(t.trackStepLessons.lessonId))
        .leftJoin(
          t.userLessonProgress,
          and(eq(t.userLessonProgress.lessonId, t.lessons.id), eq(t.userLessonProgress.userId, uuidOrNil(userId))),
        )
        .where(eq(t.trackSteps.trackId, publishedTrackId()))
        .groupBy(t.trackSteps.id, stepLoc.name, stepHe.name)
        .orderBy(asc(t.trackSteps.sortOrder));

      const statuses = stepStatuses(rows);
      return rows.map((row, index) => ({
        id: row.id,
        number: row.number,
        name: row.name,
        status: statuses[index],
        lessonsDone: row.done,
        lessonsTotal: row.total,
        available: row.total > 0,
      }));
    },
    async getStep(userId, stepId, locale) {
      if (!isUuid(stepId)) return null;
      return stepDetail(await pathRepo.getSteps(userId, locale), stepId, async (id) => {
        const lessonHe = alias(t.lessonTranslations, "lesson_he");
        const lessonLoc = alias(t.lessonTranslations, "lesson_loc");
        const rows = await getDb()
          .select({
            id: t.lessons.id,
            title: sql<string>`coalesce(${lessonLoc.title}, ${lessonHe.title})`,
            durationSec: t.lessons.durationSec,
            videoStatus: t.videoAssets.status,
            started: t.userLessonProgress.lessonId,
            positionSec: t.userLessonProgress.lastPositionSec,
            completedAt: t.userLessonProgress.completedAt,
          })
          .from(t.trackStepLessons)
          .innerJoin(t.lessons, publishedLesson(t.trackStepLessons.lessonId))
          .innerJoin(lessonHe, and(eq(lessonHe.lessonId, t.lessons.id), eq(lessonHe.locale, "he")))
          .leftJoin(lessonLoc, and(eq(lessonLoc.lessonId, t.lessons.id), eq(lessonLoc.locale, locale)))
          .leftJoin(t.videoAssets, eq(t.videoAssets.lessonId, t.lessons.id))
          .leftJoin(
            t.userLessonProgress,
            and(eq(t.userLessonProgress.lessonId, t.lessons.id), eq(t.userLessonProgress.userId, uuidOrNil(userId))),
          )
          .where(eq(t.trackStepLessons.stepId, id))
          .orderBy(asc(t.trackStepLessons.sortOrder));
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          durationSec: row.durationSec ?? 0,
          state: row.completedAt !== null ? "done" : row.started !== null ? "in_progress" : "not_started",
          positionSec: row.positionSec ?? 0,
          ready: row.videoStatus === "ready",
        }));
      });
    },
    async getStartLesson(userId, locale) {
      const id = startLessonId(await pathOf(userId));
      return id ? lessonById(id, locale) : null;
    },
    async getLessonEnd(userId, lessonId, locale) {
      const end = lessonEnd(await pathOf(userId), lessonId);
      if (!end) return null;
      const lesson = end.next && (await lessonById(end.next.id, locale));
      return { stepId: end.stepId, next: lesson ? { lesson, newStep: end.next!.newStep } : null, pathFinished: end.pathFinished };
    },
  };

  const lessonRepo: LessonRepo = { getById: lessonById };

  const progressRepo: ProgressRepo = {
    async getContinueWatching(userId, locale) {
      const [latest] = await getDb()
        .select({ lessonId: t.userLessonProgress.lessonId, positionSec: t.userLessonProgress.lastPositionSec })
        .from(t.userLessonProgress)
        // Skips a lesson that was unpublished since, instead of hiding the card.
        .innerJoin(t.lessons, publishedLesson(t.userLessonProgress.lessonId))
        .where(and(eq(t.userLessonProgress.userId, uuidOrNil(userId)), isNull(t.userLessonProgress.completedAt)))
        .orderBy(desc(t.userLessonProgress.updatedAt))
        .limit(1);
      const lesson = latest && (await lessonById(latest.lessonId, locale));
      return lesson ? { lesson, positionSec: latest.positionSec } : null;
    },
    async getPosition(userId, lessonId) {
      const [row] = await getDb()
        .select({ positionSec: t.userLessonProgress.lastPositionSec })
        .from(t.userLessonProgress)
        .where(
          and(
            eq(t.userLessonProgress.userId, uuidOrNil(userId)),
            eq(t.userLessonProgress.lessonId, uuidOrNil(lessonId)),
          ),
        )
        .limit(1);
      return row?.positionSec ?? 0;
    },
    async save(userId, lessonId, positionSec, ended = false) {
      if (!isUuid(userId) || !isUuid(lessonId)) return;
      const db = getDb();
      const [lesson] = await db
        .select({ durationSec: t.lessons.durationSec })
        .from(t.lessons)
        .where(and(eq(t.lessons.id, lessonId), eq(t.lessons.status, "published")))
        .limit(1);
      if (!lesson) return;

      const watchedPct = ended ? 100 : lesson.durationSec ? Math.min(100, Math.round((positionSec / lesson.durationSec) * 100)) : 0;
      const completedAt = watchedPct >= COMPLETED_AT_PCT ? new Date() : null;
      await db
        .insert(t.userLessonProgress)
        .values({ userId, lessonId, lastPositionSec: positionSec, watchedPct, completedAt, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [t.userLessonProgress.userId, t.userLessonProgress.lessonId],
          set: {
            lastPositionSec: sql`excluded.last_position_sec`,
            // A lesson stays completed, and the watched share never goes down, when the user rewinds.
            watchedPct: sql`greatest(${t.userLessonProgress.watchedPct}, excluded.watched_pct)`,
            completedAt: sql`coalesce(${t.userLessonProgress.completedAt}, excluded.completed_at)`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    },
  };

  function termQuery(locale: Locale) {
    const termHe = alias(t.glossaryTermTranslations, "term_he");
    const termLoc = alias(t.glossaryTermTranslations, "term_loc");
    return getDb()
      .select({
        id: t.glossaryTerms.id,
        term: sql<string>`coalesce(${termLoc.term}, ${termHe.term})`,
        definition: sql<string>`coalesce(${termLoc.shortDefinition}, ${termHe.shortDefinition})`,
      })
      .from(t.glossaryTerms)
      .innerJoin(termHe, and(eq(termHe.termId, t.glossaryTerms.id), eq(termHe.locale, "he")))
      .leftJoin(termLoc, and(eq(termLoc.termId, t.glossaryTerms.id), eq(termLoc.locale, locale)))
      .$dynamic();
  }

  const glossaryRepo: GlossaryRepo = {
    async list(locale, limit) {
      const query = termQuery(locale).orderBy(asc(t.glossaryTerms.sortOrder));
      return limit === undefined ? query : query.limit(limit);
    },
    async forLesson(lessonId, locale) {
      return termQuery(locale)
        .innerJoin(t.lessonGlossaryTerms, eq(t.lessonGlossaryTerms.termId, t.glossaryTerms.id))
        .where(eq(t.lessonGlossaryTerms.lessonId, uuidOrNil(lessonId)))
        .orderBy(asc(t.lessonGlossaryTerms.sortOrder));
    },
  };

  const holidayRepo: HolidayRepo = {
    async getNext(locale, now = new Date()) {
      const categoryHe = alias(t.categoryTranslations, "category_he");
      const categoryLoc = alias(t.categoryTranslations, "category_loc");
      const lessonHe = alias(t.lessonTranslations, "lesson_he");
      const lessonLoc = alias(t.lessonTranslations, "lesson_loc");
      const rows = await getDb()
        .select({
          id: t.categories.id,
          hebcalCode: t.categories.hebcalCode,
          name: sql<string>`coalesce(${categoryLoc.name}, ${categoryHe.name})`,
          lessonId: t.lessons.id,
          durationSec: t.lessons.durationSec,
          description: sql<string | null>`coalesce(${lessonLoc.description}, ${lessonHe.description})`,
        })
        .from(t.categories)
        .innerJoin(categoryHe, and(eq(categoryHe.categoryId, t.categories.id), eq(categoryHe.locale, "he")))
        .leftJoin(categoryLoc, and(eq(categoryLoc.categoryId, t.categories.id), eq(categoryLoc.locale, locale)))
        .innerJoin(t.lessons, and(eq(t.lessons.categoryId, t.categories.id), eq(t.lessons.status, "published")))
        .innerJoin(lessonHe, and(eq(lessonHe.lessonId, t.lessons.id), eq(lessonHe.locale, "he")))
        .leftJoin(lessonLoc, and(eq(lessonLoc.lessonId, t.lessons.id), eq(lessonLoc.locale, locale)))
        .where(and(eq(t.categories.kind, "holiday"), isNotNull(t.categories.hebcalCode)))
        .orderBy(asc(t.lessons.publishedAt), asc(t.lessons.id));

      // The first published lesson of each holiday is its introduction.
      const byCode = new Map<string, (typeof rows)[number]>();
      for (const row of rows) if (row.hebcalCode && !byCode.has(row.hebcalCode)) byCode.set(row.hebcalCode, row);
      if (byCode.size === 0) return null;

      const next = nextHolidayOccurrence(new Set(byCode.keys()), now);
      const holiday = next && byCode.get(next.code);
      if (!next || !holiday) return null;

      return {
        id: holiday.id,
        name: holiday.name,
        hebrewDate: formatHebrewDate(next.start, locale),
        description: holiday.description ?? "",
        lessonId: holiday.lessonId,
        lessonMinutes: Math.round((holiday.durationSec ?? 0) / 60),
      };
    },
  };

  return {
    userRepo,
    pathRepo,
    lessonRepo,
    progressRepo,
    glossaryRepo,
    holidayRepo,
    catalogRepo: createDrizzleCatalogRepo(getDb),
    adminCatalogRepo: createDrizzleAdminCatalogRepo(getDb),
    mediaRepo: createDrizzleMediaRepo(getDb),
  };
}
