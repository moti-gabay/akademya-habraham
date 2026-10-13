import { and, asc, count, eq, inArray, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { writeAudit } from "../auth/audit";
import type { CatalogInput, Entity } from "../catalog/schemas";
import type { AdminCatalogRepo, AdminRecord } from "../catalog/types";
import type { Locale } from "../i18n/locales";
import { atomic } from "./atomic";
import type { Db } from "./client";
import * as t from "./schema";
import { isUuid } from "./uuid";

// Drizzle implementation of the admin catalog. The six entities share one shape (a row
// plus one translation row per locale), so they share the code and differ only in the
// table definitions below. Input field names are the column keys.

type Columns = PgTable & Record<string, PgColumn>;
const columns = (table: PgTable) => table as Columns;
type Row = Record<string, unknown>;

const defs: Record<
  Entity,
  { table: Columns; tr: Columns; fk: string; base: string[]; managed: string[]; order: string[] }
> = {
  categories: {
    table: columns(t.categories),
    tr: columns(t.categoryTranslations),
    fk: "categoryId",
    base: ["kind", "parentId", "sortOrder", "hebcalCode"],
    managed: [],
    order: ["sortOrder", "id"],
  },
  teachers: {
    table: columns(t.teachers),
    tr: columns(t.teacherTranslations),
    fk: "teacherId",
    base: [],
    managed: [],
    order: ["createdAt", "id"],
  },
  lessons: {
    table: columns(t.lessons),
    tr: columns(t.lessonTranslations),
    fk: "lessonId",
    base: ["categoryId", "teacherId", "durationSec", "access"],
    managed: ["status", "publishedAt"],
    order: ["createdAt", "id"],
  },
  terms: {
    table: columns(t.glossaryTerms),
    tr: columns(t.glossaryTermTranslations),
    fk: "termId",
    base: ["code", "sortOrder"],
    managed: [],
    order: ["sortOrder", "id"],
  },
  tracks: {
    table: columns(t.tracks),
    tr: columns(t.trackTranslations),
    fk: "trackId",
    base: ["code", "sortOrder"],
    managed: ["status"],
    order: ["sortOrder", "id"],
  },
  steps: {
    table: columns(t.trackSteps),
    tr: columns(t.trackStepTranslations),
    fk: "stepId",
    base: ["trackId"],
    managed: ["sortOrder"],
    order: ["sortOrder", "id"],
  },
};

const links = {
  lessonTerms: { table: columns(t.lessonGlossaryTerms), owner: "lessonId", item: "termId", items: columns(t.glossaryTerms) },
  stepLessons: { table: columns(t.trackStepLessons), owner: "stepId", item: "lessonId", items: columns(t.lessons) },
};

const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map((key) => [key, row[key]]));

export function createDrizzleAdminCatalogRepo(getDb: () => Db): AdminCatalogRepo {
  async function read<E extends Entity>(entity: E, where: SQL | undefined, all: boolean): Promise<AdminRecord<E>[]> {
    const { table, tr, fk, base, managed, order } = defs[entity];
    const db = getDb();
    const rows: Row[] = await db
      .select()
      .from(table)
      .where(where)
      .orderBy(...order.map((key) => asc(table[key])));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id as string);
    const translations: Row[] = await db
      .select()
      .from(tr)
      .where(all ? undefined : inArray(tr[fk], ids));

    return rows.map((row) => {
      const byLocale: Row = {};
      for (const { [fk]: owner, locale, ...fields } of translations) {
        if (owner !== row.id) continue;
        // Lessons: no key points is stored as null.
        if (entity === "lessons") fields.keyPoints ??= [];
        byLocale[locale as Locale] = fields;
      }
      return { id: row.id, ...pick(row, [...base, ...managed]), translations: byLocale } as AdminRecord<E>;
    });
  }

  return {
    list(entity, filter) {
      const trackId = filter?.trackId;
      if (trackId === undefined) return read(entity, undefined, true);
      return isUuid(trackId) ? read(entity, eq(defs[entity].table.trackId, trackId), false) : Promise.resolve([]);
    },

    async get(entity, id) {
      if (!isUuid(id)) return null;
      return (await read(entity, eq(defs[entity].table.id, id), false))[0] ?? null;
    },

    async slugTaken(entity, locale, slug, exceptId) {
      const { tr, fk } = defs[entity];
      const [row] = await getDb()
        .select({ id: tr[fk] })
        .from(tr)
        .where(and(eq(tr.locale, locale), eq(tr.slug, slug), exceptId && isUuid(exceptId) ? ne(tr[fk], exceptId) : undefined))
        .limit(1);
      return row !== undefined;
    },

    async codeTaken(entity, code, exceptId) {
      const { table } = defs[entity];
      const [row] = await getDb()
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.code, code), exceptId && isUuid(exceptId) ? ne(table.id, exceptId) : undefined))
        .limit(1);
      return row !== undefined;
    },

    async save(entity, id, input, actorId) {
      const { table, tr, fk, base } = defs[entity];
      const values = pick(input as Row, base);
      // Set when the row is created and left alone afterwards.
      const onCreate: Row = {};
      if (entity === "lessons" && isUuid(actorId)) onCreate.createdBy = actorId;
      if (entity === "steps") {
        const { trackId } = input as CatalogInput<"steps">;
        onCreate.sortOrder = sql`(select coalesce(max(${t.trackSteps.sortOrder}), 0) + 1 from ${t.trackSteps} where ${t.trackSteps.trackId} = ${trackId})`;
      }
      const present = Object.entries(input.translations as Record<Locale, Row | undefined>).filter(
        (entry): entry is [Locale, Row] => entry[1] !== undefined,
      );

      await atomic(getDb(), (q) => {
        const insert = q.insert(table).values({ id, ...values, ...onCreate });
        return [
          base.length > 0 ? insert.onConflictDoUpdate({ target: table.id, set: values }) : insert.onConflictDoNothing(),
          ...present.map(([locale, fields]) => {
            const row = "keyPoints" in fields ? { ...fields, keyPoints: (fields.keyPoints as string[]).length ? fields.keyPoints : null } : fields;
            return q
              .insert(tr)
              .values({ [fk]: id, locale, ...row })
              .onConflictDoUpdate({ target: [tr[fk], tr.locale], set: row });
          }),
          q.delete(tr).where(
            and(
              eq(tr[fk], id),
              notInArray(
                tr.locale,
                present.map(([locale]) => locale),
              ),
            ),
          ),
        ];
      });
    },

    async remove(entity, id) {
      const { table } = defs[entity];
      if (isUuid(id)) await getDb().delete(table).where(eq(table.id, id));
    },

    async setStatus(entity, id, status, now) {
      if (!isUuid(id)) return;
      if (entity === "tracks") {
        await getDb().update(t.tracks).set({ status }).where(eq(t.tracks.id, id));
      } else {
        // The first publication date is kept: it orders lessons inside a category.
        await getDb()
          .update(t.lessons)
          .set(
            status === "published"
              ? { status, publishedAt: sql`coalesce(${t.lessons.publishedAt}, ${now.toISOString()}::timestamptz)` }
              : { status },
          )
          .where(eq(t.lessons.id, id));
      }
    },

    async getLinks(kind, id) {
      const { table, owner, item } = links[kind];
      if (!isUuid(id)) return [];
      const rows = await getDb()
        .select({ id: table[item] })
        .from(table)
        .where(eq(table[owner], id))
        .orderBy(asc(table.sortOrder));
      return rows.map((row) => row.id as string);
    },

    async setLinks(kind, id, ids) {
      const { table, owner, item, items } = links[kind];
      if (!isUuid(id) || !ids.every(isUuid)) return false;
      const db = getDb();
      if (ids.length > 0) {
        const [found] = await db.select({ n: count() }).from(items).where(inArray(items.id, ids));
        if (found.n !== ids.length) return false;
      }
      await atomic(db, (q) => [
        q.delete(table).where(eq(table[owner], id)),
        ...(ids.length > 0
          ? [q.insert(table).values(ids.map((itemId, index) => ({ [owner]: id, [item]: itemId, sortOrder: index + 1 })))]
          : []),
      ]);
      return true;
    },

    async reorderSteps(trackId, stepIds) {
      if (!isUuid(trackId) || !stepIds.every(isUuid)) return;
      // Two phases, because (track_id, sort_order) is unique: move every step out of the
      // way (negative numbers), then number them 1..n.
      await atomic(getDb(), (q) => [
        q
          .update(t.trackSteps)
          .set({ sortOrder: sql`-${t.trackSteps.sortOrder} - 1` })
          .where(eq(t.trackSteps.trackId, trackId)),
        ...stepIds.map((stepId, index) =>
          q
            .update(t.trackSteps)
            .set({ sortOrder: index + 1 })
            .where(and(eq(t.trackSteps.id, stepId), eq(t.trackSteps.trackId, trackId))),
        ),
      ]);
    },

    async lessonCount(by, id) {
      if (!isUuid(id)) return 0;
      const column = by === "categories" ? t.lessons.categoryId : t.lessons.teacherId;
      const [row] = await getDb().select({ n: count() }).from(t.lessons).where(eq(column, id));
      return row.n;
    },

    async hasProgress(lessonId) {
      if (!isUuid(lessonId)) return false;
      const [row] = await getDb()
        .select({ lessonId: t.userLessonProgress.lessonId })
        .from(t.userLessonProgress)
        .where(eq(t.userLessonProgress.lessonId, lessonId))
        .limit(1);
      return row !== undefined;
    },

    audit: (entry) => writeAudit(getDb(), entry),
  };
}
