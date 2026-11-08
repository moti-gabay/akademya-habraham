import { expect, test, type Page } from "@playwright/test";
import { watchCsp } from "./cspViolations";

// The security headers (src/lib/csp.ts), on the production build (port 3100). The
// lesson is played with the heartbeat answered here, so the sample state is not changed.
const ORIGIN = "http://localhost:3100";
const STATIC_HEADERS = {
  "strict-transport-security": "max-age=604800",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), picture-in-picture=(self)",
};

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}

function expectSecurityHeaders(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(STATIC_HEADERS)) expect(headers[name], name).toBe(value);
  // Report-only for now: nothing is enforced until the real services have been checked.
  const policy = headers["content-security-policy-report-only"];
  expect(policy).toContain("script-src 'self' 'unsafe-inline'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("unsafe-eval");
  expect(headers["content-security-policy"]).toBeUndefined();
  expect(headers["x-powered-by"]).toBeUndefined();
}

test("pages, a pre-rendered page, the API and static files carry the security headers", async ({ page, request }) => {
  await withPrefs(page);
  for (const path of ["/he", "/he/holidays/hanukkah", "/en/lessons/shabbat-6"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expectSecurityHeaders(response!.headers());
  }
  // The holiday page really is the pre-rendered one.
  expect((await request.get("/he/holidays/hanukkah")).headers()["x-nextjs-cache"]).toMatch(/HIT|STALE|PRERENDER/);

  expectSecurityHeaders((await request.get("/api/healthz")).headers());
  const script = await page.locator("script[src^='/_next/static/']").first().getAttribute("src");
  const file = await request.get(script!);
  expect(file.status()).toBe(200);
  expectSecurityHeaders(file.headers());
});

test("the learner's screens run with no policy violation", async ({ page }) => {
  const csp = await watchCsp(page);
  // First visit: the language and text size screen.
  await page.goto("/he");
  await expect(page).toHaveURL(/\/he\/welcome$/);
  await csp.flush();

  await withPrefs(page);
  for (const path of ["/he", "/en", "/en/path", "/en/path/shabbat", "/en/glossary", "/en/help", "/en/holidays", "/he/holidays/hanukkah", "/en/holidays/hanukkah/hanukkah-intro", "/en/no-such-page"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await csp.flush();
  }

  // A lesson played to its end through hls.js and the fake video service.
  await page.addInitScript(() => (navigator.sendBeacon = () => true));
  await page.route("**/api/telemetry/heartbeat", (route) => route.fulfill({ status: 204 }));
  await page.goto("/en/lessons/shabbat-6");
  await expect(page.getByRole("slider")).not.toHaveAttribute("max", "0", { timeout: 30_000 });
  await page.locator("video").evaluate((video: HTMLVideoElement) => (video.currentTime = video.duration - 1));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Next lesson:/ })).toBeVisible();
  expect(await csp.flush()).toEqual([]);
});
