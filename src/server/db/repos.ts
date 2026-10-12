import { flags, HebrewCalendar } from "@hebcal/core";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { formatHebrewDate } from "../i18n/hebrewDate";
import type { Locale } from "../i18n/locales";
import { SAMPLE_HLS, sampleSubtitles } from "../media/sample";
import type {
  GlossaryRepo,
  HolidayRepo,
  Lesson,
  LessonRepo,
  PathRepo,
  PathStep,
  ProgressRepo,
  UserRepo,
} from "../repos/types";
import type { Db } from "./client";
import * as t from "./schema";

// Drizzle implementations of the repo interfaces. Content is localized in SQL: each
// query joins the Hebrew row (required) and the requested-locale row (optional).

const COMPLETED_AT_PCT = 95;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Ids come from URLs and request bodies; anything that is not a UUID matches no row.
const uuidOrNil = (value: string) => (isUuid(value) ? value : NIL_UUID);

export function createDrizzleRepos(getDb: () => Db) {
  async function lessonById(lessonId: string, locale: Locale): Promise<Lesson | null> {
    if (!isUuid(lessonId)) return null;
    const lessonHe = alias(t.lessonTranslations, "lesson_he");
    const lessonLoc = alias(t.lessonTranslations, "lesson_loc");
    const teacherHe = alias(t.teacherTranslations, "teacher_he");
    const teacherLoc = alias(t.teacherTranslations, "teacher_loc");
    const stepHe = alias(t.trackStepTranslations, "step_he");
    const stepLoc = alias(t.trackStepTranslations, "step_loc");
    const siblings = alias(t.trackStepLessons, "siblings");

    const [row] = await getDb()
      .select({
        id: t.lessons.id,
        durationSec: t.lessons.durationSec,
        title: sql<string>`coalesce(${lessonLoc.title}, ${lessonHe.title})`,
        teacher: sql<string | null>`coalesce(${teacherLoc.name}, ${teacherHe.name})`,
        stepNumber: t.trackSteps.sortOrder,
        stepName: sql<string | null>`coalesce(${stepLoc.name}, ${stepHe.name})`,
        lessonNumber: t.trackStepLessons.sortOrder,
        lessonsInStep: sql<number>`(select count(*)::int from ${t.trackStepLessons} as ${siblings} where ${siblings.stepId} = ${t.trackSteps.id})`,
      })
      .from(t.lessons)
      .innerJoin(lessonHe, and(eq(lessonHe.lessonId, t.lessons.id), eq(lessonHe.locale, "he")))
      .leftJoin(lessonLoc, and(eq(lessonLoc.lessonId, t.lessons.id), eq(lessonLoc.locale, locale)))
      .leftJoin(teacherHe, and(eq(teacherHe.teacherId, t.lessons.teacherId), eq(teacherHe.locale, "he")))
      .leftJoin(teacherLoc, and(eq(teacherLoc.teacherId, t.lessons.teacherId), eq(teacherLoc.locale, locale)))
      .leftJoin(t.trackStepLessons, eq(t.trackStepLessons.lessonId, t.lessons.id))
      .leftJoin(t.trackSteps, eq(t.trackSteps.id, t.trackStepLessons.stepId))
      .leftJoin(stepHe, and(eq(stepHe.stepId, t.trackSteps.id), eq(stepHe.locale, "he")))
      .leftJoin(stepLoc, and(eq(stepLoc.stepId, t.trackSteps.id), eq(stepLoc.locale, locale)))
      .where(and(eq(t.lessons.id, lessonId), eq(t.lessons.status, "published")))
      .limit(1);
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      teacher: row.teacher ?? "",
      durationSec: row.durationSec ?? 0,
      stepNumber: row.stepNumber ?? 0,
      stepName: row.stepName ?? "",
      lessonNumber: row.lessonNumber ?? 0,
      lessonsInStep: row.lessonsInStep ?? 0,
      // Until video_assets and lesson_subtitles exist (Milestones 3–4).
      videoUrl: SAMPLE_HLS,
      subtitles: sampleSubtitles,
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

  const pathRepo: PathRepo = {
    async getSteps(userId, locale) {
      const stepHe = alias(t.trackStepTranslations, "step_he");
      const stepLoc = alias(t.trackStepTranslations, "step_loc");
      const rows = await getDb()
        .select({
          id: t.trackSteps.id,
          number: t.trackSteps.sortOrder,
          name: sql<string>`coalesce(${stepLoc.name}, ${stepHe.name})`,
          total: sql<number>`count(${t.trackStepLessons.lessonId})::int`,
          started: sql<number>`count(${t.userLessonProgress.lessonId})::int`,
          done: sql<number>`count(${t.userLessonProgress.completedAt})::int`,
        })
        .from(t.trackSteps)
        .innerJoin(stepHe, and(eq(stepHe.stepId, t.trackSteps.id), eq(stepHe.locale, "he")))
        .leftJoin(stepLoc, and(eq(stepLoc.stepId, t.trackSteps.id), eq(stepLoc.locale, locale)))
        .leftJoin(t.trackStepLessons, eq(t.trackStepLessons.stepId, t.trackSteps.id))
        .leftJoin(
          t.userLessonProgress,
          and(
            eq(t.userLessonProgress.lessonId, t.trackStepLessons.lessonId),
            eq(t.userLessonProgress.userId, uuidOrNil(userId)),
          ),
        )
        // One track at launch: the first published one.
        .where(
          eq(
            t.trackSteps.trackId,
            sql`(select ${t.tracks.id} from ${t.tracks} where ${t.tracks.status} = 'published' order by ${t.tracks.sortOrder} limit 1)`,
          ),
        )
        .groupBy(t.trackSteps.id, stepLoc.name, stepHe.name)
        .orderBy(asc(t.trackSteps.sortOrder));

      // Completed = every lesson done; in progress = some watched; the first untouched
      // step is "up next" and the ones after it come later.
      let upNextGiven = false;
      return rows.map((row): PathStep => {
        let status: PathStep["status"];
        if (row.total > 0 && row.done === row.total) status = "completed";
        else if (row.started > 0) status = "in_progress";
        else if (!upNextGiven) {
          status = "up_next";
          upNextGiven = true;
        } else status = "later";
        return { id: row.id, number: row.number, name: row.name, status, lessonsDone: row.done, lessonsTotal: row.total };
      });
    },
  };

  const lessonRepo: LessonRepo = { getById: lessonById };

  const progressRepo: ProgressRepo = {
    async getContinueWatching(userId, locale) {
      const [latest] = await getDb()
        .select({ lessonId: t.userLessonProgress.lessonId, positionSec: t.userLessonProgress.lastPositionSec })
        .from(t.userLessonProgress)
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
    async save(userId, lessonId, positionSec) {
      if (!isUuid(userId) || !isUuid(lessonId)) return;
      const db = getDb();
      const [lesson] = await db
        .select({ durationSec: t.lessons.durationSec })
        .from(t.lessons)
        .where(and(eq(t.lessons.id, lessonId), eq(t.lessons.status, "published")))
        .limit(1);
      if (!lesson) return;

      const watchedPct = lesson.durationSec ? Math.min(100, Math.round((positionSec / lesson.durationSec) * 100)) : 0;
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

      const end = new Date(now);
      end.setMonth(end.getMonth() + 13);
      // Skip the "Erev …" entries: the holiday's date is its first day.
      const event = HebrewCalendar.calendar({ start: now, end, il: true }).find(
        (item) => !(item.getFlags() & flags.EREV) && byCode.has(item.basename()),
      );
      const holiday = event && byCode.get(event.basename());
      if (!event || !holiday) return null;

      return {
        id: holiday.id,
        name: holiday.name,
        hebrewDate: formatHebrewDate(event.getDate(), locale),
        description: holiday.description ?? "",
        lessonId: holiday.lessonId,
        lessonMinutes: Math.round((holiday.durationSec ?? 0) / 60),
      };
    },
  };

  return { userRepo, pathRepo, lessonRepo, progressRepo, glossaryRepo, holidayRepo };
}
