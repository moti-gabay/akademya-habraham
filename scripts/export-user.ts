// DATA_SOURCE=db pnpm -s user:export <email> — writes one learner's data (README, "Data
// subject requests") to a 0600 JSON file outside the repository. Prints only the path and
// counts: never the email, the name or anything exported.
import { getDb } from "../src/server/db/client";
import { createDrizzleUserDataRepo } from "../src/server/db/userData";
import { EXPORT_DIR, requireExplicitDb, writeExportFile } from "../src/server/privacy/exportFile";

// Database errors arrive without query parameters (src/server/db/safeErrors.ts); a
// connection string is still cut out.
function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]");
}

async function main() {
  // Checked before the env files load, so a DATA_SOURCE in .env does not count.
  requireExplicitDb(process.env.DATA_SOURCE);
  await import("./load-env");

  const email = process.argv[2]?.trim();
  if (!email || !email.includes("@") || process.argv.length > 3) {
    throw new Error("Usage: DATA_SOURCE=db pnpm -s user:export <email>");
  }
  const repo = createDrizzleUserDataRepo(getDb);
  const userId = await repo.findIdByEmail(email);
  const data = userId && (await repo.buildExport(userId));
  if (!data) throw new Error("No active user with that email.");

  const now = new Date();
  const path = await writeExportFile(EXPORT_DIR, { exportedAt: now.toISOString(), ...data }, now);
  console.log(`Wrote ${path} (mode 0600): ${data.progress.length} lesson progress rows, ${data.accountChanges.length} account changes.`);
}

main().catch((error: unknown) => {
  console.error(`Export failed: ${safeMessage(error)}`);
  process.exit(1);
});
