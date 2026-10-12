import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import type { Locale } from "../i18n/locales";
import { upsertClerkUser, type ClerkUserPayload } from "./clerkSync";

export const ROLES = ["user", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Who is making the request, as the rest of the server sees it.
export type Actor = {
  userId: string;
  name: string;
  role: Role;
  locale: Locale;
  // A second factor was verified in this session (required for the admin area).
  secondFactorVerified: boolean;
};

// Thrown by the checks below; route handlers turn it into a 401/403 response.
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: "signed_out" | "account_blocked" | "forbidden" | "second_factor_required",
  ) {
    super(code);
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AuthError(401, "signed_out");
  return actor;
}

// Roles are ordered: an admin passes an editor check, an editor passes a user check.
export function requireRole(actor: Actor | null, role: Role): Actor {
  const known = requireActor(actor);
  if (ROLES.indexOf(known.role) < ROLES.indexOf(role)) throw new AuthError(403, "forbidden");
  return known;
}

export function requireSecondFactor(actor: Actor): Actor {
  if (!actor.secondFactorVerified) throw new AuthError(403, "second_factor_required");
  return actor;
}

// Maps a verified Clerk session to our user. When the mirror has no row yet (the
// webhook has not arrived, or cannot reach a local machine), `fetchClerkUser` supplies
// the user so the row is created on the spot.
export async function resolveActor(
  db: Db,
  session: { clerkUserId: string; secondFactorVerified: boolean },
  fetchClerkUser: () => Promise<ClerkUserPayload | null>,
  locale?: Locale,
): Promise<Actor | null> {
  let [row] = await db.select().from(users).where(eq(users.clerkUserId, session.clerkUserId)).limit(1);
  if (!row) {
    const payload = await fetchClerkUser();
    if (!payload) return null;
    row = await upsertClerkUser(db, payload, locale);
  }
  if (!row || row.status === "deleted") return null;
  if (row.status === "blocked") throw new AuthError(403, "account_blocked");
  return {
    userId: row.id,
    name: row.name,
    role: row.role,
    locale: row.locale,
    secondFactorVerified: session.secondFactorVerified,
  };
}
