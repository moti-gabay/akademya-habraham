// Runs once, after the web servers answer /api/healthz. The dev server (port 3101) compiles a
// route on its first visit, so a time-limited step that reaches a route first pays for the
// compile. These are the routes the tests that failed on a loaded machine reach that way
// (admin.spec.ts:236, progress.spec.ts:104 and :136), not a crawl. Measured on an idle
// machine: /he/holidays/purim 2.3 s cold in the full run; /en and /en/path/prayer are cold
// when the progress project runs alone.
const ORIGIN = "http://localhost:3101";
const ROUTES = ["/he/holidays/purim", "/en", "/en/path/prayer"];

export default async function globalSetup() {
  for (const route of ROUTES) {
    // The text-size cookie skips the first-visit redirect, as the tests' withPrefs does.
    const response = await fetch(`${ORIGIN}${route}`, { headers: { cookie: "ah_text_size=m" }, redirect: "manual" });
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error(`Warm-up of ${route} answered ${response.status}.`);
  }
}
