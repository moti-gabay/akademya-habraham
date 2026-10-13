import { getLocale, getTranslations } from "next-intl/server";
import { card } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { getAdminActor } from "@/lib/auth";

// Placeholder for the admin area (Milestone 6). The gate is real: staff only, and only
// in a session where a second factor was verified.
export default async function AdminPage() {
  const t = await getTranslations("admin");
  const actor = await getAdminActor((await getLocale()) as Locale);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-medium lg:text-3xl">{t("title")}</h1>
      <div className={`${card} mt-6 p-5`}>
        {actor.secondFactorVerified ? (
          <p>{t("intro")}</p>
        ) : (
          <>
            <h2 className="text-lg font-medium">{t("secondFactorTitle")}</h2>
            <p className="mt-1">{t("secondFactorText")}</p>
          </>
        )}
      </div>
    </div>
  );
}
