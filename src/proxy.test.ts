// pnpm test:unit — which addresses the proxy runs on, compiled the way Next compiles the matcher.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
// Next's own matcher compiler, so the test cannot disagree with the build.
import * as staticInfo from "next/dist/build/analysis/get-page-static-info";
import { config } from "./proxy";

// Cast: the function is exported at runtime but missing from Next's type declarations.
const { getMiddlewareMatchers } = staticInfo as unknown as {
  getMiddlewareMatchers?: (matchers: string[], nextConfig: object) => { regexp: string }[];
};
// After a Next upgrade that moves or renames it, fail the whole file rather than test nothing.
if (typeof getMiddlewareMatchers !== "function") {
  throw new Error("next/dist/build/analysis/get-page-static-info no longer exports getMiddlewareMatchers: update src/proxy.test.ts.");
}
const matchers = getMiddlewareMatchers(config.matcher, {});
const runs = (path: string) => matchers.some((matcher) => new RegExp(matcher.regexp).test(path));

test("pages and API routes run through the proxy, dots included", () => {
  for (const path of [
    "/",
    "/he",
    "/en/path",
    "/he/holidays/purim",
    "/he/holidays/purim/lesson.v2",
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
