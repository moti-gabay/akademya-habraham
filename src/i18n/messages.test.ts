// pnpm test:unit — every language the site is served in has exactly the Hebrew message
// keys. ru/es are frozen content languages and are not checked until they are enabled.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SITE_LOCALES } from "../server/i18n/locales";

const keys = (value: object, prefix = ""): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
const messages = (locale: string) => JSON.parse(readFileSync(new URL(`./messages/${locale}.json`, import.meta.url), "utf8"));

test("every site language has exactly the Hebrew message keys", () => {
  const he = keys(messages("he")).sort();
  for (const locale of SITE_LOCALES) assert.deepEqual(keys(messages(locale)).sort(), he, locale);
});
