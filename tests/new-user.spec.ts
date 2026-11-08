import { expect, test, type Page } from "@playwright/test";

// A learner who has not watched anything yet (MOCK_USER=new, the fictional David), on a
// dev server of its own (port 3102).
const ORIGIN = "http://localhost:3102";

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}

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
