import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["he", "en", "ru", "es"],
  defaultLocale: "he",
  localePrefix: "always",
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
  es: "Español",
};

export const dirOf = (locale: Locale) => (locale === "he" ? "rtl" : "ltr");
