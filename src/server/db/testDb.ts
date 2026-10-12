// Test helper: a fresh in-process Postgres (PGlite) with every migration applied.
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client";

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite({ extensions: { citext } }));
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
