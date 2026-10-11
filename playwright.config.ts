import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests",
  // The mock repos keep progress in server memory, so tests share state: run them in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // A Hebrew browser, so the first visit lands on the default locale.
  use: { baseURL: `http://localhost:${PORT}`, browserName: "chromium", locale: "he-IL" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
