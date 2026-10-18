import { randomUUID } from "node:crypto";
import { requireRole, requireSecondFactor, type Actor, type Role } from "../auth/actor";
import { LOCALES } from "../i18n/locales";
import { isUniqueViolation } from "./errors";
import { IdListSchema, inputSchemas, type CatalogInput, type Entity } from "./schemas";
import type { AdminCatalogRepo, LinkKind } from "./types";

// Admin catalog operations. Every one is for admins in a session with a verified second
// factor, and every change is written to the audit log.

// Raise to "editor" to let editors manage content.
export const ADMIN_ROLE: Role = "admin";

export type Failure = {
  ok: false;
  status: 400 | 404 | 409 | 502;
  error:
    | "invalid_body"
    | "not_found"
    | "unknown_reference"
    | "slug_taken"
    | "code_taken"
    | "in_use"
    | "not_draft"
    | "has_progress"
    | "video_not_ready"
    | "invalid_caption"
    | "unsupported_type"
    | "upload_missing"
    | "provider_failed";
  // Path of the offending input field, e.g. "translations.en.slug".
  field?: string;
  fields?: string[];
  // in_use: how many lessons still point at the category or teacher.
  count?: number;
};
export type Result<T = object> = ({ ok: true } & T) | Failure;

export const fail = (status: Failure["status"], error: Failure["error"], extra: Partial<Failure> = {}): Failure => ({
  ok: false,
  status,
  error,
  ...extra,
});
export const notFound = fail(404, "not_found");

export const admin = (actor: Actor | null) => requireSecondFactor(requireRole(actor, ADMIN_ROLE));

// Slugs that must be unique per locale. Step slugs only need to exist.
const UNIQUE_SLUG: Entity[] = ["categories", "lessons", "terms", "tracks"];

// Ids the input points at, which must exist.
function references<E extends Entity>(entity: E, input: CatalogInput<E>): [field: string, Entity, string | null][] {
  const value = input as Record<string, unknown>;
  const ref = (field: string, target: Entity): [string, Entity, string | null] => [field, target, value[field] as string | null];
  if (entity === "lessons") return [ref("categoryId", "categories"), ref("teacherId", "teachers")];
  if (entity === "categories") return [ref("parentId", "categories")];
  if (entity === "steps") return [ref("trackId", "tracks")];
  return [];
}

export async function saveEntity<E extends Entity>(
  repo: AdminCatalogRepo,
  actor: Actor | null,
  entity: E,
  body: unknown,
  id?: string,
  ip?: string | null,
): Promise<Result<{ id: string }>> {
  const { userId } = admin(actor);
  const parsed = inputSchemas[entity].safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_body", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
  }
  const input = parsed.data as CatalogInput<E>;

  const before = id === undefined ? null : await repo.get(entity, id);
  if (id !== undefined && !before) return notFound;
  // A step stays in its track.
  if (entity === "steps" && before) Object.assign(input, { trackId: (before as { trackId: string }).trackId });

  for (const [field, target, refId] of references(entity, input)) {
    if (refId === null) continue;
    if ((target === entity && refId === id) || !(await repo.get(target, refId))) {
      return fail(400, "unknown_reference", { field });
    }
  }
  if (entity === "terms" || entity === "tracks") {
    if (await repo.codeTaken(entity, (input as { code: string }).code, id)) return fail(409, "code_taken", { field: "code" });
  }
  if (UNIQUE_SLUG.includes(entity)) {
    const translations = input.translations as Partial<Record<string, { slug: string }>>;
    for (const locale of LOCALES) {
      const slug = translations[locale]?.slug;
      if (slug && (await repo.slugTaken(entity, locale, slug, id))) {
        return fail(409, "slug_taken", { field: `translations.${locale}.slug` });
      }
    }
  }

  const savedId = id ?? randomUUID();
  try {
    await repo.save(entity, savedId, input, userId);
  } catch (error) {
    // Lost a race with another save after the checks above.
    if (isUniqueViolation(error)) return fail(409, "slug_taken");
    throw error;
  }
  await repo.audit({
    actorId: userId,
    action: `catalog.${entity}.${before ? "update" : "create"}`,
    targetType: entity,
    targetId: savedId,
    diff: { before, after: input },
    ip,
  });
  return { ok: true, id: savedId };
}

export async function removeEntity(
  repo: AdminCatalogRepo,
  actor: Actor | null,
  entity: Entity,
  id: string,
  ip?: string | null,
): Promise<Result> {
  const { userId } = admin(actor);
  const before = await repo.get(entity, id);
  if (!before) return notFound;

  if (entity === "categories" || entity === "teachers") {
    // Never detach lessons silently: they must be moved or unpublished first.
    const count = await repo.lessonCount(entity, id);
    if (count > 0) return fail(409, "in_use", { count });
  }
  if ((entity === "lessons" || entity === "tracks") && (before as { status: string }).status !== "draft") {
    return fail(409, "not_draft");
  }
  if (entity === "lessons" && (await repo.hasProgress(id))) return fail(409, "has_progress");

  await repo.remove(entity, id);
  if (entity === "steps") {
    // Close the gap, so step numbers stay 1..n.
    const { trackId } = before as { trackId: string };
    const rest = await repo.list("steps", { trackId });
    await repo.reorderSteps(trackId, rest.map((step) => step.id));
  }
  await repo.audit({ actorId: userId, action: `catalog.${entity}.delete`, targetType: entity, targetId: id, diff: { before }, ip });
  return { ok: true };
}

export async function setPublished(
  repo: AdminCatalogRepo,
  actor: Actor | null,
  entity: "lessons" | "tracks",
  id: string,
  published: boolean,
  ip?: string | null,
  now = new Date(),
): Promise<Result> {
  const { userId } = admin(actor);
  const before = await repo.get(entity, id);
  if (!before) return notFound;
  // A lesson goes public only with a video whose processing finished.
  if (entity === "lessons" && published && (await repo.videoStatus(id)) !== "ready") return fail(409, "video_not_ready");
  const status = published ? "published" : "draft";
  await repo.setStatus(entity, id, status, now);
  await repo.audit({
    actorId: userId,
    action: `catalog.${entity}.${published ? "publish" : "unpublish"}`,
    targetType: entity,
    targetId: id,
    diff: { before: { status: before.status }, after: { status } },
    ip,
  });
  return { ok: true };
}

const LINK_OWNER = { lessonTerms: "lessons", stepLessons: "steps" } as const;

// The ordered glossary terms of a lesson, or the ordered lessons of a step.
export async function setLinks(
  repo: AdminCatalogRepo,
  actor: Actor | null,
  kind: LinkKind,
  id: string,
  body: unknown,
  ip?: string | null,
): Promise<Result> {
  const { userId } = admin(actor);
  const ids = IdListSchema.safeParse(body);
  if (!ids.success) return fail(400, "invalid_body");
  const owner = LINK_OWNER[kind];
  if (!(await repo.get(owner, id))) return notFound;
  const before = await repo.getLinks(kind, id);
  if (!(await repo.setLinks(kind, id, ids.data))) return fail(400, "unknown_reference");
  await repo.audit({
    actorId: userId,
    action: `catalog.${owner}.${kind}`,
    targetType: owner,
    targetId: id,
    diff: { before, after: ids.data },
    ip,
  });
  return { ok: true };
}

export async function reorderSteps(
  repo: AdminCatalogRepo,
  actor: Actor | null,
  trackId: string,
  body: unknown,
  ip?: string | null,
): Promise<Result> {
  const { userId } = admin(actor);
  const ids = IdListSchema.safeParse(body);
  if (!ids.success) return fail(400, "invalid_body");
  if (!(await repo.get("tracks", trackId))) return notFound;
  const before = (await repo.list("steps", { trackId })).map((step) => step.id);
  // The new order must be exactly the track's steps.
  if (before.length !== ids.data.length || before.some((stepId) => !ids.data.includes(stepId))) {
    return fail(400, "invalid_body");
  }
  await repo.reorderSteps(trackId, ids.data);
  await repo.audit({
    actorId: userId,
    action: "catalog.tracks.reorder",
    targetType: "tracks",
    targetId: trackId,
    diff: { before, after: ids.data },
    ip,
  });
  return { ok: true };
}
