// pnpm test:unit — which pages need the welcome screen or a session (the proxy's page check).
import assert from "node:assert/strict";
import { test } from "node:test";
import { pageGate } from "./pageGate";

const STEP = "/path/5a3b1c2d-1111-4000-8000-000000000001";
const signedIn = () => true;
const signedOut = () => false;

test("a step page needs a session, in every site language and for any step id", async () => {
  for (const locale of ["he", "en"]) {
    for (const path of [STEP, "/path/shabbat", "/path/not-a-step", "/path"]) {
      assert.equal(await pageGate(`/${locale}${path}`, true, signedOut), "sign-in", `${locale}${path}`);
      assert.equal(await pageGate(`/${locale}${path}`, true, signedIn), null, `${locale}${path}`);
    }
  }
});

test("a first visit goes to the welcome screen before anything else, step pages included", async () => {
  assert.equal(await pageGate(`/he${STEP}`, false, signedOut), "welcome");
  assert.equal(await pageGate(`/en${STEP}`, false, signedIn), "welcome");
  assert.equal(await pageGate("/en", false, signedIn), "welcome");
});

test("the public catalog opens signed out and without the welcome screen", async () => {
  for (const path of ["/he/holidays", "/en/holidays/hanukkah", "/he/holidays/hanukkah/hanukkah-intro"]) {
    assert.equal(await pageGate(path, false, signedOut), null, path);
  }
});

test("welcome, sign-in and sign-up never send to sign-in", async () => {
  for (const page of ["welcome", "sign-in", "sign-up"]) {
    assert.equal(await pageGate(`/en/${page}`, true, signedOut), null, page);
  }
  assert.equal(await pageGate("/he/welcome", false, signedOut), null);
});

test("the session is only checked for pages that need one, as the proxy did before", async () => {
  let calls = 0;
  const counting = () => {
    calls++;
    return false;
  };
  await pageGate("/en/holidays", true, counting);
  await pageGate("/en/welcome", true, counting);
  await pageGate(`/en${STEP}`, false, counting); // welcome first, no session check
  assert.equal(calls, 0);
  await pageGate(`/en${STEP}`, true, counting);
  assert.equal(calls, 1);
});
