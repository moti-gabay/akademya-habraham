import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { LOCALES } from "../i18n/locales";

// Tables are added milestone by milestone (see ARCHITECTURE.md §1.3). This file holds
// the learning path and glossary, plus the catalog tables they reference.

export const localeEnum = pgEnum("locale", LOCALES);
export const categoryKindEnum = pgEnum("category_kind", ["holiday", "parsha", "halacha"]);
export const lessonAccessEnum = pgEnum("lesson_access", ["free", "subscriber"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "processing", "published", "archived"]);
export const trackStatusEnum = pgEnum("track_status", ["draft", "published"]);

const id = () => uuid().primaryKey().defaultRandom();
const sortOrder = () => integer("sort_order").notNull().default(0);
const locale = () => localeEnum().notNull();

// Catalog

export const categories = pgTable("categories", {
  id: id(),
  kind: categoryKindEnum().notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  sortOrder: sortOrder(),
  hebcalCode: text("hebcal_code"),
});

export const categoryTranslations = pgTable(
  "category_translations",
  {
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] }), unique().on(t.locale, t.slug)],
);

export const lessons = pgTable("lessons", {
  id: id(),
  // Nullable: a lesson on the learning path need not belong to a holiday/parsha/halacha category.
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  // No foreign keys yet: `users` arrives in Milestone 2 and the teacher model is still open.
  teacherId: uuid("teacher_id"),
  createdBy: uuid("created_by"),
  durationSec: integer("duration_sec"),
  access: lessonAccessEnum().notNull().default("subscriber"),
  status: lessonStatusEnum().notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  thumbnailKey: text("thumbnail_key"),
  parshaCode: text("parsha_code"),
  holidayCode: text("holiday_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Search columns (tsvector, pg_trgm) are added with search in Milestone 3.
export const lessonTranslations = pgTable(
  "lesson_translations",
  {
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    locale: locale(),
    title: text().notNull(),
    description: text(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.locale] }), unique().on(t.locale, t.slug)],
);

// Learning path: track → steps → ordered lessons

export const tracks = pgTable("tracks", {
  id: id(),
  code: text().notNull().unique(),
  sortOrder: sortOrder(),
  status: trackStatusEnum().notNull().default("draft"),
});

export const trackTranslations = pgTable(
  "track_translations",
  {
    trackId: uuid("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.locale] }), unique().on(t.locale, t.slug)],
);

export const trackSteps = pgTable(
  "track_steps",
  {
    id: id(),
    trackId: uuid("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
    sortOrder: sortOrder(),
  },
  (t) => [unique().on(t.trackId, t.sortOrder)],
);

export const trackStepTranslations = pgTable(
  "track_step_translations",
  {
    stepId: uuid("step_id").notNull().references(() => trackSteps.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.stepId, t.locale] })],
);

export const trackStepLessons = pgTable(
  "track_step_lessons",
  {
    stepId: uuid("step_id").notNull().references(() => trackSteps.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    sortOrder: sortOrder(),
  },
  // The index serves "which step is this lesson in" (continue-watching card, player meta).
  (t) => [primaryKey({ columns: [t.stepId, t.lessonId] }), index().on(t.lessonId)],
);

// Glossary

export const glossaryTerms = pgTable("glossary_terms", {
  id: id(),
  code: text().notNull().unique(),
  sortOrder: sortOrder(),
});

export const glossaryTermTranslations = pgTable(
  "glossary_term_translations",
  {
    termId: uuid("term_id").notNull().references(() => glossaryTerms.id, { onDelete: "cascade" }),
    locale: locale(),
    term: text().notNull(),
    shortDefinition: text("short_definition").notNull(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.termId, t.locale] }), unique().on(t.locale, t.slug)],
);

export const lessonGlossaryTerms = pgTable(
  "lesson_glossary_terms",
  {
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    termId: uuid("term_id").notNull().references(() => glossaryTerms.id, { onDelete: "cascade" }),
    sortOrder: sortOrder(),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.termId] }), index().on(t.termId)],
);
