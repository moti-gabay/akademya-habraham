import type { AuditEntry } from "../auth/audit";
import type { Entity } from "../catalog/schemas";
import type { AdminRecord } from "../catalog/types";
import { LOCALES, type Locale, type Localized } from "../i18n/locales";
import { glossary, holidayCategories, initialProgress, lessons, steps, teacher, track } from "./data";

// Mock only: the one place in src/server that keeps state in memory. The catalog is
// held as the admin sees it (every language), so the admin screens can edit it and the
// public repos read the result. It resets on restart.
export type MockStore = { [E in Entity]: Map<string, AdminRecord<E>> } & {
  // Ordered ids: the lessons of a step, the glossary terms of a lesson.
  stepLessons: Map<string, string[]>;
  lessonTerms: Map<string, string[]>;
  progress: Map<string, Map<string, { lessonId: string; positionSec: number; updatedAt: number }>>;
  audit: AuditEntry[];
};

// One row per locale the text exists in.
const rows = <Row>(value: Localized, row: (text: string, locale: Locale) => Row) =>
  Object.fromEntries(LOCALES.flatMap((locale) => (value[locale] ? [[locale, row(value[locale], locale)]] : []))) as {
    he: Row;
  } & Partial<Record<Locale, Row>>;

const PUBLISHED_AT = Date.parse("2026-10-01T00:00:00Z");

// The sample content of data.ts. Sample ids are readable keys ("shabbat-6"); rows
// created in the admin screens get UUIDs.
export function buildStore(): MockStore {
  const lessonKeys = Object.keys(lessons);
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
      lessonKeys.map((key, index) => {
        const lesson = lessons[key];
        const status = lesson.status ?? "published";
        return [
          key,
          {
            id: key,
            categoryId: lesson.categoryId ?? null,
            teacherId: teacher.id,
            durationSec: lesson.durationSec,
            access: lesson.access ?? "members",
            status,
            publishedAt: status === "published" ? new Date(PUBLISHED_AT + index * 1000) : null,
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
    stepLessons: new Map(
      steps.map((step) => [
        step.id,
        lessonKeys
          .filter((key) => lessons[key].stepId === step.id)
          .sort((a, b) => lessons[a].lessonNumber - lessons[b].lessonNumber),
      ]),
    ),
    lessonTerms: new Map(lessonKeys.map((key) => [key, [...lessons[key].termIds]])),
    progress: new Map(
      initialProgress.map(([userId, lessonId, positionSec]) => [
        userId,
        new Map([[lessonId, { lessonId, positionSec, updatedAt: 0 }]]),
      ]),
    ),
    audit: [],
  };
}

// On globalThis so route handlers and pages share it.
const globalStore = globalThis as { __mockStore?: MockStore };
export const mockStore = (globalStore.__mockStore ??= buildStore());
