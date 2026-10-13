import { adminCatalogResponse, jsonBody } from "@/lib/adminApi";
import { mediaDeps } from "@/lib/media";
import { confirmThumbnail, removeThumbnail, startThumbnailUpload } from "@/server/media/service";

type Context = { params: Promise<{ id: string }> };
const field = (body: unknown, name: string) => (body as Record<string, unknown> | null)?.[name];

// Start a thumbnail upload: answers with where the browser sends the image.
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await jsonBody(request);
  return adminCatalogResponse(request, (actor) => startThumbnailUpload(mediaDeps(), actor, id, field(body, "contentType")), false);
}

// Confirm the upload, which makes the image the lesson's thumbnail.
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await jsonBody(request);
  return adminCatalogResponse(request, (actor, ip) => confirmThumbnail(mediaDeps(), actor, id, field(body, "key"), ip));
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return adminCatalogResponse(request, (actor, ip) => removeThumbnail(mediaDeps(), actor, id, ip));
}
