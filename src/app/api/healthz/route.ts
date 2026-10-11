import { sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) return Response.json({ ok: true, db: "not_configured" });
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 503 });
  }
}
