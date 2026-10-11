import { getTranslations } from "next-intl/server";
import { TermList } from "@/components/TermList";
import { card, outlineBtn, primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getHelpContacts } from "@/lib/help";
import type { GlossaryTerm, Holiday } from "@/server/repos";

export async function HolidayCard({ holiday }: { holiday: Holiday }) {
  const t = await getTranslations("home");
  return (
    <section className="rounded-card bg-cream p-4">
      <p className="text-sm font-medium text-gold">{t("nextHoliday", { date: holiday.hebrewDate })}</p>
      <h2 className="mt-1 text-xl font-medium">{holiday.name}</h2>
      <p className="mt-1 text-sm">
        {t("holidayMeta", { description: holiday.description, minutes: holiday.lessonMinutes })}
      </p>
      <Link href={`/lessons/${holiday.lessonId}`} className={`${outlineBtn} mt-3 w-full`}>
        {t("holidayCta", { holiday: holiday.name })}
      </Link>
    </section>
  );
}

export async function GlossaryPreview({ terms, className = "" }: { terms: GlossaryTerm[]; className?: string }) {
  const t = await getTranslations("home");
  return (
    <section className={`${card} p-4 ${className}`}>
      <h2 className="text-lg font-medium">{t("glossaryTitle")}</h2>
      <TermList terms={terms} />
      <Link href="/glossary" className="tap inline-flex items-center font-medium text-green">
        {t("allTerms")}
      </Link>
    </section>
  );
}

export async function HelpCard({ className = "" }: { className?: string }) {
  const t = await getTranslations("home");
  const { phone, phoneHref, whatsappHref } = getHelpContacts();
  const contactHref = whatsappHref || phoneHref;
  const linkClass = `${primaryBtn} mt-3 w-full`;
  return (
    <section className={`rounded-card bg-green-tint p-4 ${className}`}>
      <h2 className="text-lg font-medium">{t("helpTitle")}</h2>
      <p className="mt-1 text-sm">
        {t("helpText")} {phone && <span className="ltr-isolate inline-block font-medium">{phone}</span>}
      </p>
      {contactHref ? (
        <a href={contactHref} className={linkClass}>
          {t("talkToUs")}
        </a>
      ) : (
        <Link href="/help" className={linkClass}>
          {t("talkToUs")}
        </Link>
      )}
    </section>
  );
}
