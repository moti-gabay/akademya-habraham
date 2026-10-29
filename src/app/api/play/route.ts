import { z } from "zod";
import { jsonBody } from "@/lib/adminApi";
import { authErrorResponse, getActor } from "@/lib/auth";
import { mediaDeps } from "@/lib/media";
import { requireActor } from "@/server/auth/actor";
import { startPlayback } from "@/server/playback/service";

// The one address that hands out a playable video URL. The rules are in
// src/server/playback/service.ts; the proxy has already required same-origin.
const Body = z.object({ lessonId: z.string().min(1).max(64) });

// Never cached, by anyone: the body is a credential.
const respond = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const actor = requireActor(await getActor());
    const body = Body.safeParse(await jsonBody(request));
    if (!body.success) return respond({ error: "invalid_body" }, 400);
    const { repo, provider } = mediaDeps();
    const result = await startPlayback({ repo, provider }, actor, body.data.lessonId);
    if (!result.ok) return respond({ error: result.error }, result.status);
    return respond({ ok: true, url: result.url, expiresAt: result.expiresAt }, 200);
  } catch (error) {
    const response = authErrorResponse(error);
    response.headers.set("cache-control", "private, no-store");
    return response;
  }
}
