import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { authErrorResponse, getActor } from "@/lib/auth";
import { authMode } from "@/lib/authMode";
import { ROLES } from "@/server/auth/actor";
import { updateUser, type ClerkAdmin } from "@/server/auth/adminUsers";
import { getDb } from "@/server/db/client";

const Body = z
  .object({ role: z.enum(ROLES).optional(), blocked: z.boolean().optional() })
  .refine((body) => body.role !== undefined || body.blocked !== undefined);

const clerk: ClerkAdmin = {
  async setRole(clerkUserId, role) {
    await (await clerkClient()).users.updateUserMetadata(clerkUserId, { publicMetadata: { role } });
  },
  async setBanned(clerkUserId, banned) {
    const client = await clerkClient();
    await (banned ? client.users.banUser(clerkUserId) : client.users.unbanUser(clerkUserId));
  },
};

// Change a user's role or block/unblock them. Admins only, second factor required, audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (authMode !== "clerk") return new Response(null, { status: 404 });
  try {
    const actor = await getActor();
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const result = await updateUser(getDb(), clerk, actor, (await params).id, body.data, ip);
    if (result === "not_found") return Response.json({ error: result }, { status: 404 });
    if (result === "own_account") return Response.json({ error: result }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
