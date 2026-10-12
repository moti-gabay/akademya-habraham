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

// Needs network: the sample video is a public HLS test stream until Bunny is wired in.
test("player controls work and the stop point reaches the home card", async ({ page, request }) => {
  await withPrefs(page);
  try {
    await page.goto(`/en/lessons/${LESSON}`);
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
    await request.post("/api/telemetry/heartbeat", { data: { lessonId: LESSON, positionSec: SKETCH_STOP_POINT } });
  }
});

for (const locale of LOCALES) {
  for (const [name, path] of screens) {
    test(`${name} (${locale}): accessible, fits at the largest text size, matches baseline`, async ({ page }) => {
      await withPrefs(page);
      await page.goto(`/${locale}${path}`);
      await page.evaluate(() => document.fonts.ready);

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
