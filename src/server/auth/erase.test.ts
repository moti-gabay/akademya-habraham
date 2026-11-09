// pnpm test:unit — Clerk's user.deleted on PGlite: what is erased, what is kept, and
// that the erase is all-or-nothing and idempotent.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { and, count, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, lessons, userLessonProgress, users, webhookEvents } from "../db/schema";
import { lessonSeedId, seed } from "../db/seed";
import { createTestDb } from "../db/testDb";
import { NEW_USER_ID, SAMPLE_USER_ID } from "../mock/data";
import { resolveActor } from "./actor";
import { handleClerkEvent, type ClerkUserPayload } from "./clerkSync";

// The seed's Clerk ids for the two sample users.
const GONE = "seed_sample_user";
const STAYS = "seed_new_user";
const LESSON = lessonSeedId("shabbat-6");

let db: Db;
before(async () => {
  db = await createTestDb();
  await seed(db);
  // The other user has progress too, so the erase can be seen to touch one user only.
  await db.insert(userLessonProgress).values({ userId: NEW_USER_ID, lessonId: LESSON, lastPositionSec: 60, watchedPct: 10 });
  // Rows stored before payloads were cut down: the full Clerk JSON, email included.
  for (const id of [GONE, STAYS]) {
    await db.insert(webhookEvents).values({
      provider: "clerk",
      eventId: `legacy_${id}`,
      type: "user.created",
      payload: { id, email_addresses: [{ id: "em_1", email_address: `${id}@example.com` }], first_name: "Dana" },
      processedAt: new Date(),
    });
  }
  // History that must survive: an admin change to the user, a change the user made as
  // an admin, and a lesson they created.
  await db.insert(auditLog).values([
    { actorId: NEW_USER_ID, action: "user.update", targetType: "user", targetId: SAMPLE_USER_ID, diff: { before: { role: "user" } }, ip: "203.0.113.7" },
    { actorId: SAMPLE_USER_ID, action: "catalog.lessons.update", targetType: "lessons", targetId: LESSON, ip: "203.0.113.8" },
  ]);
  await db.update(lessons).set({ createdBy: SAMPLE_USER_ID }).where(eq(lessons.id, LESSON));
});

const clerkUser = (id: string, updatedAt: number): ClerkUserPayload => ({
  id,
  email_addresses: [{ id: "em_1", email_address: "returned@example.com" }],
  primary_email_address_id: "em_1",
  first_name: "Returned",
  updated_at: updatedAt,
});
const row = async (clerkUserId: string) => (await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
const progressCount = async (userId: string) =>
  (await db.select({ n: count() }).from(userLessonProgress).where(eq(userLessonProgress.userId, userId)))[0].n;
const stored = async (eventId: string) => {
  const [event] = await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, "clerk"), eq(webhookEvents.eventId, eventId)));
  return { ...event, payload: event.payload as Record<string, unknown> };
};
const deleted = { type: "user.deleted", data: { id: GONE, deleted: true } };

test("a new event is stored as its id and type only", async () => {
  await handleClerkEvent(db, "evt_update", { type: "user.updated", data: clerkUser(GONE, 1_000) });
  assert.deepEqual((await stored("evt_update")).payload, { id: GONE, type: "user.updated" });
  assert.equal((await row(GONE)).name, "Returned");
});

test("a failing statement rolls the whole erase back, and redelivery completes it", async () => {
  const progressBefore = await progressCount(SAMPLE_USER_ID);
  assert.ok(progressBefore > 0);
  // The last statement of the batch (cutting down payloads) fails.
  await db.execute(
    sql.raw(`create function fail_payload_scrub() returns trigger language plpgsql as $$
      begin raise exception 'payload scrub failed'; end $$`),
  );
  await db.execute(
    sql.raw(`create trigger fail_payload_scrub before update on webhook_events
      for each row when (old.payload is distinct from new.payload) execute function fail_payload_scrub()`),
  );
  // Only the database's message is stored and thrown, never the query's parameters.
  await assert.rejects(handleClerkEvent(db, "evt_delete", deleted), { message: "Clerk user.deleted failed: payload scrub failed" });

  const kept = await row(GONE);
  assert.deepEqual([kept.status, kept.email, kept.name], ["active", "returned@example.com", "Returned"]);
  assert.equal(await progressCount(SAMPLE_USER_ID), progressBefore);
  assert.equal((await stored(`legacy_${GONE}`)).payload.first_name, "Dana");
  const failed = await stored("evt_delete");
  assert.equal(failed.processedAt, null);
  assert.equal(failed.error, "payload scrub failed");

  await db.execute(sql.raw("drop trigger fail_payload_scrub on webhook_events"));
  await db.execute(sql.raw("drop function fail_payload_scrub()"));
  assert.equal(await handleClerkEvent(db, "evt_delete", deleted), "processed");
  assert.equal((await stored("evt_delete")).error, null);
});

test("the erase removes the user's personal data and progress, and nothing else", async () => {
  const gone = await row(GONE);
  assert.equal(gone.id, SAMPLE_USER_ID);
  assert.equal(gone.status, "deleted");
  assert.equal(gone.name, "");
  assert.equal(gone.email, `deleted-${SAMPLE_USER_ID}@deleted.invalid`);
  assert.equal(gone.phoneEnc, null);
  assert.equal(gone.lastSeenAt, null);
  assert.equal(await progressCount(SAMPLE_USER_ID), 0);
  for (const eventId of [`legacy_${GONE}`, "evt_update", "evt_delete"]) {
    assert.deepEqual((await stored(eventId)).payload, { id: GONE });
  }

  // The other user is untouched.
  const other = await row(STAYS);
  assert.deepEqual([other.status, other.email], ["active", "david@example.com"]);
  assert.equal(await progressCount(NEW_USER_ID), 1);
  assert.equal((await stored(`legacy_${STAYS}`)).payload.first_name, "Dana");

  // History is kept, still pointing at the tombstone.
  const audit = await db.select().from(auditLog);
  assert.equal(audit.length, 2);
  assert.ok(audit.some((entry) => entry.targetId === SAMPLE_USER_ID && entry.action === "user.update"));
  assert.ok(audit.some((entry) => entry.actorId === SAMPLE_USER_ID && entry.ip === "203.0.113.8"));
  assert.equal((await db.select({ createdBy: lessons.createdBy }).from(lessons).where(eq(lessons.id, LESSON)))[0].createdBy, SAMPLE_USER_ID);
});

test("a replayed or repeated deletion changes nothing", async () => {
  const before = await row(GONE);
  assert.equal(await handleClerkEvent(db, "evt_delete", deleted), "duplicate");
  assert.equal(await handleClerkEvent(db, "evt_delete_again", deleted), "processed");
  assert.deepEqual(await row(GONE), before);
  assert.equal(await progressCount(NEW_USER_ID), 1);
});

test("a late user.updated or user.created does not bring the user back", async () => {
  await handleClerkEvent(db, "evt_late_update", { type: "user.updated", data: clerkUser(GONE, 9_000) });
  await handleClerkEvent(db, "evt_late_create", { type: "user.created", data: clerkUser(GONE, 9_500) });
  const gone = await row(GONE);
  assert.deepEqual([gone.status, gone.name], ["deleted", ""]);
  assert.match(gone.email, /@deleted\.invalid$/);
  assert.equal((await db.select({ n: count() }).from(users).where(eq(users.clerkUserId, GONE)))[0].n, 1);
  assert.deepEqual((await stored("evt_late_update")).payload, { id: GONE, type: "user.updated" });
  assert.equal(await resolveActor(db, { clerkUserId: GONE, secondFactorVerified: false }, async () => null), null);
});

test("a failed user event keeps the user's email and name out of the stored error and the log", async () => {
  await db.execute(
    sql.raw(`create function fail_mirror() returns trigger language plpgsql as $$
      begin raise exception 'mirror write failed'; end $$`),
  );
  await db.execute(sql.raw("create trigger fail_mirror before insert on users for each row execute function fail_mirror()"));
  const event = { type: "user.created", data: clerkUser("user_failing", 1_000) };
  await assert.rejects(handleClerkEvent(db, "evt_failing", event), (error: Error) => {
    assert.equal(error.message, "Clerk user.created failed: mirror write failed");
    assert.equal(error.cause, undefined);
    return true;
  });
  const failed = await stored("evt_failing");
  assert.equal(failed.error, "mirror write failed");
  assert.deepEqual(failed.payload, { id: "user_failing", type: "user.created" });
  await db.execute(sql.raw("drop trigger fail_mirror on users"));
  await db.execute(sql.raw("drop function fail_mirror()"));
});
