import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { handleClerkEvent, type ClerkEvent } from "@/server/auth/clerkSync";
import type { Db } from "@/server/db/client";

// Verifies the Svix signature, then applies the event. Returns 400 for a request that
// is not from Clerk. A processing failure throws, so Clerk gets a 500 and retries.
export async function handleClerkWebhook(request: Request, db: Db, signingSecret?: string): Promise<Response> {
  const eventId = request.headers.get("svix-id");
  let event: ClerkEvent;
  try {
    // Clerk types this for NextRequest but only reads the standard Request API.
    const verified = await verifyWebhook(request as Parameters<typeof verifyWebhook>[0], { signingSecret });
    event = verified as unknown as ClerkEvent;
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (!eventId) return Response.json({ error: "invalid_signature" }, { status: 400 });
  const result = await handleClerkEvent(db, eventId, event);
  return Response.json({ ok: true, result });
}
