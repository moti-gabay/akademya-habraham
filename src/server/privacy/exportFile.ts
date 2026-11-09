import { chmod, mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Where `pnpm user:export` writes: outside the repository, so an export can never be
// committed, indexed with the code, or copied into a worktree.
export const EXPORT_DIR = join(homedir(), "akademya-habraham-exports");

// The export reads a real database, so DATA_SOURCE=db must be set on the command line,
// not picked up from an env file.
export function requireExplicitDb(dataSource: string | undefined) {
  if (dataSource !== "db") throw new Error("Run with DATA_SOURCE=db set on the command line.");
}

// Writes the JSON readable by the owner only (directory 0700, file 0600) and never
// replaces an existing file. Returns the path.
export async function writeExportFile(dir: string, data: unknown, now = new Date()): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const path = join(dir, `user-export-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  // "wx" fails with EEXIST instead of overwriting.
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(data, null, 2)}\n`);
  } finally {
    await file.close();
  }
  return path;
}
