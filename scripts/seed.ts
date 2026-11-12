// DATA_SOURCE=db pnpm db:seed — writes the sample content into the database in DATABASE_URL.
// Refuses unless DATA_SOURCE=db is set on the command line, with NODE_ENV=production or on
// Vercel, and when the database holds users or lessons the seed did not write.
import { getDb } from "../src/server/db/client";
import { readSeedTarget, requireSeedEnv, requireSeedTarget, seed } from "../src/server/db/seed";

async function main() {
  // Checked before the env files load, so a value in .env does not count.
  requireSeedEnv(process.env);
  await import("./load-env");

  const db = getDb();
  requireSeedTarget(await readSeedTarget(db));
  await seed(db);
  console.log("Seeded sample content.");
}

main().catch((error: unknown) => {
  // Connection strings must never reach the terminal or logs.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")}`);
  process.exit(1);
});
