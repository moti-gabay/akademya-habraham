import { getLocale, getTranslations } from "next-intl/server";
import { card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SECTIONS, type Section } from "@/lib/adminCatalog";
import { getAdminActor } from "@/lib/auth";
import { adminCatalogRepo } from "@/server/repos";

// Entry page of the admin area. Without a verified second factor it only explains how
// to get one.
export default async function AdminPage() {
  const t = await getTranslations("admin");
  const actor = await getAdminActor((await getLocale()) as Locale);
  if (!actor.secondFactorVerified) {
    return (
      <>
        <h1 className="text-2xl font-medium lg:text-3xl">{t("title")}</h1>
        <div className={`${card} mt-6 p-5`}>
          <h2 className="text-lg font-medium">{t("secondFactorTitle")}</h2>
          <p className="mt-1">{t("secondFactorText")}</p>
        </div>
      </>
    );
  }

  const sections = Object.keys(SECTIONS) as Section[];
  const counts = await Promise.all(sections.map(async (section) => (await adminCatalogRepo.list(SECTIONS[section])).length));
  return (
    <>
      <h1 className="text-2xl font-medium lg:text-3xl">{t("title")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("intro")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map((section, index) => (
          <li key={section}>
            <Link href={`/admin/${section}`} className={`${card} tap block p-5 hover:bg-green-tint/50`}>
              <span className="block text-lg font-medium text-green">{t(`sections.${section}.title`)}</span>
              <span className="text-muted">{t("count", { count: counts[index] })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
