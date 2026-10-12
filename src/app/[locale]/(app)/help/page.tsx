import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { card, outlineBtn, primaryBtn } from "@/components/ui";
import { getHelpContacts } from "@/lib/help";

export default async function HelpPage() {
  const t = await getTranslations("pages.help");
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
    </PlaceholderPage>
  );
}
