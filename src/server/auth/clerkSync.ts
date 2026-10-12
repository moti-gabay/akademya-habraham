import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { users, webhookEvents } from "../db/schema";
import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";
import { ROLES, type Role } from "./actor";

// Keeps the `users` mirror in step with Clerk. Used by the Clerk webhook and by
// just-in-time provisioning; both go through the same upsert.

// The fields of Clerk's user JSON that the mirror uses.
export type ClerkUserPayload = {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  public_metadata?: Record<string, unknown> | null;
  banned?: boolean;
  updated_at?: number;
};

export type ClerkEvent = { type: string; data: { id?: string } & Record<string, unknown> };

const parseRole = (value: unknown): Role => (ROLES.includes(value as Role) ? (value as Role) : "user");

function toMirror(payload: ClerkUserPayload) {
  const emails = payload.email_addresses ?? [];
  const email =
    (emails.find((item) => item.id === payload.primary_email_address_id) ?? emails[0])?.email_address ??
    `${payload.id}@no-email.invalid`;
  const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || email.split("@")[0];
  return {
    clerkUserId: payload.id,
    email,
    name,
    // Clerk's public metadata is the source of truth for the role.
    role: parseRole(payload.public_metadata?.role),
    status: payload.banned ? ("blocked" as const) : ("active" as const),
    clerkUpdatedAt: new Date(payload.updated_at ?? 0),
  };
}

// Inserts or updates the mirror row. An event older than what is stored changes nothing,
// so webhooks may arrive out of order. `locale` is only used when the row is created.
export async function upsertClerkUser(db: Db, payload: ClerkUserPayload, locale: Locale = DEFAULT_LOCALE) {
  const mirror = toMirror(payload);
  await db
    .insert(users)
    .values({ ...mirror, locale })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: sql`excluded.email`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        status: sql`excluded.status`,
        clerkUpdatedAt: sql`excluded.clerk_updated_at`,
      },
      setWhere: sql`${users.status} <> 'deleted' and (${users.clerkUpdatedAt} is null or ${users.clerkUpdatedAt} <= excluded.clerk_updated_at)`,
    });
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, payload.id)).limit(1);
  return row;
}

// Clerk deleted the user: keep the row for history, remove the personal data.
async function markDeleted(db: Db, clerkUserId: string) {
  await db
    .update(users)
    .set({
      status: "deleted",
      email: sql`'deleted-' || ${users.id} || '@deleted.invalid'`,
      name: "",
      phoneEnc: null,
    })
    .where(eq(users.clerkUserId, clerkUserId));
}

// Idempotent: the event id is recorded first, and an event that was already processed
// is skipped. A failed attempt is stored with its error and retried on redelivery.
export async function handleClerkEvent(db: Db, eventId: string, event: ClerkEvent): Promise<"processed" | "duplicate"> {
  const key = and(eq(webhookEvents.provider, "clerk"), eq(webhookEvents.eventId, eventId));
  await db
    .insert(webhookEvents)
    .values({ provider: "clerk", eventId, type: event.type, payload: event.data })
    .onConflictDoNothing();
  const [stored] = await db.select({ processedAt: webhookEvents.processedAt }).from(webhookEvents).where(key).limit(1);
  if (stored?.processedAt) return "duplicate";

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      await upsertClerkUser(db, event.data as ClerkUserPayload);
    } else if (event.type === "user.deleted" && event.data.id) {
      await markDeleted(db, event.data.id);
    }
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(key);
    return "processed";
  } catch (error) {
    await db.update(webhookEvents).set({ error: error instanceof Error ? error.message : String(error) }).where(key);
    throw error;
  }
}
