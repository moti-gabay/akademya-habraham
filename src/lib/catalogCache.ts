import { unstable_cache } from "next/cache";
import { findLessonPreview } from "@/server/catalog/public";
import type { Locale } from "@/server/i18n/locales";
import { catalogRepo } from "@/server/repos";

// Tag on every cached public catalog read. Admin writes revalidate it.
export const CATALOG_TAG = "catalog";

// The public catalog pages read through these, so their data is tagged and an admin
// change reaches them. The hourly limit is a backstop.
const cached = <Args extends unknown[], Result>(name: string, load: (...args: Args) => Promise<Result>) =>
  unstable_cache(load, ["catalog", name], { tags: [CATALOG_TAG], revalidate: 3600 });

export const listHolidayCategories = cached("categories", (locale: Locale) => catalogRepo.listHolidayCategories(locale));
export const getHolidayCategory = cached("category", (slug: string, locale: Locale) =>
  catalogRepo.getHolidayCategory(slug, locale),
);
export const getLessonPreview = cached("preview", (categorySlug: string, lessonSlug: string, locale: Locale) =>
  findLessonPreview(catalogRepo, categorySlug, lessonSlug, locale),
);
