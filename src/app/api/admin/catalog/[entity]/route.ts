import { adminCatalogResponse, jsonBody } from "@/lib/adminApi";
import { ENTITIES, type Entity } from "@/server/catalog/schemas";
import { saveEntity } from "@/server/catalog/service";
import { adminCatalogRepo } from "@/server/repos";

// Create a category, teacher, lesson, glossary term, track or step.
export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!ENTITIES.includes(entity as Entity)) return new Response(null, { status: 404 });
  const body = await jsonBody(request);
  return adminCatalogResponse(request, (actor, ip) => saveEntity(adminCatalogRepo, actor, entity as Entity, body, undefined, ip));
}
