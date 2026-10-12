import { sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/server/db/client";
import { dataSource } from "@/server/repos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) return Response.json({ ok: true, db: "not_configured", dataSource });
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", dataSource });
  } catch {
    return Response.json({ ok: false, db: "error", dataSource }, { status: 503 });
  }
}
