import { getTranslations } from "next-intl/server";
import { card } from "./ui";

type Page = "path" | "search" | "holidays" | "glossary" | "help";

export async function PlaceholderPage({ page, children }: { page: Page; children?: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">{t(`pages.${page}.title`)}</h1>
      <p className="mt-1 text-muted">{t(`pages.${page}.intro`)}</p>
      <div className={`${card} mt-6 p-5`}>{children ?? <p>{t("common.comingSoon")}</p>}</div>
    </div>
  );
}
