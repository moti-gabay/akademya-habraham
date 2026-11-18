// pnpm test:unit — a database failure is summarised without its message. Hosts and users are fictional.
import assert from "node:assert/strict";
import { test } from "node:test";
import { failureSummary } from "./failureSummary";

class NeonDbError extends Error {
  code = "28P01";
}

test("classes down the cause chain and the first code, no message", () => {
  const root = Object.assign(new Error("connect ECONNREFUSED db.example.com:5432"), { code: "ECONNREFUSED" });
  const error = new TypeError("fetch failed for postgres://moshe:pw@db.example.com/app", { cause: root });
  const summary = failureSummary(error);
  assert.deepEqual(summary, { classes: ["TypeError", "Error"], code: "ECONNREFUSED" });
  assert.doesNotMatch(JSON.stringify(summary), /example|moshe|pw|postgres/);
});

test("the outermost code wins", () => {
  assert.deepEqual(failureSummary(new NeonDbError("password authentication failed for user moshe")), {
    classes: ["NeonDbError"],
    code: "28P01",
  });
});

test("a code that is not code-shaped is dropped", () => {
  const error = Object.assign(new Error("x"), { code: "host db.example.com refused" });
  assert.deepEqual(failureSummary(error), { classes: ["Error"], code: null });
});

test("non-errors and long chains", () => {
  assert.deepEqual(failureSummary("postgres://db.example.com"), { classes: ["string"], code: null });
  assert.deepEqual(failureSummary(null), { classes: [], code: null });
  let deep: Error = new Error("0");
  for (let i = 0; i < 10; i++) deep = new Error(String(i), { cause: deep });
  assert.equal(failureSummary(deep).classes.length, 5);
});
