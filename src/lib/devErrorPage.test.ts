// pnpm test:unit — the test-only page that fails on purpose (/[locale]/dev/error) can
// only fail where the fake media routes are on: never on Vercel or with a real service.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import DevErrorPage from "@/app/[locale]/(app)/dev/error/page";

const NAMES = ["VERCEL", "MEDIA_PROVIDER", "FILE_STORAGE"] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const render = (env: Partial<Record<(typeof NAMES)[number], string>>) => {
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, env);
  return DevErrorPage({ searchParams: Promise.resolve({}) });
};
// next/navigation's notFound() throws an error carrying this digest.
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

for (const [name, env] of [
  ["on Vercel", { VERCEL: "1" }],
  ["with Bunny as the video service", { MEDIA_PROVIDER: "bunny" }],
  ["with R2 as the file storage", { FILE_STORAGE: "r2" }],
] as const) {
  test(`the page is a 404 ${name}, and never fails on purpose`, async () => {
    await assert.rejects(render(env), (error: Error & { digest?: string }) => {
      assert.equal(error.digest, NOT_FOUND);
      assert.notEqual(error.message, "dev-error-sentinel");
      return true;
    });
  });
}

test("locally with the fakes, the page fails on purpose", async () => {
  await assert.rejects(render({}), { message: "dev-error-sentinel" });
});
