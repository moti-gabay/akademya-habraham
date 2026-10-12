import { sql } from "drizzle-orm";
import { authMode } from "@/lib/authMode";
import { getDb, isDbConfigured } from "@/server/db/client";
import { dataSource } from "@/server/repos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) return Response.json({ ok: true, db: "not_configured", dataSource, auth: authMode });
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", dataSource, auth: authMode });
  } catch {
    return Response.json({ ok: false, db: "error", dataSource, auth: authMode }, { status: 503 });
  }
}
