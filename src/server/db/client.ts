import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export const isDbConfigured = () => Boolean(process.env.DATABASE_URL);

// Created per call: the HTTP driver holds no connection, so there is no state to share.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url));
}
