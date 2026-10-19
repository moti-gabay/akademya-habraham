import { getFileStorage } from "@/server/media";
import { thumbnailContentType } from "@/server/media/service";

// A lesson thumbnail from the private bucket. Thumbnails are public, so there is no
// session check; any key that is not a thumbnail is a 404. Each upload gets a new key,
// so the file never changes and the CDN may keep it for a year.
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const contentType = thumbnailContentType(key);
  const file = contentType && (await getFileStorage().get(key));
  if (!file) return new Response(null, { status: 404 });
  return new Response(file as BodyInit, {
    headers: {
      "content-type": contentType,
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
