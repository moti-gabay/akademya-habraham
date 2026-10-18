import { adminCatalogResponse, jsonBody } from "@/lib/adminApi";
import { mediaDeps } from "@/lib/media";
import { ENTITIES, type Entity } from "@/server/catalog/schemas";
import { removeEntity, saveEntity } from "@/server/catalog/service";
import { deleteLesson } from "@/server/media/service";
import { adminCatalogRepo } from "@/server/repos";

type Context = { params: Promise<{ entity: string; id: string }> };

// Save an entity with all its translations.
export async function PUT(request: Request, { params }: Context) {
  const { entity, id } = await params;
  if (!ENTITIES.includes(entity as Entity)) return new Response(null, { status: 404 });
  const body = await jsonBody(request);
  return adminCatalogResponse(request, (actor, ip) => saveEntity(adminCatalogRepo, actor, entity as Entity, body, id, ip));
}

export async function DELETE(request: Request, { params }: Context) {
  const { entity, id } = await params;
  if (!ENTITIES.includes(entity as Entity)) return new Response(null, { status: 404 });
  return adminCatalogResponse(request, (actor, ip) =>
    // A lesson takes its video and files with it.
    entity === "lessons"
      ? deleteLesson({ ...mediaDeps(), catalog: adminCatalogRepo }, actor, id, ip)
      : removeEntity(adminCatalogRepo, actor, entity as Entity, id, ip),
  );
}
