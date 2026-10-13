// pnpm test:unit — the admin catalog service and the public catalog reads, run against
// both storages: Drizzle on PGlite (seeded) and the in-memory mock.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { AuthError, type Actor } from "../auth/actor";
import { createDrizzleAdminCatalogRepo } from "../db/adminCatalog";
import { atomic } from "../db/atomic";
import { createDrizzleCatalogRepo } from "../db/catalog";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { seed } from "../db/seed";
import { createTestDb } from "../db/testDb";
import { SAMPLE_USER_ID } from "../mock/data";
import { createMockRepos } from "../mock/repos";
import { buildStore } from "../mock/store";
import type { CatalogRepo } from "../repos/types";
import { canWatch } from "./access";
import { translationCompleteness } from "./completeness";
import { findLessonPreview, listPublicParams } from "./public";
import type { CatalogInput } from "./schemas";
import { removeEntity, reorderSteps, saveEntity, setLinks, setPublished } from "./service";
import type { AdminCatalogRepo } from "./types";

const actor = (role: Actor["role"], secondFactorVerified = true): Actor => ({
  userId: SAMPLE_USER_ID,
  role,
  locale: "he",
  secondFactorVerified,
});
const admin = actor("admin");
const code = (expected: string) => (error: unknown) => error instanceof AuthError && error.code === expected;

let db: Db;
const storages: Record<string, { admin: AdminCatalogRepo; catalog: CatalogRepo; audits: () => Promise<string[]> }> = {};

before(async () => {
  db = await createTestDb();
  await seed(db);
  storages.db = {
    admin: createDrizzleAdminCatalogRepo(() => db),
    catalog: createDrizzleCatalogRepo(() => db),
    audits: async () => (await db.select({ action: t.auditLog.action }).from(t.auditLog)).map((row) => row.action),
  };
  const store = buildStore();
  const mock = createMockRepos(store);
  storages.mock = { admin: mock.adminCatalogRepo, catalog: mock.catalogRepo, audits: async () => store.audit.map((entry) => entry.action) };
});

for (const name of ["db", "mock"]) {
  describe(name, () => {
    const repo = () => storages[name].admin;
    const catalog = () => storages[name].catalog;
    // Sample ids differ between the storages; the Hebrew slug is the same.
    const idOf = async (entity: "categories" | "lessons" | "steps" | "tracks" | "terms", slug: string) => {
      const found = (await repo().list(entity)).find((record) => record.translations.he.slug === slug);
      assert.ok(found, `${entity} ${slug}`);
      return found.id;
    };
    const lesson = (slug: string, patch: Partial<CatalogInput<"lessons">> = {}): CatalogInput<"lessons"> => ({
      categoryId: null,
      teacherId: null,
      durationSec: 600,
      access: "members",
      translations: { he: { title: "שיעור חדש", description: null, keyPoints: [], slug } },
      ...patch,
    });
    const created = async (body: CatalogInput<"lessons">) => {
      const result = await saveEntity(repo(), admin, "lessons", body);
      assert.ok(result.ok, JSON.stringify(result));
      return result.id;
    };

    test("the public catalog lists holidays that have published lessons, in every language", async () => {
      const he = await catalog().listHolidayCategories("he");
      assert.deepEqual(he.map((category) => [category.slug, category.name, category.lessonCount]), [
        ["hanukkah", "חנוכה", 2],
        ["purim", "פורים", 1],
        ["pesach", "פסח", 1],
      ]);
      const found = await catalog().getHolidayCategory("hanukkah", "en");
      assert.deepEqual(found?.lessons.map((item) => [item.slug, item.access, item.keyPoints.length]), [
        ["hanukkah-intro", "free", 3],
        ["hanukkah-candles", "members", 3],
      ]);
      assert.equal(found?.lessons[0].description, "Introduction: the miracle of the oil");
      assert.equal(await catalog().getHolidayCategory("shavuot", "he"), null);
      assert.equal((await listPublicParams(catalog())).length, 4 * 4);
    });

    test("only admins with a second factor may change the catalog", async () => {
      const body = lesson("refused");
      await assert.rejects(saveEntity(repo(), null, "lessons", body), code("signed_out"));
      await assert.rejects(saveEntity(repo(), actor("editor"), "lessons", body), code("forbidden"));
      await assert.rejects(saveEntity(repo(), actor("admin", false), "lessons", body), code("second_factor_required"));
      await assert.rejects(removeEntity(repo(), actor("user"), "lessons", "x"), code("forbidden"));
      await assert.rejects(setPublished(repo(), actor("editor"), "lessons", "x", true), code("forbidden"));
      assert.equal(await catalog().findLessonBySlug("refused"), null);
    });

    test("Hebrew is required, other languages are optional and fall back to Hebrew", async () => {
      const noHebrew = { ...lesson("x"), translations: { en: { title: "English only", description: null, keyPoints: [], slug: "x" } } };
      const refused = await saveEntity(repo(), admin, "lessons", noHebrew);
      assert.deepEqual([refused.ok, !refused.ok && refused.error], [false, "invalid_body"]);
      assert.ok(!refused.ok && refused.fields?.includes("translations.he"));

      const purim = await idOf("categories", "purim");
      const id = await created(
        lesson("purim-gifts", {
          categoryId: purim,
          access: "free",
          translations: { he: { title: "משלוח מנות", description: "מה שולחים ולמי", keyPoints: ["שתי מנות", "לאדם אחד"], slug: "purim-gifts" } },
        }),
      );
      const saved = await repo().get("lessons", id);
      assert.deepEqual([saved?.status, saved?.publishedAt], ["draft", null]);
      assert.deepEqual(translationCompleteness(saved?.translations ?? {}), { he: true, en: false, ru: false, es: false });

      // A draft is not public. Once published, English readers get the Hebrew text.
      assert.equal((await catalog().getHolidayCategory("purim", "en"))?.lessons.length, 1);
      assert.ok((await setPublished(repo(), admin, "lessons", id, true)).ok);
      const preview = await findLessonPreview(catalog(), "purim", "purim-gifts", "en");
      assert.deepEqual(
        [preview?.category.name, preview?.lesson.title, preview?.lesson.keyPoints, preview?.lesson.access],
        ["Purim", "משלוח מנות", ["שתי מנות", "לאדם אחד"], "free"],
      );

      // Adding English changes the English page and its address; the old address still resolves.
      const withEnglish = { ...saved, translations: { ...saved?.translations, en: { title: "Purim gifts", description: null, keyPoints: [], slug: "gifts" } } };
      assert.ok((await saveEntity(repo(), admin, "lessons", withEnglish, id)).ok);
      const english = await findLessonPreview(catalog(), "purim", "purim-gifts", "en");
      assert.deepEqual(
        [english?.lesson.slug, english?.lesson.title, english?.lesson.description, english?.lesson.keyPoints.length],
        ["gifts", "Purim gifts", "מה שולחים ולמי", 2],
      );
      assert.equal((await repo().get("lessons", id))?.status, "published");

      // Removing the translation removes its row.
      assert.ok((await saveEntity(repo(), admin, "lessons", saved, id)).ok);
      assert.deepEqual(Object.keys((await repo().get("lessons", id))?.translations ?? {}), ["he"]);
      assert.equal((await findLessonPreview(catalog(), "purim", "purim-gifts", "en"))?.lesson.slug, "purim-gifts");

      // Unpublishing takes it off the public pages.
      assert.ok((await setPublished(repo(), admin, "lessons", id, false)).ok);
      assert.equal(await findLessonPreview(catalog(), "purim", "purim-gifts", "he"), null);
    });

    test("slugs are unique per language, codes are unique, references must exist", async () => {
      const taken = await saveEntity(repo(), admin, "lessons", {
        ...lesson("fresh-slug"),
        translations: {
          he: { title: "א", description: null, keyPoints: [], slug: "fresh-slug" },
          en: { title: "A", description: null, keyPoints: [], slug: "hanukkah-intro" },
        },
      });
      assert.deepEqual(taken, { ok: false, status: 409, error: "slug_taken", field: "translations.en.slug" });
      assert.equal(await catalog().findLessonBySlug("fresh-slug"), null);
      assert.equal((await repo().list("lessons")).some((item) => item.translations.he.slug === "fresh-slug"), false);

      // Saving a lesson under its own slug is not a conflict.
      const intro = await idOf("lessons", "hanukkah-intro");
      assert.ok((await saveEntity(repo(), admin, "lessons", await repo().get("lessons", intro), intro)).ok);

      const term = { code: "shabbat", sortOrder: 9, translations: { he: { term: "ש", shortDefinition: "ש", slug: "another" } } };
      assert.deepEqual(await saveEntity(repo(), admin, "terms", term), { ok: false, status: 409, error: "code_taken", field: "code" });

      const orphan = await saveEntity(repo(), admin, "lessons", lesson("orphan", { categoryId: "00000000-0000-4000-8000-000000000000" }));
      assert.deepEqual(orphan, { ok: false, status: 400, error: "unknown_reference", field: "categoryId" });
      assert.equal((await saveEntity(repo(), admin, "lessons", lesson("x"), "00000000-0000-4000-8000-000000000000")).ok, false);
    });

    test("steps are added at the end, can be reordered, and close the gap when one is removed", async () => {
      const trackId = await idOf("tracks", "learning-path");
      const order = async () => (await repo().list("steps", { trackId })).map((step) => step.translations.he.slug);
      const added = await saveEntity(repo(), admin, "steps", { trackId, translations: { he: { name: "מועדים", slug: "moadim" } } });
      assert.ok(added.ok);
      assert.deepEqual(await order(), ["faith", "shabbat", "kashrut", "prayer", "holidays", "moadim"]);

      const ids = (await repo().list("steps", { trackId })).map((step) => step.id);
      assert.equal((await reorderSteps(repo(), admin, trackId, ids.slice(1))).ok, false);
      assert.ok((await reorderSteps(repo(), admin, trackId, [...ids].reverse())).ok);
      assert.deepEqual(await order(), ["moadim", "holidays", "prayer", "kashrut", "shabbat", "faith"]);

      assert.ok((await removeEntity(repo(), admin, "steps", ids[3])).ok);
      assert.deepEqual(
        (await repo().list("steps", { trackId })).map((step) => [step.translations.he.slug, step.sortOrder]),
        [["moadim", 1], ["holidays", 2], ["kashrut", 3], ["shabbat", 4], ["faith", 5]],
      );
      assert.ok((await reorderSteps(repo(), admin, trackId, [ids[0], ids[1], ids[2], ids[4], ids[5]])).ok);
    });

    test("a lesson's glossary terms and a step's lessons are ordered lists", async () => {
      const lessonId = await idOf("lessons", "hanukkah-intro");
      const terms = [await idOf("terms", "halacha"), await idOf("terms", "shabbat")];
      assert.ok((await setLinks(repo(), admin, "lessonTerms", lessonId, terms)).ok);
      assert.deepEqual(await repo().getLinks("lessonTerms", lessonId), terms);
      assert.ok((await setLinks(repo(), admin, "lessonTerms", lessonId, [terms[1]])).ok);
      assert.deepEqual(await repo().getLinks("lessonTerms", lessonId), [terms[1]]);

      const unknown = await setLinks(repo(), admin, "lessonTerms", lessonId, ["00000000-0000-4000-8000-000000000000"]);
      assert.deepEqual([unknown.ok, !unknown.ok && unknown.error], [false, "unknown_reference"]);
      assert.deepEqual(await repo().getLinks("lessonTerms", lessonId), [terms[1]]);
      assert.equal((await setLinks(repo(), admin, "lessonTerms", lessonId, [terms[0], terms[0]])).ok, false);

      const stepId = await idOf("steps", "kashrut");
      assert.ok((await setLinks(repo(), admin, "stepLessons", stepId, [lessonId])).ok);
      assert.deepEqual(await repo().getLinks("stepLessons", stepId), [lessonId]);
      assert.ok((await setLinks(repo(), admin, "stepLessons", stepId, [])).ok);
    });

    test("deletes are blocked while something depends on the row", async () => {
      const hanukkah = await idOf("categories", "hanukkah");
      assert.deepEqual(await removeEntity(repo(), admin, "categories", hanukkah), { ok: false, status: 409, error: "in_use", count: 2 });
      const teacherId = (await repo().list("teachers"))[0].id;
      const inUse = await removeEntity(repo(), admin, "teachers", teacherId);
      assert.deepEqual([inUse.ok, !inUse.ok && inUse.error], [false, "in_use"]);

      // Published lessons and published tracks are unpublished first.
      const candles = await idOf("lessons", "hanukkah-candles");
      assert.deepEqual(await removeEntity(repo(), admin, "lessons", candles), { ok: false, status: 409, error: "not_draft" });
      const trackId = await idOf("tracks", "learning-path");
      assert.deepEqual(await removeEntity(repo(), admin, "tracks", trackId), { ok: false, status: 409, error: "not_draft" });

      // A draft someone has watched keeps their progress, so it stays.
      const watched = await idOf("lessons", "shabbat-6");
      assert.ok((await setPublished(repo(), admin, "lessons", watched, false)).ok);
      assert.deepEqual(await removeEntity(repo(), admin, "lessons", watched), { ok: false, status: 409, error: "has_progress" });
      assert.ok((await setPublished(repo(), admin, "lessons", watched, true)).ok);

      // An unwatched draft goes, with its translations and links.
      const draft = await idOf("lessons", "pesach-chametz");
      assert.ok((await removeEntity(repo(), admin, "lessons", draft)).ok);
      assert.equal(await repo().get("lessons", draft), null);
      assert.deepEqual(await removeEntity(repo(), admin, "lessons", draft), { ok: false, status: 404, error: "not_found" });

      // A category nothing points at can be removed.
      assert.ok((await removeEntity(repo(), admin, "categories", await idOf("categories", "shavuot"))).ok);
    });

    test("every change is written to the audit log", async () => {
      const actions = new Set(await storages[name].audits());
      for (const action of [
        "catalog.lessons.create",
        "catalog.lessons.update",
        "catalog.lessons.publish",
        "catalog.lessons.unpublish",
        "catalog.lessons.delete",
        "catalog.lessons.lessonTerms",
        "catalog.steps.create",
        "catalog.steps.delete",
        "catalog.tracks.reorder",
        "catalog.categories.delete",
      ]) {
        assert.ok(actions.has(action), action);
      }
    });
  });
}

test("a failed statement undoes the ones before it", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  await assert.rejects(
    atomic(db, (q) => [
      q.insert(t.teachers).values({ id }),
      // This teacher does not exist: the foreign key fails.
      q.insert(t.teacherTranslations).values({ teacherId: "22222222-2222-4222-8222-222222222222", locale: "he", name: "x" }),
    ]),
  );
  assert.deepEqual(await db.select().from(t.teachers).where(eq(t.teachers.id, id)), []);
});

test("on Neon the statements go out as one batch, which the driver runs as a transaction", async () => {
  const sent: unknown[][] = [];
  const neon = { batch: async (statements: unknown[]) => void sent.push(statements) } as unknown as Db;
  await atomic(neon, (q) => {
    assert.equal(q, neon);
    return [db.select().from(t.teachers), db.select().from(t.tracks)];
  });
  assert.deepEqual(sent.map((statements) => statements.length), [2]);
  await atomic(neon, () => []);
  assert.equal(sent.length, 1);
});

test("watching needs a sign-in; billing will narrow members-only lessons later", () => {
  assert.equal(canWatch(null, { access: "free" }), false);
  assert.equal(canWatch(null, { access: "members" }), false);
  assert.equal(canWatch({ userId: "u" }, { access: "free" }), true);
  assert.equal(canWatch({ userId: "u" }, { access: "members" }), true);
});
