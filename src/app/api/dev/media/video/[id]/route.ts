import { authErrorResponse, getActor } from "@/lib/auth";
import { fakeProvider, fakeRoutesEnabled } from "@/lib/media";
import { admin } from "@/server/catalog/service";

// Fake media only: stands in for the video provider's upload address. The file is read
// and thrown away; only its size is kept. Does not exist with a real provider or on Vercel.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!fakeRoutesEnabled()) return new Response(null, { status: 404 });
  try {
    admin(await getActor());
  } catch (error) {
    return authErrorResponse(error);
  }
  let bytes = 0;
  const reader = request.body?.getReader();
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) bytes += chunk.value.byteLength;
  return new Response(null, { status: fakeProvider().receiveUpload((await params).id, bytes) ? 204 : 404 });
}
