import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { LOCALES } from "../i18n/locales";
import { VIDEO_STATUSES } from "../media/types";

// Tables are added milestone by milestone (see ARCHITECTURE.md §1.3). So far: users,
// the catalog core, the learning path, the glossary and per-user lesson progress.

export const localeEnum = pgEnum("locale", LOCALES);
export const categoryKindEnum = pgEnum("category_kind", ["holiday", "parsha", "halacha"]);
export const lessonAccessEnum = pgEnum("lesson_access", ["free", "members"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "processing", "published", "archived"]);
export const videoStatusEnum = pgEnum("video_status", VIDEO_STATUSES);
export const subtitleSourceEnum = pgEnum("subtitle_source", ["manual", "auto"]);
export const trackStatusEnum = pgEnum("track_status", ["draft", "published"]);
export const userRoleEnum = pgEnum("user_role", ["user", "editor", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "blocked", "deleted"]);
export const webhookProviderEnum = pgEnum("webhook_provider", ["clerk", "psp", "bunny"]);

// Case-insensitive text. The extension is enabled at the top of migration 0001.
const citext = customType<{ data: string }>({ dataType: () => "citext" });

const id = () => uuid().primaryKey().defaultRandom();
const sortOrder = () => integer("sort_order").notNull().default(0);
const locale = () => localeEnum().notNull();

// Identity. Rows are mirrored from Clerk by webhooks from Milestone 2 on.

export const users = pgTable("users", {
  id: id(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: citext().notNull(),
  name: text().notNull(),
  role: userRoleEnum().notNull().default("user"),
  status: userStatusEnum().notNull().default("active"),
  locale: localeEnum().notNull().default("he"),
  phoneEnc: text("phone_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Clerk's own updated_at for the user; an older webhook event than this is ignored.
  clerkUpdatedAt: timestamp("clerk_updated_at", { withTimezone: true }),
});

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

export const teachers = pgTable("teachers", {
  id: id(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teacherTranslations = pgTable(
  "teacher_translations",
  {
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.teacherId, t.locale] })],
);

export const lessons = pgTable("lessons", {
  id: id(),
  // Nullable: a lesson on the learning path need not belong to a holiday/parsha/halacha category.
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  durationSec: integer("duration_sec"),
  access: lessonAccessEnum().notNull().default("members"),
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
    keyPoints: text("key_points").array(),
    slug: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.locale] }), unique().on(t.locale, t.slug)],
);

// Media. The video itself lives at the video provider and the caption files in file
// storage; these rows record what was uploaded. Column names follow ARCHITECTURE §1.3.

// One current video per lesson. Replacing it replaces the row.
export const videoAssets = pgTable("video_assets", {
  id: id(),
  lessonId: uuid("lesson_id").notNull().unique().references(() => lessons.id, { onDelete: "cascade" }),
  bunnyVideoId: text("bunny_video_id").notNull().unique(),
  bunnyLibraryId: text("bunny_library_id").notNull(),
  status: videoStatusEnum().notNull().default("created"),
  durationSec: integer("duration_sec"),
  // The thumbnail the provider generated; lessons.thumbnail_key overrides it.
  thumbnailUrl: text("thumbnail_url"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  raw: jsonb(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lessonSubtitles = pgTable(
  "lesson_subtitles",
  {
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    locale: locale(),
    r2Key: text("r2_key").notNull(),
    // Null until the caption reached the video provider.
    bunnySyncedAt: timestamp("bunny_synced_at", { withTimezone: true }),
    source: subtitleSourceEnum().notNull().default("manual"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.locale] })],
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

// Telemetry

export const userLessonProgress = pgTable(
  "user_lesson_progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    lastPositionSec: integer("last_position_sec").notNull().default(0),
    watchedPct: integer("watched_pct").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

// Ops

// One row per delivered webhook. The unique key makes redelivery a no-op.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: webhookProviderEnum().notNull(),
    eventId: text("event_id").notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text(),
  },
  (t) => [unique().on(t.provider, t.eventId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    diff: jsonb(),
    ip: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.targetType, t.targetId), index().on(t.createdAt)],
);
