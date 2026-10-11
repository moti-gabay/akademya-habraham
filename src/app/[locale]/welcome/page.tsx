import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations();
  return <main className="p-4 text-xl font-medium text-green">{t("brand")}</main>;
}
