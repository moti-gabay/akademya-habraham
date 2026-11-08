import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The card at the end of a lesson. These run on the screenshot server (port 3100), so
// nothing may be saved: the heartbeat is answered here and sendBeacon is a no-op, which
// leaves the sample user's progress untouched. The fake clip is 60 s long.
const HEARTBEAT = "**/api/telemetry/heartbeat";

async function openLesson(page: Page, path: string, heartbeat: "ok" | "fail" = "ok") {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: "http://localhost:3100" }]);
  await page.addInitScript(() => (navigator.sendBeacon = () => true));
  await page.route(HEARTBEAT, (route) => (heartbeat === "ok" ? route.fulfill({ status: 204 }) : route.abort()));
  await page.goto(path);
  await expect(page.getByRole("slider")).not.toHaveAttribute("max", "0", { timeout: 30_000 });
}

// Plays the last second, so the video ends as it would for a learner.
async function playToEnd(page: Page, before = 1) {
  await page.locator("video").evaluate((video: HTMLVideoElement, s) => (video.currentTime = video.duration - s), before);
  await page.getByRole("button", { name: /^(Play|הפעלה)$/ }).click();
}

const endCard = (page: Page) => page.locator("section[aria-labelledby='lesson-end-title']");

test("at the end of a lesson the card offers the next lesson of the step, with focus on it", async ({ page }) => {
  await openLesson(page, "/en/lessons/shabbat-6");
  await playToEnd(page);
  const next = page.getByRole("link", { name: "Next lesson: Shabbat · Lesson 7" });
  await expect(next).toBeFocused();
  await expect(next).toHaveAccessibleDescription("Lesson finished");
  await expect(endCard(page).getByRole("heading", { level: 2 })).toHaveText("Lesson finished");
  await expect(endCard(page).getByRole("button", { name: "Watch again" })).toBeVisible();

  const axe = await new AxeBuilder({ page }).include("section[aria-labelledby='lesson-end-title']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

  await next.click();
  await expect(page).toHaveURL(/\/en\/lessons\/shabbat-7$/);
});

test("the last lesson of a step leads to the first lesson of the next step", async ({ page }) => {
  await openLesson(page, "/en/lessons/faith-8");
  await playToEnd(page);
  await expect(endCard(page)).toContainText("A new step begins: Shabbat");
  await page.getByRole("link", { name: "Next lesson: Shabbat · Lesson 1" }).click();
  await expect(page).toHaveURL(/\/en\/lessons\/shabbat-1$/);
});

test("the last lesson of the path, with lessons still open, leads back to the path", async ({ page }) => {
  await openLesson(page, "/en/lessons/holidays-9");
  await playToEnd(page);
  await expect(endCard(page)).toContainText("This is the last available lesson for now.");
  const toPath = page.getByRole("link", { name: "Back to my path" });
  await expect(toPath).toBeFocused();
  await toPath.click();
  await expect(page).toHaveURL(/\/en\/path$/);
});

test("Watch again hides the card and plays from the start", async ({ page }) => {
  await openLesson(page, "/en/lessons/shabbat-6");
  await playToEnd(page);
  await page.getByRole("button", { name: "Watch again" }).click();
  await expect(endCard(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
  expect(await page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeLessThan(5);
});

test("the card shows even when the save at the end fails", async ({ page }) => {
  await openLesson(page, "/en/lessons/shabbat-6", "fail");
  await playToEnd(page);
  await expect(page.getByRole("link", { name: "Next lesson: Shabbat · Lesson 7" })).toBeFocused();
});

test("a second ended event shows no second card and leaves focus where the learner put it", async ({ page }) => {
  await openLesson(page, "/en/lessons/shabbat-6");
  await playToEnd(page);
  await expect(endCard(page)).toHaveCount(1);
  const back = page.getByRole("button", { name: "Back", exact: true });
  await back.focus();
  await page.locator("video").evaluate((video: HTMLVideoElement) => video.dispatchEvent(new Event("ended")));
  await expect(endCard(page)).toHaveCount(1);
  await expect(back).toBeFocused();
});

test("a video in fullscreen leaves fullscreen when it ends, so the card can be seen", async ({ page }) => {
  await openLesson(page, "/en/lessons/shabbat-6");
  // The Play click is real input, so the page may enter fullscreen right after it.
  await playToEnd(page, 4);
  await page.locator("video").evaluate((video: HTMLVideoElement) => video.requestFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName ?? null)).toBe("VIDEO");
  await expect(page.getByRole("link", { name: "Next lesson: Shabbat · Lesson 7" })).toBeFocused({ timeout: 10_000 });
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test("on a phone the card's main button is on screen without scrolling, and nothing overflows at the largest text size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout only");
  await openLesson(page, "/en/lessons/shabbat-6");
  await page.evaluate(() => window.scrollTo(0, 0));
  await playToEnd(page);
  const next = page.getByRole("link", { name: "Next lesson: Shabbat · Lesson 7" });
  await expect(next).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = (await next.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(812);

  await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const cardOverflow = await endCard(page).evaluate((card) => card.scrollWidth - card.clientWidth);
  expect(cardOverflow).toBeLessThanOrEqual(0);
});

for (const locale of ["he", "en"] as const) {
  test(`lesson end card (${locale}): accessible, fits at the largest text size, matches baseline`, async ({ page }) => {
    await openLesson(page, `/${locale}/lessons/shabbat-6`);
    await playToEnd(page);
    await expect(endCard(page)).toBeVisible();
    if (locale === "he") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("link", { name: "לשיעור הבא: שבת · שיעור 7" })).toBeFocused();
    }
    await page.evaluate(() => document.fonts.ready);

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

    // Local only, as the other baselines; the video frame is masked.
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot(`lesson-end-${locale}.png`, { fullPage: true, mask: [page.locator("video")] });
    }

    await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
