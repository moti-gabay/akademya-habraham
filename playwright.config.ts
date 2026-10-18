import { defineConfig } from "@playwright/test";

const PORT = 3100;
// The admin screens are tested on a dev server: the local admin stand-in (MOCK_ROLE) is
// ignored in production builds by design.
const ADMIN_PORT = 3101;
// e2e always runs on mock data and the fake media services, and never opens the database
// or a real media account, even when a local .env selects one (Next keeps a variable that
// is already set, even to ""). The fake "encoding" is kept short.
const env = { DATA_SOURCE: "mock", DATABASE_URL: "", MEDIA_PROVIDER: "", FILE_STORAGE: "", FAKE_MEDIA_PROCESSING_MS: "500" };

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
    { name: "mobile", testIgnore: /admin/, use: { viewport: { width: 375, height: 812 } } },
    { name: "desktop", testIgnore: /admin/, use: { viewport: { width: 1280, height: 800 } } },
    {
      name: "admin",
      testMatch: /admin/,
      // The dev server compiles each page and route on its first visit, from cold on every
      // run (its output directory is emptied at start); on a slow or loaded disk that alone
      // can use up the default 30 s.
      timeout: 90_000,
      use: { baseURL: `http://localhost:${ADMIN_PORT}`, viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/healthz`,
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Always from an empty output directory: a dev cache left by an earlier, interrupted
      // run sends every page a "HMR hash mismatch" and the pages reload in a loop.
      command: `rm -rf .next-e2e-dev && pnpm dev -p ${ADMIN_PORT}`,
      url: `http://localhost:${ADMIN_PORT}/api/healthz`,
      // Its own output directory: sharing .next with the production build made the two
      // overwrite each other's files, and the dev server's pages reloaded in a loop.
      env: { ...env, MOCK_ROLE: "admin", NEXT_DIST_DIR: ".next-e2e-dev" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
