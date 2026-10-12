import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// Any Drizzle Postgres database: Neon over HTTP in the app, PGlite in tests.
export type Db = PgDatabase<PgQueryResultHKT>;

export const isDbConfigured = () => Boolean(process.env.DATABASE_URL);

// Created per call: the HTTP driver holds no connection, so there is no state to share.
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url));
}
