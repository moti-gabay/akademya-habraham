import { createHash } from "node:crypto";
import { getTableColumns, sql } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { LOCALES, type Localized } from "../i18n/locales";
import {
  glossary,
  holidayCategories,
  initialProgress,
  lessons,
  SAMPLE_USER_ID,
  steps,
  teacher,
  track,
  users,
} from "../mock/data";
import type { Db } from "./client";
import { sampleVideo } from "../mock/store";
import * as t from "./schema";

// Seeds the sample content from src/server/mock/data.ts (all fictional).
// Rows have fixed ids and are upserted, so running it again is safe. It never deletes,
// and it leaves existing progress rows alone.

const seedId = (key: string) => {
  const hex = createHash("md5").update(`ah-seed:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

// Database id of a lesson from the sample data, e.g. lessonSeedId("shabbat-6").
export const lessonSeedId = (key: string) => seedId(`lesson:${key}`);

const PLACEHOLDER_MINUTES = 30;
const lessonWord: Localized = { he: "שיעור", en: "Lesson", ru: "Урок", es: "Clase" };

const translations = <Row>(value: Localized, row: (locale: (typeof LOCALES)[number], text: string) => Row) =>
  LOCALES.flatMap((locale) => (value[locale] ? [row(locale, value[locale])] : []));

async function upsert<T extends PgTable>(db: Db, table: T, target: PgColumn[], rows: T["$inferInsert"][]) {
  if (rows.length === 0) return;
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  ) as PgUpdateSetSource<T>;
  await db.insert(table).values(rows).onConflictDoUpdate({ target, set });
}

// Every step gets its full number of lessons. The few lessons the sketch names keep
// their real titles; the rest are placeholders such as "שבת · שיעור 3".
function buildLessons() {
  return steps.flatMap((step) =>
    Array.from({ length: step.lessonsTotal }, (_, index) => {
      const number = index + 1;
      const named = Object.entries(lessons).find(([, l]) => l.stepId === step.id && l.lessonNumber === number);
      const key = named?.[0] ?? `${step.id}-${number}`;
      const title: Localized = named?.[1].title ?? {
        he: `${step.name.he} · ${lessonWord.he} ${number}`,
        ...Object.fromEntries(translations(step.name, (locale, name) => [locale, `${name} · ${lessonWord[locale]} ${number}`])),
      };
      return {
        key,
        id: lessonSeedId(key),
        stepId: seedId(`step:${step.id}`),
        number,
        title,
        durationSec: named?.[1].durationSec ?? PLACEHOLDER_MINUTES * 60,
        termIds: named?.[1].termIds ?? [],
        categoryId: named?.[1].categoryId,
        access: named?.[1].access ?? ("members" as const),
        status: named?.[1].status ?? ("published" as const),
        description: named?.[1].description,
        keyPoints: named?.[1].keyPoints,
        completed: number <= step.lessonsDone,
      };
    }),
  );
}

export async function seed(db: Db) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed sample data when NODE_ENV=production.");
  }

  const trackId = seedId(`track:${track.code}`);
  const teacherId = seedId(`teacher:${teacher.id}`);
  const categoryId = (id: string) => seedId(`category:${id}`);
  const termId = (id: string) => seedId(`term:${id}`);
  const seedLessons = buildLessons();
  const publishedAt = new Date("2026-10-01T00:00:00Z");

  await upsert(db, t.users, [t.users.id], [
    {
      id: SAMPLE_USER_ID,
      clerkUserId: "seed_sample_user",
      email: users[SAMPLE_USER_ID].email,
      name: users[SAMPLE_USER_ID].name.he,
    },
  ]);

  await upsert(db, t.teachers, [t.teachers.id], [{ id: teacherId, createdAt: publishedAt }]);
  await upsert(
    db,
    t.teacherTranslations,
    [t.teacherTranslations.teacherId, t.teacherTranslations.locale],
    translations(teacher.name, (locale, name) => ({ teacherId, locale, name })),
  );

  await upsert(
    db,
    t.categories,
    [t.categories.id],
    holidayCategories.map((category, index) => ({
      id: categoryId(category.id),
      kind: "holiday" as const,
      sortOrder: index + 1,
      hebcalCode: category.hebcalCode,
    })),
  );
  await upsert(
    db,
    t.categoryTranslations,
    [t.categoryTranslations.categoryId, t.categoryTranslations.locale],
    holidayCategories.flatMap((category) =>
      translations(category.name, (locale, name) => ({ categoryId: categoryId(category.id), locale, name, slug: category.id })),
    ),
  );

  await upsert(
    db,
    t.lessons,
    [t.lessons.id],
    // One second apart, so "first published" has a stable order.
    seedLessons.map((lesson, index) => ({
      id: lesson.id,
      categoryId: lesson.categoryId ? categoryId(lesson.categoryId) : null,
      teacherId,
      createdBy: SAMPLE_USER_ID,
      durationSec: lesson.durationSec,
      access: lesson.access,
      status: lesson.status,
      publishedAt: lesson.status === "published" ? new Date(publishedAt.getTime() + index * 1000) : null,
      createdAt: publishedAt,
    })),
  );
  await upsert(
    db,
    t.lessonTranslations,
    [t.lessonTranslations.lessonId, t.lessonTranslations.locale],
    seedLessons.flatMap((lesson) =>
      translations(lesson.title, (locale, title) => ({
        lessonId: lesson.id,
        locale,
        title,
        description: lesson.description?.[locale] ?? null,
        keyPoints: lesson.keyPoints?.[locale] ?? null,
        slug: lesson.key,
      })),
    ),
  );

  // The same finished sample video per lesson as in mock mode.
  await upsert(
    db,
    t.videoAssets,
    [t.videoAssets.lessonId],
    seedLessons.map((lesson) => {
      const video = sampleVideo(lesson.key, lesson.durationSec);
      return {
        id: seedId(`video:${lesson.key}`),
        lessonId: lesson.id,
        bunnyVideoId: video.videoId,
        bunnyLibraryId: video.libraryId,
        status: video.status,
        durationSec: video.durationSec,
        readyAt: video.readyAt,
        createdAt: publishedAt,
      };
    }),
  );

  await upsert(db, t.tracks, [t.tracks.id], [{ id: trackId, code: track.code, sortOrder: 1, status: "published" as const }]);
  await upsert(
    db,
    t.trackTranslations,
    [t.trackTranslations.trackId, t.trackTranslations.locale],
    translations(track.name, (locale, name) => ({ trackId, locale, name, slug: track.code })),
  );
  await upsert(
    db,
    t.trackSteps,
    [t.trackSteps.id],
    steps.map((step, index) => ({ id: seedId(`step:${step.id}`), trackId, sortOrder: index + 1 })),
  );
  await upsert(
    db,
    t.trackStepTranslations,
    [t.trackStepTranslations.stepId, t.trackStepTranslations.locale],
    steps.flatMap((step) =>
      translations(step.name, (locale, name) => ({ stepId: seedId(`step:${step.id}`), locale, name, slug: step.id })),
    ),
  );
  await upsert(
    db,
    t.trackStepLessons,
    [t.trackStepLessons.stepId, t.trackStepLessons.lessonId],
    seedLessons.map((lesson) => ({ stepId: lesson.stepId, lessonId: lesson.id, sortOrder: lesson.number })),
  );

  await upsert(
    db,
    t.glossaryTerms,
    [t.glossaryTerms.id],
    glossary.map((term, index) => ({ id: termId(term.id), code: term.id, sortOrder: index + 1 })),
  );
  await upsert(
    db,
    t.glossaryTermTranslations,
    [t.glossaryTermTranslations.termId, t.glossaryTermTranslations.locale],
    glossary.flatMap((term) =>
      translations(term.term, (locale, name) => ({
        termId: termId(term.id),
        locale,
        term: name,
        shortDefinition: term.definition[locale] ?? term.definition.he,
        slug: term.id,
      })),
    ),
  );
  await upsert(
    db,
    t.lessonGlossaryTerms,
    [t.lessonGlossaryTerms.lessonId, t.lessonGlossaryTerms.termId],
    seedLessons.flatMap((lesson) =>
      lesson.termIds.map((id, index) => ({ lessonId: lesson.id, termId: termId(id), sortOrder: index + 1 })),
    ),
  );

  // The sample user's progress, as in the sketch: finished lessons, plus one stopped midway.
  const stoppedAt = new Date("2026-10-10T00:00:00Z");
  const progress = [
    ...seedLessons
      .filter((lesson) => lesson.completed)
      .map((lesson) => ({
        userId: SAMPLE_USER_ID,
        lessonId: lesson.id,
        lastPositionSec: lesson.durationSec,
        watchedPct: 100,
        completedAt: publishedAt,
        updatedAt: publishedAt,
      })),
    ...initialProgress.map(([userId, key, positionSec]) => ({
      userId,
      lessonId: lessonSeedId(key),
      lastPositionSec: positionSec,
      watchedPct: Math.round((positionSec / lessons[key].durationSec) * 100),
      completedAt: null,
      updatedAt: stoppedAt,
    })),
  ];
  await db.insert(t.userLessonProgress).values(progress).onConflictDoNothing();
}
