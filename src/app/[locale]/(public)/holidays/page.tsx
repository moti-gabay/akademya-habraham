import { getTranslations, setRequestLocale } from "next-intl/server";
import { card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { listHolidayCategories } from "@/lib/catalogCache";
import { safeStaticParams } from "@/lib/staticParams";
import { catalogRepo } from "@/server/repos";

export const revalidate = 3600;
export const dynamicParams = true;

// Prerendered per locale, but only when the catalog can be read at build time.
export function generateStaticParams() {
  return safeStaticParams("holidays", async () => {
    await catalogRepo.listHolidayCategories(routing.defaultLocale);
    return routing.locales.map((locale) => ({ locale }));
  });
}

// The holidays that have lessons.
export default async function HolidaysPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations();
  const categories = await listHolidayCategories(locale);

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none">
      <h1 className="text-2xl font-medium lg:text-3xl">{t("pages.holidays.title")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("pages.holidays.intro")}</p>
      {categories.length === 0 ? (
        <p className={`${card} p-5`}>{t("catalog.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/holidays/${category.slug}`} className={`${card} tap block p-5 hover:bg-green-tint/50`}>
                <span className="block text-xl font-medium text-green">{category.name}</span>
                <span className="text-muted">{t("catalog.lessonCount", { count: category.lessonCount })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
