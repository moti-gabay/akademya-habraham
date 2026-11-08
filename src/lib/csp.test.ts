// pnpm test:unit — the security headers per mode. Every key and host here is fictional.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clerkFrontendApi, contentSecurityPolicy, securityHeaders } from "./csp";

const CLERK_KEY = `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`;
const policy = (env: Record<string, string> = {}, { clerk = false, dev = false } = {}) => contentSecurityPolicy({ env, clerk, dev });
// One directive's sources, by name.
const sources = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((directive) => directive.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

test("mock mode in production allows the app itself only", () => {
  assert.equal(
    policy(),
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
});

test("the dev server adds eval for React refresh and the hot-reload websocket, nothing else", () => {
  const dev = policy({}, { dev: true });
  assert.deepEqual(sources(dev, "script-src"), ["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
  assert.deepEqual(sources(dev, "connect-src"), ["'self'", "ws://localhost:*"]);
  assert.equal(dev.replace(" 'unsafe-eval'", "").replace(" ws://localhost:*", ""), policy());
});

test("Clerk mode allows its Frontend API, Turnstile and avatars, and no telemetry host", () => {
  const csp = policy({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK_KEY }, { clerk: true });
  assert.deepEqual(sources(csp, "script-src"), ["'self'", "'unsafe-inline'", "https://clerk.example.com", "https://challenges.cloudflare.com"]);
  assert.deepEqual(sources(csp, "connect-src"), ["'self'", "https://clerk.example.com"]);
  assert.deepEqual(sources(csp, "frame-src"), ["https://challenges.cloudflare.com"]);
  assert.deepEqual(sources(csp, "img-src"), ["'self'", "data:", "https://img.clerk.com"]);
  assert.doesNotMatch(csp, /telemetry/);
});

test("a Clerk key without Clerk mode adds nothing", () => {
  assert.equal(policy({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK_KEY }), policy());
});

test("Bunny adds its pull zone for playback and thumbnails, and its upload endpoint", () => {
  const csp = policy({ MEDIA_PROVIDER: "bunny", BUNNY_PULL_ZONE_HOST: "vz-example.b-cdn.example" });
  assert.deepEqual(sources(csp, "media-src"), ["'self'", "blob:", "https://vz-example.b-cdn.example"]);
  assert.deepEqual(sources(csp, "img-src"), ["'self'", "data:", "https://vz-example.b-cdn.example"]);
  assert.deepEqual(sources(csp, "connect-src"), ["'self'", "https://vz-example.b-cdn.example", "https://video.bunnycdn.com"]);
});

test("R2 adds its S3 host for presigned uploads", () => {
  const csp = policy({ FILE_STORAGE: "r2", R2_ACCOUNT_ID: "example-account" });
  assert.deepEqual(sources(csp, "connect-src"), ["'self'", "https://example-account.r2.cloudflarestorage.com"]);
});

test("media hosts count only when their service is selected, as in src/server/media", () => {
  assert.equal(policy({ BUNNY_PULL_ZONE_HOST: "vz-example.b-cdn.example", R2_ACCOUNT_ID: "example-account" }), policy());
});

test("an environment value that is not a plain host name cannot add sources or directives", () => {
  const csp = policy({ MEDIA_PROVIDER: "bunny", BUNNY_PULL_ZONE_HOST: "x.example; script-src *", FILE_STORAGE: "r2", R2_ACCOUNT_ID: "a b" });
  assert.deepEqual(sources(csp, "media-src"), ["'self'", "blob:"]);
  assert.deepEqual(sources(csp, "connect-src"), ["'self'", "https://video.bunnycdn.com"]);
  assert.equal(csp.split("; ").length, 13);
});

test("the Frontend API host is read from the publishable key, and a malformed key gives none", () => {
  assert.equal(clerkFrontendApi(CLERK_KEY), "clerk.example.com");
  assert.equal(clerkFrontendApi(`pk_live_${Buffer.from("clerk.example.com$").toString("base64")}`), "clerk.example.com");
  for (const key of [undefined, "", "sk_test_abc", "pk_test_", `pk_test_${Buffer.from("no-dollar.example").toString("base64")}`, `pk_test_${Buffer.from("bad host;$").toString("base64")}`]) {
    assert.equal(clerkFrontendApi(key), null, String(key));
  }
});

test("the policy is report-only unless CSP_MODE=enforce; the other headers are fixed", () => {
  const headers = (env: Record<string, string>) => Object.fromEntries(securityHeaders({ env, clerk: false, dev: false }).map((h) => [h.key, h.value]));
  const reportOnly = headers({});
  assert.equal(reportOnly["Content-Security-Policy-Report-Only"], policy());
  assert.equal(reportOnly["Content-Security-Policy"], undefined);
  assert.deepEqual(Object.keys(headers({ CSP_MODE: "enforce" }))[0], "Content-Security-Policy");
  assert.deepEqual(
    Object.entries(reportOnly).filter(([key]) => !key.startsWith("Content-Security-Policy")),
    [
      ["Strict-Transport-Security", "max-age=604800"],
      ["X-Content-Type-Options", "nosniff"],
      ["Referrer-Policy", "strict-origin-when-cross-origin"],
      ["X-Frame-Options", "DENY"],
      ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
      ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), picture-in-picture=(self)"],
    ],
  );
});
