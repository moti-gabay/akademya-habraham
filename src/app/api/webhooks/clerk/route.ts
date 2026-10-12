import { authMode } from "@/lib/authMode";
import { handleClerkWebhook } from "@/lib/clerkWebhook";
import { getDb } from "@/server/db/client";

export async function POST(request: Request) {
  // The users mirror only exists with Clerk and a database.
  if (authMode !== "clerk") return new Response(null, { status: 404 });
  return handleClerkWebhook(request, getDb());
}
