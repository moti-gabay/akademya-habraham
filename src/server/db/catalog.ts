import { and, asc, count, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Locale } from "../i18n/locales";
import type { CatalogRepo, HolidayCategory } from "../repos/types";
import type { Db } from "./client";
import * as t from "./schema";

// Public catalog reads for the holiday pages. Same localization as repos.ts: the Hebrew
// row is required, the requested locale's row is optional, each field falls back alone.
export function createDrizzleCatalogRepo(getDb: () => Db): CatalogRepo {
  async function listHolidayCategories(locale: Locale): Promise<HolidayCategory[]> {
    const he = alias(t.categoryTranslations, "category_he");
    const loc = alias(t.categoryTranslations, "category_loc");
    return getDb()
      .select({
        id: t.categories.id,
        slug: sql<string>`coalesce(${loc.slug}, ${he.slug})`,
        name: sql<string>`coalesce(${loc.name}, ${he.name})`,
        lessonCount: count(t.lessons.id),
      })
      .from(t.categories)
      .innerJoin(he, and(eq(he.categoryId, t.categories.id), eq(he.locale, "he")))
      .leftJoin(loc, and(eq(loc.categoryId, t.categories.id), eq(loc.locale, locale)))
      .innerJoin(t.lessons, and(eq(t.lessons.categoryId, t.categories.id), eq(t.lessons.status, "published")))
      .where(eq(t.categories.kind, "holiday"))
      .groupBy(t.categories.id, loc.slug, he.slug, loc.name, he.name)
      .orderBy(asc(t.categories.sortOrder), asc(t.categories.id));
  }

  return {
    listHolidayCategories,

    async getHolidayCategory(slug, locale) {
      const [match] = await getDb()
        .select({ id: t.categoryTranslations.categoryId })
        .from(t.categoryTranslations)
        .where(eq(t.categoryTranslations.slug, slug))
        // The requested locale's slug wins when two languages use the same word.
        .orderBy(sql`${t.categoryTranslations.locale} = ${locale} desc`)
        .limit(1);
      const category = match && (await listHolidayCategories(locale)).find((item) => item.id === match.id);
      if (!category) return null;

      const he = alias(t.lessonTranslations, "lesson_he");
      const loc = alias(t.lessonTranslations, "lesson_loc");
      const teacherHe = alias(t.teacherTranslations, "teacher_he");
      const teacherLoc = alias(t.teacherTranslations, "teacher_loc");
      const rows = await getDb()
        .select({
          id: t.lessons.id,
          slug: sql<string>`coalesce(${loc.slug}, ${he.slug})`,
          title: sql<string>`coalesce(${loc.title}, ${he.title})`,
          teacher: sql<string | null>`coalesce(${teacherLoc.name}, ${teacherHe.name})`,
          durationSec: t.lessons.durationSec,
          access: t.lessons.access,
          description: sql<string | null>`coalesce(${loc.description}, ${he.description})`,
          keyPoints: sql<string[] | null>`coalesce(${loc.keyPoints}, ${he.keyPoints})`,
        })
        .from(t.lessons)
        .innerJoin(he, and(eq(he.lessonId, t.lessons.id), eq(he.locale, "he")))
        .leftJoin(loc, and(eq(loc.lessonId, t.lessons.id), eq(loc.locale, locale)))
        .leftJoin(teacherHe, and(eq(teacherHe.teacherId, t.lessons.teacherId), eq(teacherHe.locale, "he")))
        .leftJoin(teacherLoc, and(eq(teacherLoc.teacherId, t.lessons.teacherId), eq(teacherLoc.locale, locale)))
        .where(and(eq(t.lessons.categoryId, category.id), eq(t.lessons.status, "published")))
        .orderBy(asc(t.lessons.publishedAt), asc(t.lessons.id));

      return {
        category,
        lessons: rows.map((row) => ({
          ...row,
          teacher: row.teacher ?? "",
          durationSec: row.durationSec ?? 0,
          description: row.description ?? "",
          keyPoints: row.keyPoints ?? [],
        })),
      };
    },

    async findLessonBySlug(slug) {
      const [row] = await getDb()
        .select({ id: t.lessons.id })
        .from(t.lessonTranslations)
        .innerJoin(t.lessons, eq(t.lessons.id, t.lessonTranslations.lessonId))
        .where(and(eq(t.lessonTranslations.slug, slug), eq(t.lessons.status, "published")))
        .limit(1);
      return row?.id ?? null;
    },
  };
}
