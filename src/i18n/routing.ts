import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/server/i18n/locales";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type { Locale };

export const localeNames: Record<Locale, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
  es: "Español",
};

export const dirOf = (locale: Locale) => (locale === "he" ? "rtl" : "ltr");
