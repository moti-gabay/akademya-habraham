// pnpm test:unit — a catalog that cannot be read must not break the build.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { safeStaticParams } from "./staticParams";

const unreachable = async () => {
  throw new Error("connect failed: postgresql://user:secret@db.example.com/main");
};

test("params are passed through when the catalog can be read", async () => {
  assert.deepEqual(await safeStaticParams("page", async () => [{ slug: "purim" }]), [{ slug: "purim" }]);
});

test("a failure gives no params and a warning without the connection string", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.deepEqual(await safeStaticParams("page", unreachable), []);
    const [message] = warn.mock.calls[0].arguments;
    assert.match(message, /page: not prerendered/);
    assert.doesNotMatch(message, /secret|db\.example\.com/);
  } finally {
    warn.mock.restore();
  }
});

test("STRICT_STATIC_PARAMS=1 fails instead", async () => {
  process.env.STRICT_STATIC_PARAMS = "1";
  try {
    await assert.rejects(safeStaticParams("page", unreachable), /connect failed/);
  } finally {
    delete process.env.STRICT_STATIC_PARAMS;
  }
});
