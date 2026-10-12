// pnpm db:seed — writes the sample content into the database in DATABASE_URL.
import "./load-env";
import { getDb } from "../src/server/db/client";
import { seed } from "../src/server/db/seed";

seed(getDb()).then(
  () => console.log("Seeded sample content."),
  (error: unknown) => {
    // Connection strings must never reach the terminal or logs.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Seed failed: ${message.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")}`);
    process.exit(1);
  },
);
