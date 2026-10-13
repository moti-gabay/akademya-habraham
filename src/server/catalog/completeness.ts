import { LOCALES, type Locale } from "../i18n/locales";

// Which languages an entity is translated into, for the admin lists.
export const translationCompleteness = (translations: Partial<Record<Locale, unknown>>) =>
  Object.fromEntries(LOCALES.map((locale) => [locale, translations[locale] !== undefined])) as Record<Locale, boolean>;
