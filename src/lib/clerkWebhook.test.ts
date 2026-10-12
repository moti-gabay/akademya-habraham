// pnpm test:unit — the Clerk webhook endpoint logic with a locally signed request.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import type { Db } from "../server/db/client";
import { users } from "../server/db/schema";
import { createTestDb } from "../server/db/testDb";
import { handleClerkWebhook } from "./clerkWebhook";

// A throwaway signing secret in Svix's format; nothing here touches a real Clerk instance.
const key = randomBytes(24);
const secret = `whsec_${key.toString("base64")}`;

function signedRequest(id: string, body: object, signWith = key) {
  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", signWith).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: payload,
  });
}

const event = {
  type: "user.created",
  object: "event",
  data: {
    id: "user_hook",
    email_addresses: [{ id: "em_1", email_address: "hook@example.com" }],
    primary_email_address_id: "em_1",
    first_name: "Noa",
    last_name: null,
    public_metadata: {},
    banned: false,
    updated_at: 1_000,
  },
};

let db: Db;
before(async () => {
  db = await createTestDb();
});

test("a correctly signed event creates the user; replaying it is a no-op", async () => {
  const first = await handleClerkWebhook(signedRequest("msg_1", event), db, secret);
  assert.deepEqual([first.status, await first.json()], [200, { ok: true, result: "processed" }]);
  const replay = await handleClerkWebhook(signedRequest("msg_1", event), db, secret);
  assert.deepEqual([replay.status, await replay.json()], [200, { ok: true, result: "duplicate" }]);

  const rows = await db.select().from(users).where(eq(users.clerkUserId, "user_hook"));
  assert.deepEqual(rows.map((row) => [row.email, row.name]), [["hook@example.com", "Noa"]]);
});

test("a request signed with another key is rejected and changes nothing", async () => {
  const forged = { ...event, data: { ...event.data, id: "user_forged" } };
  const response = await handleClerkWebhook(signedRequest("msg_2", forged, randomBytes(24)), db, secret);
  assert.equal(response.status, 400);
  assert.equal((await db.select().from(users).where(eq(users.clerkUserId, "user_forged"))).length, 0);
});
