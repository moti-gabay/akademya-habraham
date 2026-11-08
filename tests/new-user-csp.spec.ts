import { expect, test } from "@playwright/test";
import { watchCsp } from "./cspViolations";

// Home's Start state under the report-only policy, on the new-learner dev server (port 3102).
test("a new learner's home and step run with no policy violation", async ({ page }) => {
  const csp = await watchCsp(page);
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: "http://localhost:3102" }]);
  for (const path of ["/he", "/en", "/en/path/faith"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await csp.flush();
  }
  await expect(page.getByRole("link", { name: /^Start:/ })).toBeVisible();
  expect(await csp.flush()).toEqual([]);
});
