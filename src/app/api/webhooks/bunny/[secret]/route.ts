import { handleBunnyWebhook } from "@/lib/bunnyWebhook";
import { mediaDeps } from "@/lib/media";

// Called by Bunny, not by a browser: no session, and exempt from the same-origin check
// like every /api/webhooks/ address (src/proxy.ts).
export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  return handleBunnyWebhook(request, (await params).secret, mediaDeps);
}
