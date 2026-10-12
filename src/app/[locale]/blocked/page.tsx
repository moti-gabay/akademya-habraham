import { getLocale, getTranslations } from "next-intl/server";
import { SignOut } from "@/components/SignOut";
import { card } from "@/components/ui";
import { redirect } from "@/i18n/navigation";
import { authMode } from "@/lib/authMode";

export default async function BlockedPage() {
  if (authMode !== "clerk") redirect({ href: "/", locale: await getLocale() });
  const t = await getTranslations("auth");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className={`${card} flex flex-col gap-3 p-5`}>
        <h1 className="text-2xl font-medium">{t("blockedTitle")}</h1>
        <p>{t("blockedText")}</p>
        <SignOut label={t("signOut")} />
      </div>
    </main>
  );
}
