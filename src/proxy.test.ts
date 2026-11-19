// pnpm test:unit — which addresses the proxy runs on, checked with Next's own matcher test helper.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./proxy";

// The helper is experimental: after a Next upgrade that moves or renames it, fail the
// whole file rather than test nothing.
if (typeof unstable_doesMiddlewareMatch !== "function") {
  throw new Error("next/experimental/testing/server no longer exports unstable_doesMiddlewareMatch: update src/proxy.test.ts.");
}
const runs = (path: string) => unstable_doesMiddlewareMatch({ config, url: `https://app.example.com${path}` });

test("pages and API routes run through the proxy, dots included", () => {
  for (const path of [
    "/",
    "/he",
    "/en/path",
    "/he/holidays/purim",
    "/he/holidays/purim/lesson.v2",
    "/he/path/x.php",
    "/he/admin/lessons/v1.2",
    "/api/play",
    "/api/healthz",
    "/api/captions/lesson-1/he.vtt",
    "/api/thumbnails/images/a.png",
    "/api/webhooks/bunny/secret",
  ]) {
    assert.ok(runs(path), path);
  }
});

test("Next's own files and static files are skipped", () => {
  for (const path of [
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/_vercel/insights/script.js",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/fonts/rubik.woff2",
    "/samples/thumbnail.svg",
  ]) {
    assert.ok(!runs(path), path);
  }
});

test("every file in public/ is skipped", () => {
  const root = join(process.cwd(), "public");
  const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  assert.ok(files.length > 0);
  for (const file of files) {
    const path = `/${relative(root, join(file.parentPath, file.name)).split(sep).join("/")}`;
    assert.ok(!runs(path), path);
  }
});
