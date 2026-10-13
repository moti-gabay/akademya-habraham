import { adminCatalogResponse } from "@/lib/adminApi";
import { mediaDeps } from "@/lib/media";
import { getMedia, removeVideo, startVideoUpload } from "@/server/media/service";

type Context = { params: Promise<{ id: string }> };

// Start a video upload: answers with where the browser sends the file.
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return adminCatalogResponse(request, (actor, ip) => startVideoUpload(mediaDeps(), actor, id, ip));
}

// The lesson's media, after asking the provider how the video is doing. The admin screen
// polls this while a video is processing.
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return adminCatalogResponse(request, (actor) => getMedia(mediaDeps(), actor, id), false);
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return adminCatalogResponse(request, (actor, ip) => removeVideo(mediaDeps(), actor, id, ip));
}
