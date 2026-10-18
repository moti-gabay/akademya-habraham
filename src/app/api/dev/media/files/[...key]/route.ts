import { authErrorResponse, getActor } from "@/lib/auth";
import { fakeRoutesEnabled } from "@/lib/media";
import { admin } from "@/server/catalog/service";
import { fakeMediaState } from "@/server/media/fake";

// Fake media only: stands in for the public bucket. Thumbnails are the only files a
// bucket serves; captions are never reachable here. Does not exist with real storage or
// on Vercel.
const MAX_BYTES = 5 * 1024 * 1024;
type Context = { params: Promise<{ key: string[] }> };

async function thumbnailKey({ params }: Context): Promise<string | null> {
  const key = (await params).key.join("/");
  return fakeRoutesEnabled() && key.startsWith("thumbnails/") ? key : null;
}

export async function PUT(request: Request, context: Context) {
  const key = await thumbnailKey(context);
  if (!key) return new Response(null, { status: 404 });
  try {
    admin(await getActor());
  } catch (error) {
    return authErrorResponse(error);
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  fakeMediaState.files.set(key, { body, contentType: request.headers.get("content-type") ?? "application/octet-stream" });
  return new Response(null, { status: 204 });
}

export async function GET(_request: Request, context: Context) {
  const key = await thumbnailKey(context);
  const file = key && fakeMediaState.files.get(key);
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: { "content-type": file.contentType, "x-content-type-options": "nosniff", "cache-control": "no-store" },
  });
}
