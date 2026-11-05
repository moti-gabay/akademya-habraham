// pnpm test:unit — which language values the site accepts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCALES, SITE_LOCALES, siteLocaleOf } from "./locales";

test("the site is served in Hebrew and English; ru/es stay content languages", () => {
  assert.deepEqual(SITE_LOCALES, ["he", "en"]);
  assert.deepEqual(LOCALES, ["he", "en", "ru", "es"]);
});

test("a cookie or stored value in a language that is not served falls back instead of being used", () => {
  assert.equal(siteLocaleOf("he"), "he");
  assert.equal(siteLocaleOf("en"), "en");
  for (const value of ["ru", "es", "fr", "", null, undefined]) assert.equal(siteLocaleOf(value), undefined, String(value));
});
