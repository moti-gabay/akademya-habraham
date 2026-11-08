// Security headers for every route, sent from next.config.ts headers(). Pure, so each
// mode can be unit-tested. One Content-Security-Policy for all routes, with
// 'unsafe-inline' scripts and no nonce: a nonce would need every page rendered per
// request, and the holiday catalog is static (ISR). See ARCHITECTURE.md, "Security headers".

type Env = Record<string, string | undefined>;
type Options = {
  env: Env;
  // Real sign-in (src/lib/authMode.ts); Clerk's hosts are allowed only then.
  clerk: boolean;
  // `next dev`: React refresh needs eval, and hot reload a websocket.
  dev: boolean;
};

// A host name only: anything else would let an environment value add a directive.
const HOST = /^[a-z0-9.-]+$/i;
const https = (host: string | undefined) => (host && HOST.test(host) ? [`https://${host}`] : []);

// Clerk's Frontend API host is inside the publishable key: pk_test_ or pk_live_, then
// base64 of "<host>$".
export function clerkFrontendApi(publishableKey: string | undefined): string | null {
  const encoded = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey ?? "")?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const host = decoded.endsWith("$") ? decoded.slice(0, -1) : "";
  return HOST.test(host) ? host : null;
}

const TURNSTILE = "https://challenges.cloudflare.com";

export function contentSecurityPolicy({ env, clerk, dev }: Options): string {
  // The same opt-in rule as src/server/media/index.ts: only these values select the real services.
  const bunny = env.MEDIA_PROVIDER === "bunny";
  const pullZone = bunny ? https(env.BUNNY_PULL_ZONE_HOST) : [];
  const tus = bunny ? ["https://video.bunnycdn.com"] : [];
  const r2 = env.FILE_STORAGE === "r2" ? https(env.R2_ACCOUNT_ID && `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`) : [];
  const clerkApi = clerk ? https(clerkFrontendApi(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ?? undefined) : [];

  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...clerkApi, ...(clerk ? [TURNSTILE] : [])],
    // React style attributes (progress bars, thumbnails) and Clerk's injected styles.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", ...pullZone, ...(clerk ? ["https://img.clerk.com"] : [])],
    // blob: is hls.js playing through Media Source; the pull zone is native HLS (iOS).
    ["media-src", "'self'", "blob:", ...pullZone],
    ["connect-src", "'self'", ...(dev ? ["ws://localhost:*"] : []), ...pullZone, ...tus, ...r2, ...clerkApi],
    // next/font serves Rubik from the app itself.
    ["font-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
    ["frame-src", ...(clerk ? [TURNSTILE] : ["'none'"])],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

// HSTS for a week while the production domain is not final; see ARCHITECTURE.md for raising it.
export const HSTS = "max-age=604800";

export function securityHeaders(options: Options): { key: string; value: string }[] {
  // Report-only until Clerk, Bunny and R2 have been checked for real (launch checklist).
  const enforce = options.env.CSP_MODE === "enforce";
  return [
    { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
    { key: "Strict-Transport-Security", value: HSTS },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), picture-in-picture=(self)",
    },
  ];
}
