import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { watchCsp } from "./cspViolations";

// The error page (src/app/[locale]/error.tsx) on the production build (port 3100), made
// to appear by the test-only /dev/error page, which exists only with the fake services.
const ORIGIN = "http://localhost:3100";
const TEXT = {
  he: { title: "משהו השתבש", retry: "לנסות שוב", home: "חזרה לדף הבית", reference: /^מספר לבירור: \S+$/ },
  en: { title: "Something went wrong", retry: "Try again", home: "Back to the home page", reference: /^Reference: \S+$/ },
};

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}
const reference = (page: Page) => page.getByText(/^(Reference|מספר לבירור): /);

test("a server error shows plain words, a reference for support, and nothing technical", async ({ page }) => {
  await withPrefs(page);
  const response = await page.goto("/en/dev/error");
  expect(response?.status()).toBe(500);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(TEXT.en.title);
  await expect(heading).toBeFocused();
  await expect(reference(page)).toHaveText(TEXT.en.reference);

  const html = await page.content();
  const text = await page.locator("body").innerText();
  for (const leak of ["dev-error-sentinel", ".tsx", "node_modules", "    at "]) {
    expect(html, leak).not.toContain(leak);
  }
  expect(text).not.toMatch(/Server Components|digest|stack|Error:/i);
});

test("an error in the browser shows the same page without a reference", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en/dev/error?client=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT.en.title);
  await expect(reference(page)).toHaveCount(0);
});

test("Try again fetches the page again once, even when clicked twice, and recovers", async ({ page }) => {
  await withPrefs(page);
  await page.goto(`/en/dev/error?once=${Date.now()}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT.en.title);
  // The refresh asks the server for the page again as an RSC request.
  const refreshes: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["rsc"] && new URL(request.url()).pathname === "/en/dev/error") refreshes.push(request.url());
  });
  await page.getByRole("button", { name: TEXT.en.retry }).dblclick();
  await expect(page.locator("[data-dev-error='recovered']")).toBeAttached();
  await expect(page.getByRole("heading", { name: TEXT.en.title })).toHaveCount(0);
  expect(refreshes).toHaveLength(1);
});

test("the way home keeps the visitor's language", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/he/dev/error");
  await page.getByRole("link", { name: TEXT.he.home }).click();
  await expect(page).toHaveURL(/\/he$/);
});

test("a missing page still gets the 404 page, not the error page", async ({ page }) => {
  await withPrefs(page);
  for (const path of ["/en/path/no-such-step", "/en/lessons/no-such-lesson"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByText(TEXT.en.title)).toHaveCount(0);
  }
});

for (const locale of ["he", "en"] as const) {
  test(`error page (${locale}): accessible, no policy violation, fits at the largest text size, matches baseline`, async ({ page }) => {
    const csp = await watchCsp(page);
    await withPrefs(page);
    await page.goto(`/${locale}/dev/error`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT[locale].title);
    await expect(page.getByRole("button", { name: TEXT[locale].retry })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
    await page.evaluate(() => document.fonts.ready);

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

    // Local only, as the other baselines. The reference may change from build to build.
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot(`error-${locale}.png`, { fullPage: true, mask: [reference(page)] });
    }

    await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await csp.flush()).toEqual([]);
  });
}
