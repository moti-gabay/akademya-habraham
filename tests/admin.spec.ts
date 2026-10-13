import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Runs on the dev server, where MOCK_ROLE=admin makes the sample visitor an admin.
const ORIGIN = "http://localhost:3101";
const own = { origin: ORIGIN };

test("the catalog API takes changes only from our own pages, and validates them", async ({ request }) => {
  const teacher = { translations: { he: { name: "הרב בדיקה" } } };
  expect((await request.post("/api/admin/catalog/teachers", { data: teacher })).status()).toBe(403);
  expect((await request.post("/api/admin/catalog/teachers", { headers: own, data: {} })).status()).toBe(400);
  expect((await request.post("/api/admin/catalog/nothing", { headers: own, data: teacher })).status()).toBe(404);
  expect((await request.post("/api/admin/catalog/teachers/x/publish", { headers: own })).status()).toBe(404);

  const created = await request.post("/api/admin/catalog/teachers", { headers: own, data: teacher });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  expect((await request.delete(`/api/admin/catalog/teachers/${id}`, { headers: own })).status()).toBe(200);
  expect((await request.delete(`/api/admin/catalog/teachers/${id}`, { headers: own })).status()).toBe(404);
});

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}

test("a teacher is created in Hebrew, translated, and deleted", async ({ page }) => {
  await withPrefs(page);
  const name = `הרב בדיקה ${Date.now()}`;
  await page.goto("/en/admin/teachers");
  await page.getByRole("link", { name: "New teacher" }).click();

  // Hebrew is required.
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Not saved. Check the marked fields.");
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/teachers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // The tabs follow the keyboard, and a language without a translation says so.
  await page.getByRole("tab", { name: /עברית/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "English: not translated" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Readers of this language see the Hebrew text.")).toBeVisible();
  await page.getByRole("button", { name: "Add a translation" }).click();
  await page.getByLabel("Name").fill("Rav Test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rav Test");

  await page.goto("/en/admin/teachers");
  const row = page.getByRole("listitem").filter({ hasText: "Rav Test" });
  await expect(row.getByText("English: translated")).toBeAttached();
  await expect(row.getByText("Русский: not translated")).toBeAttached();

  await row.getByRole("link", { name: "Rav Test" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/teachers$/);
  await expect(page.getByText("Rav Test")).toHaveCount(0);
});

test("deleting a teacher who still has lessons is refused with an explanation", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en/admin/teachers");
  await page.getByRole("link", { name: "Rav Avraham" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Move or unpublish them first.");
});

test("a lesson appears on the public holiday page when published and leaves it when unpublished", async ({ page }) => {
  await withPrefs(page);
  const slug = `megillah-reading-${Date.now()}`;
  const title = `קריאת המגילה ${slug}`;
  const listed = async () => {
    await page.goto("/he/holidays/purim");
    return page.getByRole("link", { name: title }).count();
  };

  await page.goto("/he/admin/lessons/new");
  await page.getByLabel("קטגוריה").selectOption({ label: "פורים" });
  await page.getByLabel("מי יכול לצפות").selectOption("free");
  await page.getByLabel("כותרת").fill(title);
  await page.getByLabel("תיאור קצר").fill("מתי קוראים ואיך מקשיבים");
  await page.getByLabel("נקודות עיקריות").fill("קוראים פעמיים\nבלילה וביום");
  await page.getByLabel("שם בכתובת").fill(slug);
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(page).toHaveURL(/\/he\/admin\/lessons\/[0-9a-f-]{36}$/);
  const editUrl = page.url();
  await expect(page.getByText("מצב: טיוטה")).toBeVisible();

  // A draft is not public.
  expect(await listed()).toBe(0);

  await page.goto(editUrl);
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText("מצב: מפורסם")).toBeVisible();
  // The cached page is refreshed in the background, so the first visit may still be the old one.
  await expect.poll(listed).toBe(1);

  // Only Hebrew exists, so the English preview shows the Hebrew text.
  await page.goto(`/en/holidays/purim/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText("Free lesson")).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText(["קוראים פעמיים", "בלילה וביום"]);

  // A published lesson cannot be deleted; unpublished, it leaves the public page and can be.
  await page.goto(editUrl);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("אפשר למחוק רק טיוטות");
  await page.getByRole("button", { name: "ביטול פרסום" }).click();
  await expect(page.getByText("מצב: טיוטה")).toBeVisible();
  await expect.poll(listed).toBe(0);

  await page.goto(editUrl);
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page).toHaveURL(/\/he\/admin\/lessons$/);
});

for (const locale of ["he", "en"] as const) {
  for (const [name, path] of [
    ["overview", ""],
    ["lessons", "/lessons"],
    ["lesson", "/lessons/hanukkah-intro"],
    ["path", "/tracks/learning-path"],
    ["step", "/tracks/learning-path/steps/shabbat"],
    ["new category", "/categories/new"],
  ] as const) {
    test(`admin ${name} (${locale}): accessible, and fits a phone at the largest text size`, async ({ page }) => {
      await withPrefs(page);
      await page.goto(`/${locale}/admin${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
