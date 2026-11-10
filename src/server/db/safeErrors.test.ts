// pnpm test:unit — a failing statement never carries its parameters (a fictional email
// here) out of the database layer: not in the message, the cause, the fields or the stack.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { inspect } from "node:util";
import { eq, sql } from "drizzle-orm";
import { NeonHttpPreparedQuery } from "drizzle-orm/neon-http";
import { PgPreparedQuery } from "drizzle-orm/pg-core";
import { PglitePreparedQuery } from "drizzle-orm/pglite";
import { isUniqueViolation } from "../catalog/errors";
import { atomic } from "./atomic";
import type { Db } from "./client";
import { DatabaseError, toSafeDbError } from "./safeErrors";
import { users } from "./schema";
import { createTestDb } from "./testDb";

const EMAIL = "leak.check@example.com";
const NAME = "Fictional Leak";

let db: Db;
before(async () => {
  db = await createTestDb();
});

// What Next prints for an uncaught error: message, stack, cause and own fields.
const printed = (error: unknown) => inspect(error, { depth: 10 });
async function failure(run: () => Promise<unknown>): Promise<DatabaseError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof DatabaseError, `expected a DatabaseError, got ${inspect(error)}`);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(printed(error), new RegExp(`${EMAIL}|${NAME}`.replace(/\./g, "\\.")));
    return error;
  }
  assert.fail("the statement did not fail");
}

// The wrapper sits on an internal Drizzle method (ARCHITECTURE.md, "Upgrading Drizzle").
// These fail when an upgrade renames it, changes its arguments or makes a driver bypass it;
// without them the app would run with nothing wrapped.
test("Drizzle's internal query method is wrapped, with the signature the wrapper expects", () => {
  type Wrapped = { queryWithCache?: { safe?: true; original?: (...args: unknown[]) => unknown } };
  const base = (PgPreparedQuery.prototype as unknown as Wrapped).queryWithCache;
  assert.equal(base?.safe, true, "PgPreparedQuery.queryWithCache is not wrapped");
  // (queryString, params, query)
  assert.equal(base.original?.length, 3, "PgPreparedQuery.queryWithCache changed its arguments");
  for (const driver of [NeonHttpPreparedQuery, PglitePreparedQuery]) {
    assert.equal((driver.prototype as unknown as Wrapped).queryWithCache, base, `${driver.name} has its own queryWithCache`);
  }
});

test("a failing insert does not carry the email or name it was given", async () => {
  await db.execute(sql.raw(`create function fail_insert() returns trigger language plpgsql as $$ begin raise exception 'insert refused'; end $$`));
  await db.execute(sql.raw("create trigger fail_insert before insert on users for each row execute function fail_insert()"));
  const error = await failure(() => db.insert(users).values({ clerkUserId: "user_leak", email: EMAIL, name: NAME }));
  assert.equal(error.message, "insert refused");
  assert.equal(error.code, "P0001");
  assert.match(error.stack ?? "", /^DatabaseError: insert refused\n {4}at /);
  await db.execute(sql.raw("drop trigger fail_insert on users"));
});

test("a value Postgres cannot convert is not echoed", async () => {
  const error = await failure(() => db.select().from(users).where(eq(users.id, EMAIL)));
  assert.equal(error.message, "invalid input syntax for type uuid: [value]");
  assert.equal(error.code, "22P02");
});

test("the failing row in the driver's detail is dropped", async () => {
  const error = await failure(() =>
    db.execute(sql`insert into users (clerk_user_id, email, name) values (${"user_leak"}, ${EMAIL}, ${null})`),
  );
  assert.equal(error.code, "23502");
});

test("an atomic batch fails without its parameters", async () => {
  await db.insert(users).values({ clerkUserId: "user_taken", email: "taken@example.com", name: "Taken" });
  const error = await failure(() =>
    atomic(db, (q) => [
      q.update(users).set({ name: NAME }).where(eq(users.clerkUserId, "user_taken")),
      q.insert(users).values({ clerkUserId: "user_taken", email: EMAIL, name: NAME }),
    ]),
  );
  // The code survives, so the catalog still tells a lost race from other failures.
  assert.ok(isUniqueViolation(error));
  assert.equal((await db.select().from(users).where(eq(users.clerkUserId, "user_taken")))[0].name, "Taken");
});

test("Neon's batch error shape is cleaned too", () => {
  // As @neondatabase/serverless throws from a batch: Postgres fields copied onto the error.
  const neon = Object.assign(new Error(`null value in column "name" of relation "users" violates not-null constraint`), {
    code: "23502",
    detail: `Failing row contains (x, user_leak, ${EMAIL}, null).`,
  });
  const safe = toSafeDbError(neon);
  assert.equal(safe.message, neon.message);
  assert.doesNotMatch(printed(safe), /leak\.check/);
});
