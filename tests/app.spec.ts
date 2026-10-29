import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["he", "en"] as const;
const LESSON = "shabbat-6";
const SKETCH_STOP_POINT = 12 * 60 + 40;

// Returning visitor: preferences already chosen, so no redirect to the welcome screen.
async function withPrefs(page: Page, size = "m") {
  await page.context().addCookies([{ name: "ah_text_size", value: size, url: "http://localhost:3100" }]);
}

// The radio inputs are visually hidden inside large labels, so tests click the label like a user.
const pick = (page: Page, name: string) =>
  page.locator("label").filter({ has: page.getByRole("radio", { name }) }).click();

const screens = [
  ["welcome", "/welcome"],
  ["home", ""],
  ["lesson", `/lessons/${LESSON}`],
  ["holidays", "/holidays"],
  ["holiday", "/holidays/hanukkah"],
  ["preview", "/holidays/hanukkah/hanukkah-intro"],
] as const;

test("first visit goes through language and text size, and remembers both", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/he\/welcome$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/welcome$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await pick(page, "Large");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "l");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.reload();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "l");
});

test("language switch stays on the same page and flips direction", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/he/glossary");
  await page.getByRole("button", { name: /עברית/ }).click();
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/glossary$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glossary");
});

test("timecodes stay left to right inside Hebrew text", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/he");
  const timecode = page.locator(".ltr-isolate").filter({ hasText: "12:40" }).first();
  await expect(timecode).toHaveCSS("direction", "ltr");
});

test("glossary term opens and closes with the keyboard", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en");
  const term = page.getByRole("button", { name: "Explain: 39 Melachot" });
  await term.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("The 39 kinds of work");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(term).toBeFocused();
});

// The page carries no video address: the player asks /api/play and gets the fake
// provider's local clip through a signed address. No network needed.
test("player controls work and the stop point reaches the home card", async ({ page, request }) => {
  await withPrefs(page);
  try {
    const clip = page.waitForResponse((response) => response.url().includes("/api/dev/media/play/") && response.status() === 200);
    await page.goto(`/en/lessons/${LESSON}`);
    expect(await page.content()).not.toContain(".m3u8");
    await clip;
    const timeline = page.getByRole("slider", { name: "Position in the lesson" });
    await expect(timeline).not.toHaveAttribute("max", "0", { timeout: 30_000 });
    await expect(page.getByLabel("Subtitles")).toHaveValue("en");

    await pick(page, "Fast");
    expect(await page.locator("video").evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(1.25);

    const forward = page.getByRole("button", { name: "10 seconds forward" });
    await forward.click();
    await forward.click();
    await forward.click();
    await page.getByRole("button", { name: "10 seconds back" }).click();
    await expect(timeline).toHaveValue("20");

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByText("You stopped at 0:20").filter({ visible: true })).toBeVisible();
  } finally {
    // Put the mock stop point back so later tests see the sketch state.
    // The API only accepts mutating calls from the app's own origin.
    await request.post("/api/telemetry/heartbeat", {
      headers: { origin: "http://localhost:3100" },
      data: { lessonId: LESSON, positionSec: SKETCH_STOP_POINT },
    });
  }
});

test("the holiday catalog opens without the welcome screen and shows previews, not the player", async ({ page }) => {
  // No preferences cookie: a shared link lands on the page itself.
  await page.goto("/en/holidays");
  await expect(page).toHaveURL(/\/en\/holidays$/);
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "m");
  // Shavuot has no published lesson, so it is not listed.
  await expect(page.getByRole("main").getByRole("link")).toHaveText([/Hanukkah.*Lessons: 2/, /Purim.*Lessons: 1/, /Pesach.*Lessons: 1/]);

  await page.getByRole("link", { name: /Hanukkah/ }).click();
  const lessons = page.getByRole("main").getByRole("listitem");
  await expect(lessons).toHaveCount(2);
  await expect(lessons.first()).toContainText("Free lesson");
  await expect(lessons.last()).not.toContainText("Free lesson");

  await lessons.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/en\/holidays\/hanukkah\/hanukkah-intro$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hanukkah: the miracle of the oil");
  await expect(page.getByRole("heading", { name: "In this lesson" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await expect(page.locator("video")).toHaveCount(0);
  // Without Clerk every visitor is the signed-in sample user, so the button leads to the lesson.
  await expect(page.getByRole("link", { name: "Watch the lesson" })).toHaveAttribute("href", "/en/lessons/hanukkah-intro");

  // Drafts and unknown addresses are not served.
  expect((await page.goto("/en/holidays/pesach/pesach-chametz"))?.status()).toBe(404);
  expect((await page.goto("/en/holidays/shavuot"))?.status()).toBe(404);
});

test("static pages take the text size from the cookie before they are shown", async ({ page }) => {
  await withPrefs(page, "l");
  await page.goto("/he/holidays");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "l");
  // The size control is in the language menu on a phone and has its own button on desktop.
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  await page.getByRole("button", { name: wide ? "גודל טקסט" : /עברית/ }).click();
  await expect(page.getByRole("radio", { name: "גדול" })).toBeChecked();
});

test("API rejects mutating calls from other origins", async ({ request }) => {
  const data = { lessonId: LESSON, positionSec: SKETCH_STOP_POINT };
  expect((await request.post("/api/telemetry/heartbeat", { data })).status()).toBe(403);
  const foreign = await request.post("/api/telemetry/heartbeat", { headers: { origin: "https://example.com" }, data });
  expect(foreign.status()).toBe(403);
  const own = await request.post("/api/telemetry/heartbeat", { headers: { origin: "http://localhost:3100" }, data });
  expect(own.status()).toBe(204);
});

test("a playable address comes only from /api/play, from our own origin, and expires", async ({ request }) => {
  const own = { origin: "http://localhost:3100" };
  expect((await request.post("/api/play", { data: { lessonId: LESSON } })).status()).toBe(403);
  expect((await request.post("/api/play", { headers: own, data: {} })).status()).toBe(400);
  expect((await request.post("/api/play", { headers: own, data: { lessonId: "no-such-lesson" } })).status()).toBe(404);
  const play = await request.post("/api/play", { headers: own, data: { lessonId: LESSON } });
  expect(play.status()).toBe(200);
  expect(play.headers()["cache-control"]).toBe("private, no-store");
  const { url, expiresAt } = await play.json();
  expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  expect(url).toMatch(/^\/api\/dev\/media\/play\/fake-sample-shabbat-6\/playlist\.m3u8\?expires=\d+&token=/);

  // The address plays: the playlist, and its segments carry the same token.
  const playlist = await request.get(url);
  expect([playlist.status(), playlist.headers()["content-type"], playlist.headers()["cache-control"]]).toEqual([
    200,
    "application/vnd.apple.mpegurl",
    "private, no-store",
  ]);
  const query = url.slice(url.indexOf("?"));
  const segments = (await playlist.text()).split("\n").filter((line) => line && !line.startsWith("#"));
  expect(segments.length).toBeGreaterThan(1);
  for (const line of segments) expect(line).toMatch(new RegExp(`^seg-\\d{2}\\.mpegts\\${query}$`));
  const segment = await request.get(url.replace(`playlist.m3u8${query}`, segments[0]));
  expect([segment.status(), segment.headers()["content-type"]]).toEqual([200, "video/mp2t"]);

  // A changed or expired token is refused, and nothing else is served from there.
  expect((await request.get(`${url}x`)).status()).toBe(403);
  expect((await request.get(url.replace(/expires=\d+/, "expires=1"))).status()).toBe(403);
  expect((await request.get(url.replace("playlist.m3u8", "README.md"))).status()).toBe(404);
});

test("without Clerk there is no sign-in, admin area or webhook", async ({ page, request }) => {
  await withPrefs(page);
  await page.goto("/he/sign-in");
  await expect(page).toHaveURL(/\/he$/);
  expect((await page.goto("/he/admin"))?.status()).toBe(404);
  expect((await request.post("/api/webhooks/clerk", { data: {} })).status()).toBe(404);
  // The Bunny webhook is reached with no session and no Origin (a 403 would mean the
  // same-origin check stopped it); without the Bunny provider it does not exist.
  expect((await request.post("/api/webhooks/bunny/any-secret", { data: { VideoGuid: "x", Status: 4 } })).status()).toBe(404);
  // The sample visitor is not an admin, and a production build ignores MOCK_ROLE.
  const own = { origin: "http://localhost:3100" };
  expect((await request.patch("/api/admin/users/x", { headers: own, data: { blocked: true } })).status()).toBe(404);
  expect((await request.post("/api/admin/catalog/teachers", { headers: own, data: {} })).status()).toBe(403);
  expect((await request.post("/api/admin/media/lessons/shabbat-6/video", { headers: own })).status()).toBe(403);
  expect((await request.put("/api/dev/media/video/fake-sample-shabbat-6", { headers: own, data: "x" })).status()).toBe(403);
  expect((await request.put("/api/dev/media/files/thumbnails/x.png", { headers: own, data: "x" })).status()).toBe(403);
  const health = await (await request.get("/api/healthz")).json();
  expect([health.dataSource, health.auth]).toEqual(["mock", "stub"]);
});

for (const locale of LOCALES) {
  for (const [name, path] of screens) {
    test(`${name} (${locale}): accessible, fits at the largest text size, matches baseline`, async ({ page }) => {
      await withPrefs(page);
      await page.goto(`/${locale}${path}`);
      await page.evaluate(() => document.fonts.ready);
      // The player's "loading" line is gone once the address has arrived.
      await page.locator("[aria-busy='true']").waitFor({ state: "detached" });

      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

      // Baselines are rendered locally; text antialiasing differs on the CI runner, so
      // the comparison is local only. The video frame comes from the network, so it is masked.
      if (!process.env.CI) {
        await expect(page).toHaveScreenshot(`${name}-${locale}.png`, { fullPage: true, mask: [page.locator("video")] });
      }

      await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
