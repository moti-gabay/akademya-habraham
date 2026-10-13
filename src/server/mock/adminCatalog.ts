import type { Entity } from "../catalog/schemas";
import type { AdminCatalogRepo, AdminRecord } from "../catalog/types";
import type { MockStore } from "./store";

// In-memory admin catalog. It follows the database's rules where they are visible:
// deleting a row removes its links, and detaches what pointed at it.
export function createMockAdminCatalogRepo(store: MockStore): AdminCatalogRepo {
  const table = <E extends Entity>(entity: E) => store[entity] as unknown as Map<string, AdminRecord<E>>;
  const sorted = <E extends Entity>(entity: E) => {
    const records = [...table(entity).values()] as (AdminRecord<E> & { sortOrder?: number })[];
    return records.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };
  const without = (lists: Map<string, string[]>, id: string) => {
    for (const [owner, ids] of lists) lists.set(owner, ids.filter((item) => item !== id));
  };
  const links = { lessonTerms: ["lessons", "terms"], stepLessons: ["steps", "lessons"] } as const;

  const repo: AdminCatalogRepo = {
    async list(entity, filter) {
      const records = sorted(entity);
      const trackId = filter?.trackId;
      return structuredClone(
        trackId === undefined ? records : records.filter((record) => (record as { trackId?: string }).trackId === trackId),
      );
    },

    async get(entity, id) {
      return structuredClone(table(entity).get(id) ?? null);
    },

    async slugTaken(entity, locale, slug, exceptId) {
      return [...table(entity).values()].some(
        (record) =>
          record.id !== exceptId && (record.translations as Record<string, { slug?: string } | undefined>)[locale]?.slug === slug,
      );
    },

    async codeTaken(entity, code, exceptId) {
      return [...store[entity].values()].some((record) => record.id !== exceptId && record.code === code);
    },

    async save(entity, id, input) {
      const existing = table(entity).get(id);
      // What the database fills in when the row is created.
      const created: Record<string, unknown> = {};
      if (entity === "lessons") Object.assign(created, { status: "draft", publishedAt: null, thumbnailKey: null });
      if (entity === "tracks") created.status = "draft";
      if (entity === "steps") {
        const { trackId } = input as { trackId: string };
        const last = Math.max(0, ...[...store.steps.values()].filter((step) => step.trackId === trackId).map((step) => step.sortOrder));
        created.sortOrder = last + 1;
      }
      table(entity).set(id, { ...created, ...existing, ...structuredClone(input), id } as AdminRecord<typeof entity>);
    },

    async remove(entity, id) {
      if (!table(entity).delete(id)) return;
      if (entity === "lessons") {
        without(store.stepLessons, id);
        store.lessonTerms.delete(id);
        store.videos.delete(id);
        store.captions.delete(id);
      }
      if (entity === "terms") without(store.lessonTerms, id);
      if (entity === "steps") store.stepLessons.delete(id);
      if (entity === "tracks") {
        for (const step of [...store.steps.values()]) if (step.trackId === id) await repo.remove("steps", step.id);
      }
      if (entity === "categories") {
        for (const lesson of store.lessons.values()) if (lesson.categoryId === id) lesson.categoryId = null;
        for (const category of store.categories.values()) if (category.parentId === id) category.parentId = null;
      }
      if (entity === "teachers") {
        for (const lesson of store.lessons.values()) if (lesson.teacherId === id) lesson.teacherId = null;
      }
    },

    async setStatus(entity, id, status, now) {
      if (entity === "tracks") {
        const track = store.tracks.get(id);
        if (track) track.status = status;
        return;
      }
      const lesson = store.lessons.get(id);
      if (!lesson) return;
      lesson.status = status;
      if (status === "published") lesson.publishedAt ??= now;
    },

    async getLinks(kind, id) {
      return [...(store[kind].get(id) ?? [])];
    },

    async setLinks(kind, id, ids) {
      const [owner, item] = links[kind];
      if (!store[owner].has(id) || !ids.every((itemId) => store[item].has(itemId))) return false;
      store[kind].set(id, [...ids]);
      return true;
    },

    async reorderSteps(trackId, stepIds) {
      stepIds.forEach((stepId, index) => {
        const step = store.steps.get(stepId);
        if (step?.trackId === trackId) step.sortOrder = index + 1;
      });
    },

    async lessonCount(by, id) {
      const key = by === "categories" ? "categoryId" : "teacherId";
      return [...store.lessons.values()].filter((lesson) => lesson[key] === id).length;
    },

    async hasProgress(lessonId) {
      return [...store.progress.values()].some((byLesson) => byLesson.has(lessonId));
    },

    async audit(entry) {
      store.audit.push(entry);
    },
  };
  return repo;
}
