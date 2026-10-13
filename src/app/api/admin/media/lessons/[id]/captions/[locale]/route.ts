import { adminCatalogResponse } from "@/lib/adminApi";
import { mediaDeps } from "@/lib/media";
import { removeCaption, saveCaption } from "@/server/media/service";

type Context = { params: Promise<{ id: string; locale: string }> };

// Upload a caption file (WebVTT) for one language. Unlike video and images, captions
// pass through the server: they are small, they are validated here, and the video
// provider needs their content.
export async function PUT(request: Request, { params }: Context) {
  const { id, locale } = await params;
  const file = new Uint8Array(await request.arrayBuffer());
  return adminCatalogResponse(request, (actor, ip) => saveCaption(mediaDeps(), actor, id, locale, file, ip));
}

export async function DELETE(request: Request, { params }: Context) {
  const { id, locale } = await params;
  return adminCatalogResponse(request, (actor, ip) => removeCaption(mediaDeps(), actor, id, locale, ip));
}
