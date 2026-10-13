import { useTranslations } from "next-intl";
import { localeNames } from "@/i18n/routing";
import { translationCompleteness } from "@/server/catalog/completeness";
import { LOCALES, type Locale } from "@/server/i18n/locales";

// Which languages an entity is translated into: a mark and a spoken label, not colour alone.
export function CompletenessBadges({ translations }: { translations: Partial<Record<Locale, unknown>> }) {
  const t = useTranslations("admin.languages");
  const done = translationCompleteness(translations);
  return (
    <ul aria-label={t("label")} className="flex flex-wrap gap-1 text-sm">
      {LOCALES.map((locale) => (
        <li
          key={locale}
          className={`rounded-full border px-2 py-0.5 ${done[locale] ? "border-green bg-green-tint text-green" : "border-line text-muted"}`}
        >
          <span aria-hidden="true" className="ltr-isolate">
            {locale.toUpperCase()} {done[locale] ? "✓" : "–"}
          </span>
          <span className="sr-only">{t(done[locale] ? "translated" : "missing", { language: localeNames[locale] })}</span>
        </li>
      ))}
    </ul>
  );
}
