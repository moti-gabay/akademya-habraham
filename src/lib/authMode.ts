// How requests are authenticated. Derived from the environment only, so the proxy can
// read it too.
//   "clerk": real sign-in. Needs both Clerk keys and DATA_SOURCE=db (the users mirror).
//   "stub":  every visitor is the sample user. This is mock mode, CI, and local
//            database work without keys.
const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const usesDatabase = process.env.DATA_SOURCE === "db";

// Fail closed on a public deployment: a database without sign-in would let anyone
// write the sample user's data.
if (usesDatabase && !hasClerkKeys && process.env.VERCEL) {
  throw new Error("DATA_SOURCE=db on Vercel requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
}

export const authMode: "clerk" | "stub" = usesDatabase && hasClerkKeys ? "clerk" : "stub";

// Local stand-in for an admin, so the admin screens can be used and tested with no keys.
// Honoured only on mock data, with stub sign-in, off Vercel and outside production
// builds; anywhere else it is ignored, so it can never write to a database. The sample
// actor then counts as an admin with a second factor.
export function resolveMockRole(env: Record<string, string | undefined>, mode: typeof authMode): "admin" | null {
  if (!env.MOCK_ROLE) return null;
  if (mode === "clerk") {
    console.warn("MOCK_ROLE is ignored while Clerk sign-in is active.");
    return null;
  }
  const local = env.DATA_SOURCE !== "db" && !env.VERCEL && env.NODE_ENV !== "production";
  return env.MOCK_ROLE === "admin" && local ? "admin" : null;
}

export const mockRole = resolveMockRole(process.env, authMode);
