import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { card } from "@/components/ui";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getHolidayCategory } from "@/lib/catalogCache";
import { safeStaticParams } from "@/lib/staticParams";
import { listPublicParams } from "@/server/catalog/public";
import { catalogRepo } from "@/server/repos";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return safeStaticParams("holidays/[slug]", async () => {
    const seen = new Set<string>();
    return (await listPublicParams(catalogRepo))
      .map(({ locale, slug }) => ({ locale, slug }))
      .filter(({ locale, slug }) => !seen.has(`${locale}/${slug}`) && seen.add(`${locale}/${slug}`));
  });
}

// The published lessons of one holiday.
export default async function HolidayPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug: rawSlug, ...rest } = await params;
  const locale = rest.locale as Locale;
  setRequestLocale(locale);
  const slug = decodeURIComponent(rawSlug);
  const found = await getHolidayCategory(slug, locale);
  if (!found) notFound();
  const { category, lessons } = found;
  // The address used another language's name (after a language switch).
  if (category.slug !== slug) redirect({ href: `/holidays/${category.slug}`, locale });
  const t = await getTranslations("catalog");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/holidays" className="tap inline-flex items-center font-medium text-green underline">
        {t("allHolidays")}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-medium lg:text-3xl">{category.name}</h1>
      <ul className="grid gap-3">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/holidays/${category.slug}/${lesson.slug}`} className={`${card} tap block p-5 hover:bg-green-tint/50`}>
              {lesson.access === "free" && (
                <span className="mb-2 inline-block rounded-full bg-cream px-3 py-1 text-sm font-medium text-gold">{t("free")}</span>
              )}
              <span className="block text-lg font-medium text-green">{lesson.title}</span>
              <span className="block text-muted">
                {t("lessonMeta", { teacher: lesson.teacher, minutes: Math.round(lesson.durationSec / 60) })}
              </span>
              {lesson.description && <span className="mt-2 block">{lesson.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
