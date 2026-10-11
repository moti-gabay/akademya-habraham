export const LOCALES = ["he", "en", "ru", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

// Content is always written in Hebrew first; other locales are optional.
export type Localized<T = string> = { he: T } & Partial<Record<Locale, T>>;

export const localize = <T>(value: Localized<T>, locale: Locale): T => value[locale] ?? value.he;
