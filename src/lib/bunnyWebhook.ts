import { mediaProviderName } from "@/server/media";
import { handleVideoWebhook, webhookSecretMatches, type MediaDeps } from "@/server/media/service";

// The video provider's "encoding status changed" call. It is not signed, so the address
// carries a secret, and the body is only a hint: the service fetches the real state.
// Without the Bunny provider, or with a wrong secret, the address does not exist.
export async function handleBunnyWebhook(
  request: Request,
  secret: string,
  deps: () => MediaDeps,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  if (mediaProviderName(env) !== "bunny" || !webhookSecretMatches(secret, env.BUNNY_WEBHOOK_SECRET)) {
    return new Response(null, { status: 404 });
  }
  const payload = await request.json().catch(() => null);
  return Response.json({ result: await handleVideoWebhook(deps(), payload) });
}
