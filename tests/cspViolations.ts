import type { Page } from "@playwright/test";

declare global {
  interface Window {
    cspViolations: string[];
  }
}

// Records Content-Security-Policy violations on every page the test opens. The policy is
// report-only, so nothing is blocked; the browser still fires securitypolicyviolation and
// logs "Refused to ...". Call flush() before leaving a page and at the end.
export async function watchCsp(page: Page) {
  const seen: string[] = [];
  page.on("console", (message) => {
    if (/Refused to/.test(message.text())) seen.push(`console: ${message.text().slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI} on ${location.pathname}`),
    );
  });
  return {
    seen,
    async flush() {
      seen.push(...(await page.evaluate(() => window.cspViolations.splice(0)).catch(() => [])));
      return seen;
    },
  };
}
