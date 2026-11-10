// pnpm test:unit — the export file: owner-only permissions, no overwrite, explicit database.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { EXPORT_DIR, requireExplicitDb, writeExportFile } from "./exportFile";

const root = await mkdtemp(join(tmpdir(), "user-export-test-"));
after(() => rm(root, { recursive: true, force: true }));
const NOW = new Date("2026-11-09T10:00:00.000Z");

test("the file and its folder are readable by the owner only", async () => {
  const dir = join(root, "exports");
  const path = await writeExportFile(dir, { account: { id: "x" } }, NOW);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { account: { id: "x" } });
});

test("an existing file is never overwritten", async () => {
  const dir = join(root, "exports");
  await assert.rejects(writeExportFile(dir, { other: true }, NOW), { code: "EEXIST" });
  const [path] = [join(dir, "user-export-2026-11-09T10-00-00-000Z.json")];
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { account: { id: "x" } });
});

test("only an explicit DATA_SOURCE=db is accepted", () => {
  assert.doesNotThrow(() => requireExplicitDb("db"));
  for (const value of [undefined, "", "mock", "DB"]) assert.throws(() => requireExplicitDb(value), /DATA_SOURCE=db/);
});

test("the export folder is outside the repository", () => {
  assert.ok(relative(process.cwd(), EXPORT_DIR).startsWith(".."));
});
