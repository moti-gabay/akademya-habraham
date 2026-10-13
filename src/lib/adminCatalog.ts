import type { Entity } from "@/server/catalog/schemas";
import type { Locale } from "@/server/i18n/locales";

// Admin sections as they appear in addresses and in the messages ("glossary" manages
// terms). Steps have no section of their own: they are edited inside their path.
export const SECTIONS = {
  lessons: "lessons",
  categories: "categories",
  teachers: "teachers",
  glossary: "terms",
  tracks: "tracks",
} as const satisfies Record<string, Entity>;
export type Section = keyof typeof SECTIONS;

export const isSection = (value: string): value is Section => Object.hasOwn(SECTIONS, value);

type Row = { name?: string; title?: string; term?: string };

// What an entity is called in lists: its name in the admin's language, or in Hebrew.
export function labelOf(record: { translations: { he: Row } & Partial<Record<Locale, Row>> }, locale: Locale): string {
  const row = { ...record.translations.he, ...record.translations[locale] };
  return row.title ?? row.name ?? row.term ?? "";
}
