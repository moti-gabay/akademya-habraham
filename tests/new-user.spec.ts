import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A learner who has not watched anything yet (MOCK_USER=new, the fictional David), on a
// dev server of its own (port 3102).
const ORIGIN = "http://localhost:3102";

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}

// First, before any test opens a lesson: home's Start state, in both site languages and
// on both screen sizes. Same checks as the other screens in app.spec.ts.
for (const [device, viewport] of [
  ["mobile", { width: 375, height: 812 }],
  ["desktop", { width: 1280, height: 800 }],
] as const) {
  test.describe(device, () => {
    test.use({ viewport });
    for (const locale of ["he", "en"] as const) {
      test(`home Start (${locale}): accessible, fits at the largest text size, matches baseline`, async ({ page }) => {
        await withPrefs(page);
        await page.goto(`/${locale}`);
        await page.evaluate(() => document.fonts.ready);

        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

        // Local only, as in app.spec.ts; the next-holiday card follows the real calendar.
        if (!process.env.CI) {
          const nextHoliday = page.locator("section").filter({ hasText: /^(Next holiday|החג הקרוב) · / });
          await expect(nextHoliday).toHaveCount(1);
          await expect(page).toHaveScreenshot(`home-start-${locale}-${device}.png`, { fullPage: true, mask: [nextHoliday] });
        }

        await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test("a new learner's home has one Start card, for the first lesson of the path", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en");
  await expect(page.getByText("Welcome. Here is where to begin.")).toBeVisible();
  await expect(page.getByText("Your first lesson").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue watching" })).toHaveCount(0);
  const start = page.getByRole("link", { name: "Start the lesson" });
  await expect(start).toHaveCount(1);
  await start.click();
  // The dev server compiles the lesson page on its first visit, from cold.
  await expect(page).toHaveURL(/\/en\/lessons\/faith-1$/, { timeout: 60_000 });
});

test("home's Start reads in Hebrew, right to left", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("ברוכים הבאים. כאן מתחילים.")).toBeVisible();
  await expect(page.getByRole("link", { name: "להתחיל את השיעור" })).toHaveAttribute("href", "/he/lessons/faith-1");
});

test("a new learner opens the first step and starts its first lesson", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en/path");
  await page.getByRole("link", { name: /Foundations of faith/ }).click();
  await expect(page).toHaveURL(/\/en\/path\/faith$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Foundations of faith");
  await expect(page.getByText("0 of 8 lessons completed")).toBeVisible();

  const rows = page.getByRole("main").getByRole("listitem");
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: "Completed" })).toHaveCount(0);
  await expect(rows.first()).toContainText("Up next");

  await page.getByRole("link", { name: "Start: Foundations of faith · Lesson 1" }).click();
  await expect(page).toHaveURL(/\/en\/lessons\/faith-1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Foundations of faith · Lesson 1");
  await expect(page.getByRole("slider", { name: "Position in the lesson" })).not.toHaveAttribute("max", "0", { timeout: 60_000 });
});

test("the Start button reads in Hebrew, right to left", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/he/path/faith");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("link", { name: "להתחיל: יסודות האמונה · שיעור 1" })).toBeVisible();
});
