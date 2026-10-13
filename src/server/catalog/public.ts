import { LOCALES, type Locale } from "../i18n/locales";
import type { CatalogLesson, CatalogRepo, HolidayCategory } from "../repos/types";

// A lesson preview by the slugs in its address. The slugs may be in another language
// (after a language switch); the caller redirects when they differ from the result's.
export async function findLessonPreview(
  repo: CatalogRepo,
  categorySlug: string,
  lessonSlug: string,
  locale: Locale,
): Promise<{ category: HolidayCategory; lesson: CatalogLesson } | null> {
  const found = await repo.getHolidayCategory(categorySlug, locale);
  if (!found) return null;
  let lesson = found.lessons.find((item) => item.slug === lessonSlug);
  if (!lesson) {
    const id = await repo.findLessonBySlug(lessonSlug);
    lesson = found.lessons.find((item) => item.id === id);
  }
  return lesson ? { category: found.category, lesson } : null;
}

// Every public catalog address, for prerendering.
export async function listPublicParams(repo: CatalogRepo) {
  const params: { locale: Locale; slug: string; lessonSlug: string }[] = [];
  for (const locale of LOCALES) {
    for (const { slug } of await repo.listHolidayCategories(locale)) {
      const found = await repo.getHolidayCategory(slug, locale);
      for (const lesson of found?.lessons ?? []) params.push({ locale, slug, lessonSlug: lesson.slug });
    }
  }
  return params;
}
