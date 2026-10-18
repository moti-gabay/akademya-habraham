import { adminCatalogResponse } from "@/lib/adminApi";
import { mediaDeps } from "@/lib/media";
import { syncCaption } from "@/server/media/service";

// Send a stored caption to the video provider again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  return adminCatalogResponse(request, (actor, ip) => syncCaption(mediaDeps(), actor, id, locale, ip));
}
