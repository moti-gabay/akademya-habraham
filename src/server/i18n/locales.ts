export const LOCALES = ["he", "en", "ru", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";
// Hebrew first, as everywhere a list of languages is shown (and as the database orders them).
export const byLocale = (a: Locale, b: Locale) => LOCALES.indexOf(a) - LOCALES.indexOf(b);

// The name of each language in that language (language menus, caption tracks).
export const localeNames: Record<Locale, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
  es: "Español",
};

// Content is always written in Hebrew first; other locales are optional.
export type Localized<T = string> = { he: T } & Partial<Record<Locale, T>>;

export const localize = <T>(value: Localized<T>, locale: Locale): T => value[locale] ?? value.he;
