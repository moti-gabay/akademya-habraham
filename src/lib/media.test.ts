// pnpm test:unit — the fake media routes exist only where nothing real can be reached.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeMediaActive, fakeRoutesEnabled } from "./media";

test("the fake's own routes are on only with both fakes and off Vercel", () => {
  assert.equal(fakeRoutesEnabled({}), true);
  assert.equal(fakeRoutesEnabled({ VERCEL: "1" }), false);
  assert.equal(fakeRoutesEnabled({ MEDIA_PROVIDER: "bunny" }), false);
  assert.equal(fakeRoutesEnabled({ FILE_STORAGE: "r2" }), false);
  // The banner in the admin follows the adapters, on Vercel too.
  assert.equal(fakeMediaActive({ VERCEL: "1" }), true);
  assert.equal(fakeMediaActive({ MEDIA_PROVIDER: "bunny", FILE_STORAGE: "r2" }), false);
});
