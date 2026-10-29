import { serveFakePlayback } from "@/lib/fakePlayback";

// Fake media only: the stand-in video CDN. See src/lib/fakePlayback.ts.
export async function GET(request: Request, { params }: { params: Promise<{ videoId: string; file: string[] }> }) {
  const { videoId, file } = await params;
  return serveFakePlayback(request, videoId, file.join("/"));
}
