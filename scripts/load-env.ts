// Loads .env.local and .env for CLI scripts (Next.js does this itself for the app).
// Values are never printed. Variables already set in the shell win.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
