// Fails when a physical-direction Tailwind class is used. RTL and LTR share one
// stylesheet, so only logical classes (ms-, pe-, start-, text-start…) are allowed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PHYSICAL =
  /(?<![\w-])-?(?:(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|rounded-[lr]|rounded-[tb][lr]|border-[lr])-[\w[./]+|(?:text|float|clear)-(?:left|right)|border-[lr]|rounded-[lr])(?![\w-])/g;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) yield path;
  }
}

let failed = false;
for (const file of walk("src")) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const match of line.matchAll(PHYSICAL)) {
        failed = true;
        console.error(`${file}:${i + 1}  physical class "${match[0]}"`);
      }
    });
}
process.exit(failed ? 1 : 0);
