import { getTranslations } from "next-intl/server";
import { card } from "./ui";

type Page = "path" | "search" | "holidays" | "glossary" | "help";

// Pages that are in the navigation but not in the sketch yet: title, one line, same cards.
export async function PlaceholderPage({ page, children }: { page: Page; children?: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-2xl lg:max-w-none">
      <h1 className="text-2xl font-medium lg:text-3xl">{t(`pages.${page}.title`)}</h1>
      <p className="mt-1 mb-6 text-muted">{t(`pages.${page}.intro`)}</p>
      {children ?? <p className={`${card} p-5`}>{t("common.comingSoon")}</p>}
    </div>
  );
}
