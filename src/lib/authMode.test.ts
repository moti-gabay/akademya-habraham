// pnpm test:unit — the local admin stand-in can never be switched on where it matters.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { resolveMockRole, resolveMockUser } from "./authMode";

test("MOCK_ROLE=admin works only on mock data, with stub sign-in, off Vercel, outside production", () => {
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "development" }, "stub"), "admin");
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "test" }, "stub"), "admin");
  assert.equal(resolveMockRole({ NODE_ENV: "development" }, "stub"), null);
  assert.equal(resolveMockRole({ MOCK_ROLE: "editor", NODE_ENV: "development" }, "stub"), null);
});

test("MOCK_ROLE is ignored on the database, even without Clerk keys", () => {
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "development", DATA_SOURCE: "db" }, "stub"), null);
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "development", DATA_SOURCE: "mock" }, "stub"), "admin");
});

test("MOCK_ROLE is ignored on Vercel", () => {
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "development", VERCEL: "1" }, "stub"), null);
});

test("MOCK_ROLE is ignored in a production build", () => {
  assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "production" }, "stub"), null);
});

test("MOCK_ROLE is ignored, with a warning, while Clerk is active", () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.equal(resolveMockRole({ MOCK_ROLE: "admin", NODE_ENV: "development" }, "clerk"), null);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /MOCK_ROLE is ignored/);
    assert.equal(resolveMockRole({ NODE_ENV: "development" }, "clerk"), null);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    warn.mock.restore();
  }
});

test("MOCK_USER=new works only under the same conditions as MOCK_ROLE", () => {
  assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "development" }, "stub"), "new");
  assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "test" }, "stub"), "new");
  assert.equal(resolveMockUser({ NODE_ENV: "development" }, "stub"), null);
  assert.equal(resolveMockUser({ MOCK_USER: "admin", NODE_ENV: "development" }, "stub"), null);
  assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "development", DATA_SOURCE: "db" }, "stub"), null);
  assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "development", VERCEL: "1" }, "stub"), null);
  assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "production" }, "stub"), null);
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.equal(resolveMockUser({ MOCK_USER: "new", NODE_ENV: "development" }, "clerk"), null);
    assert.match(String(warn.mock.calls[0].arguments[0]), /MOCK_USER is ignored/);
  } finally {
    warn.mock.restore();
  }
});
