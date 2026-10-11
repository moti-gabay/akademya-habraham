// Dev helper: node scripts/shot.mjs <outDir> <name>=<path>@<width>[!nocookie] ...
import { chromium } from "@playwright/test";

const [outDir, ...targets] = process.argv.slice(2);
const browser = await chromium.launch();
for (const target of targets) {
  const [name, rest] = target.split("=");
  const fresh = rest.endsWith("!");
  const [path, width] = rest.replace("!", "").split("@");
  const context = await browser.newContext({ viewport: { width: Number(width), height: width > 800 ? 800 : 812 } });
  if (!fresh) await context.addCookies([{ name: "ah_text_size", value: "s", url: "http://localhost:3111" }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(name, "pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && console.log(name, "console", m.text()));
  await page.goto(`http://localhost:3111${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await context.close();
}
await browser.close();
