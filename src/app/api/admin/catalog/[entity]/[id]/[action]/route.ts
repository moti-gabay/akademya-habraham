import { adminCatalogResponse, jsonBody } from "@/lib/adminApi";
import type { Actor } from "@/server/auth/actor";
import { reorderSteps, setLinks, setPublished, type Result } from "@/server/catalog/service";
import { adminCatalogRepo as repo } from "@/server/repos";

type Run = (actor: Actor | null, id: string, body: unknown, ip: string | null) => Promise<Result>;

// Operations that are not a plain save, as "<entity>/<action>".
const actions: Record<string, Run> = {
  "lessons/publish": (actor, id, _body, ip) => setPublished(repo, actor, "lessons", id, true, ip),
  "lessons/unpublish": (actor, id, _body, ip) => setPublished(repo, actor, "lessons", id, false, ip),
  "lessons/terms": (actor, id, body, ip) => setLinks(repo, actor, "lessonTerms", id, body, ip),
  "tracks/publish": (actor, id, _body, ip) => setPublished(repo, actor, "tracks", id, true, ip),
  "tracks/unpublish": (actor, id, _body, ip) => setPublished(repo, actor, "tracks", id, false, ip),
  "tracks/steps-order": (actor, id, body, ip) => reorderSteps(repo, actor, id, body, ip),
  "steps/lessons": (actor, id, body, ip) => setLinks(repo, actor, "stepLessons", id, body, ip),
};

export async function POST(request: Request, { params }: { params: Promise<{ entity: string; id: string; action: string }> }) {
  const { entity, id, action } = await params;
  const run = actions[`${entity}/${action}`];
  if (!run) return new Response(null, { status: 404 });
  const body = await jsonBody(request);
  return adminCatalogResponse(request, (actor, ip) => run(actor, id, body, ip));
}
