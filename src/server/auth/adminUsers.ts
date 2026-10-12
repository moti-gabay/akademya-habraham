import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { isUuid } from "../db/uuid";
import { requireRole, requireSecondFactor, type Actor, type Role } from "./actor";
import { writeAudit } from "./audit";

// The two Clerk operations an admin needs. Injected so this module stays free of
// Clerk's SDK and can be tested with a fake.
export interface ClerkAdmin {
  setRole(clerkUserId: string, role: Role): Promise<void>;
  setBanned(clerkUserId: string, banned: boolean): Promise<void>;
}

export type UserChange = { role?: Role; blocked?: boolean };
export type UpdateUserResult = "updated" | "not_found" | "own_account";

// Changes another user's role or blocks/unblocks them. Clerk is updated first (it is
// the source of truth), then the mirror, then the audit log.
export async function updateUser(
  db: Db,
  clerk: ClerkAdmin,
  actor: Actor | null,
  targetUserId: string,
  change: UserChange,
  ip?: string | null,
): Promise<UpdateUserResult> {
  const admin = requireSecondFactor(requireRole(actor, "admin"));
  // Admins cannot demote or block themselves, so the last admin cannot lock everyone out.
  if (targetUserId === admin.userId) return "own_account";
  if (!isUuid(targetUserId)) return "not_found";
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target || target.status === "deleted") return "not_found";

  const before = { role: target.role, blocked: target.status === "blocked" };
  const after = { role: change.role ?? before.role, blocked: change.blocked ?? before.blocked };
  if (after.role !== before.role) await clerk.setRole(target.clerkUserId, after.role);
  if (after.blocked !== before.blocked) await clerk.setBanned(target.clerkUserId, after.blocked);

  await db
    .update(users)
    .set({ role: after.role, status: after.blocked ? "blocked" : "active" })
    .where(eq(users.id, target.id));
  await writeAudit(db, {
    actorId: admin.userId,
    action: "user.update",
    targetType: "user",
    targetId: target.id,
    diff: { before, after },
    ip,
  });
  return "updated";
}
