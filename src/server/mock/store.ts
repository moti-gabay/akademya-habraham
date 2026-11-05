import type { AuditEntry } from "../auth/audit";
import type { Entity } from "../catalog/schemas";
import type { AdminRecord } from "../catalog/types";
import { FAKE_LIBRARY_ID, FAKE_VIDEO_PREFIX } from "../media/fake";
import type { Caption, VideoAsset } from "../media/types";
import { LOCALES, type Locale, type Localized } from "../i18n/locales";
import {
  glossary,
  holidayCategories,
  initialProgress,
  lessons,
  SAMPLE_USER_ID,
  type SampleLesson,
  sampleLessons,
  steps,
  teacher,
  track,
} from "./data";

// Mock only: the one place in src/server that keeps state in memory. The catalog is
// held as the admin sees it (every language), so the admin screens can edit it and the
// public repos read the result. It resets on restart.
export type MockStore = { [E in Entity]: Map<string, AdminRecord<E>> } & {
  // Ordered ids: the lessons of a step, the glossary terms of a lesson.
  stepLessons: Map<string, string[]>;
  lessonTerms: Map<string, string[]>;
  // Media records by lesson id.
  videos: Map<string, VideoAsset>;
  captions: Map<string, Caption[]>;
  webhooks: Map<string, { processed: boolean }>;
  // Progress by user, then by lesson. completedAt is set once and never cleared.
  progress: Map<string, Map<string, MockProgress>>;
  audit: AuditEntry[];
};

export type MockProgress = { lessonId: string; positionSec: number; watchedPct: number; completedAt: number | null; updatedAt: number };

// One row per locale the text exists in.
const rows = <Row>(value: Localized, row: (text: string, locale: Locale) => Row) =>
  Object.fromEntries(LOCALES.flatMap((locale) => (value[locale] ? [[locale, row(value[locale], locale)]] : []))) as {
    he: Row;
  } & Partial<Record<Locale, Row>>;

const PUBLISHED_AT = Date.parse("2026-10-01T00:00:00Z");
const STOPPED_AT = Date.parse("2026-10-10T00:00:00Z");

// Every sample lesson has a finished (fake) video, so it can be published. It has no
// thumbnail: the home card keeps the sketch's placeholder until one is uploaded.
export const sampleVideo = (lessonKey: string, durationSec: number): VideoAsset => ({
  videoId: `${FAKE_VIDEO_PREFIX}sample-${lessonKey}`,
  libraryId: FAKE_LIBRARY_ID,
  status: "ready",
  durationSec,
  thumbnailUrl: null,
  readyAt: new Date(PUBLISHED_AT),
});

// The sample user's progress, as in the seed: finished lessons, plus one stopped midway.
function sampleProgress(all: SampleLesson[]): MockStore["progress"] {
  const progress: MockStore["progress"] = new Map();
  const add = (userId: string, entry: MockProgress) =>
    progress.set(userId, (progress.get(userId) ?? new Map()).set(entry.lessonId, entry));
  for (const { key, durationSec } of all.filter((lesson) => lesson.completed)) {
    add(SAMPLE_USER_ID, { lessonId: key, positionSec: durationSec, watchedPct: 100, completedAt: PUBLISHED_AT, updatedAt: PUBLISHED_AT });
  }
  for (const [userId, lessonId, positionSec] of initialProgress) {
    const watchedPct = Math.round((positionSec / lessons[lessonId].durationSec) * 100);
    add(userId, { lessonId, positionSec, watchedPct, completedAt: null, updatedAt: STOPPED_AT });
  }
  return progress;
}

// The sample content of data.ts. Sample ids are readable keys ("shabbat-6"); rows
// created in the admin screens get UUIDs.
export function buildStore(): MockStore {
  const all = sampleLessons();
  return {
    categories: new Map(
      holidayCategories.map((category, index) => [
        category.id,
        {
          id: category.id,
          kind: "holiday",
          parentId: null,
          sortOrder: index + 1,
          hebcalCode: category.hebcalCode,
          translations: rows(category.name, (name) => ({ name, slug: category.id })),
        },
      ]),
    ),
    teachers: new Map([[teacher.id, { id: teacher.id, translations: rows(teacher.name, (name) => ({ name })) }]]),
    lessons: new Map(
      all.map((lesson, index) => {
        const { key, status } = lesson;
        return [
          key,
          {
            id: key,
            categoryId: lesson.categoryId ?? null,
            teacherId: teacher.id,
            durationSec: lesson.durationSec,
            access: lesson.access,
            status,
            publishedAt: status === "published" ? new Date(PUBLISHED_AT + index * 1000) : null,
            thumbnailKey: null,
            translations: rows(lesson.title, (title, locale) => ({
              title,
              description: lesson.description?.[locale] ?? null,
              keyPoints: lesson.keyPoints?.[locale] ?? [],
              slug: key,
            })),
          },
        ];
      }),
    ),
    terms: new Map(
      glossary.map((term, index) => [
        term.id,
        {
          id: term.id,
          code: term.id,
          sortOrder: index + 1,
          translations: rows(term.term, (text, locale) => ({
            term: text,
            shortDefinition: term.definition[locale] ?? term.definition.he,
            slug: term.id,
          })),
        },
      ]),
    ),
    tracks: new Map([
      [
        track.code,
        {
          id: track.code,
          code: track.code,
          sortOrder: 1,
          status: "published",
          translations: rows(track.name, (name) => ({ name, slug: track.code })),
        },
      ],
    ]),
    steps: new Map(
      steps.map((step, index) => [
        step.id,
        {
          id: step.id,
          trackId: track.code,
          sortOrder: index + 1,
          translations: rows(step.name, (name) => ({ name, slug: step.id })),
        },
      ]),
    ),
    // Drafts included: this is the order the admin sees.
    stepLessons: new Map(steps.map((step) => [step.id, all.filter((lesson) => lesson.stepId === step.id).map((lesson) => lesson.key)])),
    lessonTerms: new Map(all.map((lesson) => [lesson.key, [...lesson.termIds]])),
    videos: new Map(all.map((lesson) => [lesson.key, sampleVideo(lesson.key, lesson.durationSec)])),
    captions: new Map(),
    webhooks: new Map(),
    progress: sampleProgress(all),
    audit: [],
  };
}

// On globalThis so route handlers and pages share it.
const globalStore = globalThis as { __mockStore?: MockStore };
export const mockStore = (globalStore.__mockStore ??= buildStore());
