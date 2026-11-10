import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./client";
import { toSafeDbError } from "./safeErrors";

type Statement = BatchItem<"pg">;

// Runs the statements all-or-nothing. Neon's HTTP driver has no interactive
// transactions but sends a batch as one transaction; PGlite (tests) has transactions
// but no batch. Callers build the statements once and this picks the path.
// Neon's batch error skips Drizzle's wrapping, so it is made safe here (see safeErrors.ts).
export async function atomic(db: Db, build: (q: Db) => Statement[]): Promise<void> {
  const batch = (db as Db & { batch?: (statements: Statement[]) => Promise<unknown> }).batch;
  if (typeof batch === "function") {
    const statements = build(db);
    if (statements.length > 0) await batch.call(db, statements).catch((error: unknown) => Promise.reject(toSafeDbError(error)));
    return;
  }
  await db.transaction(async (tx) => {
    for (const statement of build(tx)) await statement;
  });
}
