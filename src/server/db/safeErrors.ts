import { DrizzleQueryError } from "drizzle-orm";
import { PgPreparedQuery } from "drizzle-orm/pg-core";

// Database errors leave the database layer with the database's message and SQLSTATE code
// only. Drizzle's own error lists every query parameter in its message (emails, names,
// ids), and the driver's error can carry the failing row in `detail`; Next prints the
// message, the cause and their fields in the server log for any error a page or route
// does not catch.
export class DatabaseError extends Error {
  override name = "DatabaseError";
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function toSafeDbError(error: unknown): Error {
  if (error instanceof DatabaseError) return error;
  const root = error instanceof DrizzleQueryError ? error.cause : error;
  const message = (root instanceof Error ? root.message : String(root))
    // A value Postgres could not use is quoted after a colon: `… for type uuid: "…"`.
    .replace(/:\s*"[^"]*"/g, ": [value]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]");
  const code = (root as { code?: unknown } | null)?.code;
  const safe = new DatabaseError(message, typeof code === "string" ? code : undefined);
  // Keep where it was thrown from; the original first line holds the parameters.
  const frames = (error instanceof Error ? (error.stack ?? "") : "").split("\n").filter((line) => line.startsWith("    at "));
  if (frames.length > 0) safe.stack = [`${safe.name}: ${safe.message}`, ...frames].join("\n");
  return safe;
}

// Every statement Drizzle runs on Postgres (Neon over HTTP, PGlite in tests) goes through
// this internal method, which is where Drizzle wraps a failure. Neon's batch does not, so
// `atomic()` applies toSafeDbError itself.
type Query = (this: unknown, ...args: unknown[]) => Promise<unknown>;
const prototype = PgPreparedQuery.prototype as unknown as { queryWithCache?: Query & { safe?: true } };
const original = prototype.queryWithCache;
if (typeof original !== "function") {
  throw new Error("drizzle-orm no longer has PgPreparedQuery.queryWithCache: update src/server/db/safeErrors.ts.");
}
if (!original.safe) {
  const safeQuery: Query & { safe?: true } = async function (this: unknown, ...args: unknown[]) {
    try {
      return await original.apply(this, args);
    } catch (error) {
      throw toSafeDbError(error);
    }
  };
  safeQuery.safe = true;
  prototype.queryWithCache = safeQuery;
}
