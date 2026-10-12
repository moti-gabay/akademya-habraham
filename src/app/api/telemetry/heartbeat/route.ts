import { z } from "zod";
import { authErrorResponse, getActor } from "@/lib/auth";
import { requireActor } from "@/server/auth/actor";
import { progressRepo } from "@/server/repos";

const Body = z.object({
  lessonId: z.string().min(1).max(64),
  positionSec: z.number().int().min(0).max(86_400),
});

export async function POST(request: Request) {
  try {
    // Progress is only ever written for the signed-in user.
    const actor = requireActor(await getActor());
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
    await progressRepo.save(actor.userId, body.data.lessonId, body.data.positionSec);
    return new Response(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
