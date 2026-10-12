import { getLocale, getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { SignOut } from "@/components/SignOut";
import { card, outlineBtn, primaryBtn } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { authMode } from "@/lib/authMode";
import { getHelpContacts } from "@/lib/help";
import { userRepo } from "@/server/repos";

export default async function HelpPage() {
  const t = await getTranslations("pages.help");
  const tAuth = await getTranslations("auth");
  const locale = (await getLocale()) as Locale;
  const user = await userRepo.getById((await getPageActor(locale)).userId, locale);
  const { phone, phoneHref, whatsappHref } = getHelpContacts();
  return (
    <PlaceholderPage page="help">
      <div className={`${card} flex max-w-2xl flex-col gap-3 p-5`}>
        {whatsappHref && (
          <a href={whatsappHref} className={primaryBtn}>
            {t("whatsapp")}
          </a>
        )}
        {phoneHref && (
          <a href={phoneHref} className={outlineBtn}>
            {t("phone")} <span className="ltr-isolate">{phone}</span>
          </a>
        )}
        {!whatsappHref && !phoneHref && <p>{t("noContacts")}</p>}
      </div>
      {authMode === "clerk" && user && (
        <div className={`${card} mt-4 flex max-w-2xl flex-wrap items-center justify-between gap-3 p-5`}>
          <p>{tAuth("signedInAs", { name: user.name })}</p>
          <SignOut label={tAuth("signOut")} />
        </div>
      )}
    </PlaceholderPage>
  );
}
