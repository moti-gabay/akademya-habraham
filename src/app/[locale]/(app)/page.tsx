import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("nav");
  return <h1 className="text-2xl font-semibold">{t("home")}</h1>;
}
