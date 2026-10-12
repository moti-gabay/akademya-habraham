// pnpm test:db — Clerk sync, actor resolution, role and second-factor checks, audit log.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, users, webhookEvents } from "../db/schema";
import { createTestDb } from "../db/testDb";
import { AuthError, requireRole, requireSecondFactor, resolveActor, type Actor } from "./actor";
import { updateUser, type ClerkAdmin } from "./adminUsers";
import { handleClerkEvent, type ClerkUserPayload } from "./clerkSync";

let db: Db;
before(async () => {
  db = await createTestDb();
});

const clerkUser = (id: string, patch: Partial<ClerkUserPayload> = {}): ClerkUserPayload => ({
  id,
  email_addresses: [{ id: "em_1", email_address: `${id}@example.com` }],
  primary_email_address_id: "em_1",
  first_name: "Dana",
  last_name: "Levi",
  public_metadata: {},
  banned: false,
  updated_at: 1_000,
  ...patch,
});
const mirror = async (clerkUserId: string) =>
  (await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
const code = (expected: string) => (error: unknown) => error instanceof AuthError && error.code === expected;
const noFetch = async () => null;

test("a webhook delivered twice is applied once", async () => {
  const event = { type: "user.created", data: clerkUser("user_a") };
  assert.equal(await handleClerkEvent(db, "evt_1", event), "processed");
  assert.equal(await handleClerkEvent(db, "evt_1", event), "duplicate");

  const row = await mirror("user_a");
  assert.deepEqual([row.email, row.name, row.role, row.status], ["user_a@example.com", "Dana Levi", "user", "active"]);
  assert.equal((await db.select().from(users).where(eq(users.clerkUserId, "user_a"))).length, 1);
  assert.equal((await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, "evt_1"))).length, 1);
});

test("role and ban follow Clerk; an older event arriving late changes nothing", async () => {
  await handleClerkEvent(db, "evt_2", {
    type: "user.updated",
    data: clerkUser("user_a", { public_metadata: { role: "editor" }, banned: true, updated_at: 3_000 }),
  });
  assert.deepEqual([(await mirror("user_a")).role, (await mirror("user_a")).status], ["editor", "blocked"]);

  await handleClerkEvent(db, "evt_3", { type: "user.updated", data: clerkUser("user_a", { updated_at: 2_000 }) });
  assert.deepEqual([(await mirror("user_a")).role, (await mirror("user_a")).status], ["editor", "blocked"]);

  await handleClerkEvent(db, "evt_4", {
    type: "user.updated",
    data: clerkUser("user_a", { public_metadata: { role: "owner" }, updated_at: 4_000 }),
  });
  assert.deepEqual([(await mirror("user_a")).role, (await mirror("user_a")).status], ["user", "active"]);
});

test("a deleted user keeps the row without personal data and cannot come back", async () => {
  await handleClerkEvent(db, "evt_5", { type: "user.created", data: clerkUser("user_gone") });
  await handleClerkEvent(db, "evt_6", { type: "user.deleted", data: { id: "user_gone", deleted: true } });
  const row = await mirror("user_gone");
  assert.equal(row.status, "deleted");
  assert.equal(row.name, "");
  assert.match(row.email, /@deleted\.invalid$/);

  await handleClerkEvent(db, "evt_7", { type: "user.updated", data: clerkUser("user_gone", { updated_at: 9_000 }) });
  assert.equal((await mirror("user_gone")).status, "deleted");
  assert.equal(await resolveActor(db, { clerkUserId: "user_gone", secondFactorVerified: false }, noFetch), null);
});

test("a session without a mirror row is provisioned on the spot", async () => {
  const session = { clerkUserId: "user_new", secondFactorVerified: false };
  assert.equal(await resolveActor(db, session, noFetch), null);

  const actor = await resolveActor(db, session, async () => clerkUser("user_new"), "ru");
  assert.deepEqual(
    [actor?.role, actor?.locale, actor?.secondFactorVerified],
    ["user", "ru", false],
  );
  assert.equal(actor?.userId, (await mirror("user_new")).id);
});

test("a blocked user is refused", async () => {
  await handleClerkEvent(db, "evt_8", { type: "user.created", data: clerkUser("user_blocked", { banned: true }) });
  await assert.rejects(
    resolveActor(db, { clerkUserId: "user_blocked", secondFactorVerified: true }, noFetch),
    code("account_blocked"),
  );
});

test("role checks are ordered and the admin area needs a second factor", () => {
  const actor = (role: Actor["role"], secondFactorVerified = false): Actor => ({
    userId: "u",
    role,
    locale: "he",
    secondFactorVerified,
  });
  assert.throws(() => requireRole(null, "user"), code("signed_out"));
  assert.throws(() => requireRole(actor("user"), "editor"), code("forbidden"));
  assert.throws(() => requireRole(actor("editor"), "admin"), code("forbidden"));
  assert.equal(requireRole(actor("admin"), "editor").role, "admin");
  assert.throws(() => requireSecondFactor(actor("admin")), code("second_factor_required"));
  assert.equal(requireSecondFactor(actor("admin", true)).role, "admin");
});

test("an admin change updates Clerk and the mirror and is audited; everyone else is refused", async () => {
  await handleClerkEvent(db, "evt_9", {
    type: "user.created",
    data: clerkUser("user_admin", { public_metadata: { role: "admin" } }),
  });
  await handleClerkEvent(db, "evt_10", { type: "user.created", data: clerkUser("user_target") });
  const admin = await resolveActor(db, { clerkUserId: "user_admin", secondFactorVerified: true }, noFetch);
  const target = await mirror("user_target");
  assert.ok(admin);

  const calls: unknown[] = [];
  const clerk: ClerkAdmin = {
    setRole: async (...args) => void calls.push(["setRole", ...args]),
    setBanned: async (...args) => void calls.push(["setBanned", ...args]),
  };
  const change = { role: "editor" as const, blocked: true };

  await assert.rejects(updateUser(db, clerk, null, target.id, change), code("signed_out"));
  await assert.rejects(updateUser(db, clerk, { ...admin, role: "editor" }, target.id, change), code("forbidden"));
  await assert.rejects(
    updateUser(db, clerk, { ...admin, secondFactorVerified: false }, target.id, change),
    code("second_factor_required"),
  );
  assert.equal(await updateUser(db, clerk, admin, admin.userId, { role: "user" }), "own_account");
  assert.equal(await updateUser(db, clerk, admin, "not-a-uuid", change), "not_found");
  assert.deepEqual(calls, []);
  assert.equal((await db.select().from(auditLog)).length, 0);

  assert.equal(await updateUser(db, clerk, admin, target.id, change, "203.0.113.7"), "updated");
  assert.deepEqual(calls, [
    ["setRole", "user_target", "editor"],
    ["setBanned", "user_target", true],
  ]);
  assert.deepEqual([(await mirror("user_target")).role, (await mirror("user_target")).status], ["editor", "blocked"]);
  const [entry] = await db.select().from(auditLog);
  assert.deepEqual(
    [entry.actorId, entry.action, entry.targetType, entry.targetId, entry.ip],
    [admin.userId, "user.update", "user", target.id, "203.0.113.7"],
  );
  assert.deepEqual(entry.diff, {
    before: { role: "user", blocked: false },
    after: { role: "editor", blocked: true },
  });
});
