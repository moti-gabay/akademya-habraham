import { sql } from "drizzle-orm";
import { authMode } from "@/lib/authMode";
import { getDb, isDbConfigured } from "@/server/db/client";
import { failureSummary } from "@/server/db/failureSummary";
import { mediaConfigured } from "@/server/media";
import { dataSource } from "@/server/repos";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = { dataSource, auth: authMode };
  if (!isDbConfigured()) return Response.json({ ok: true, db: "not_configured", ...mode, media: mediaConfigured() });
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", ...mode, media: mediaConfigured() });
  } catch (error) {
    // Classes and a code only: the message can name the host or the user.
    console.error("Health check: database failed", JSON.stringify(failureSummary(error)));
    return Response.json({ ok: false, db: "error", ...mode }, { status: 503 });
  }
}
