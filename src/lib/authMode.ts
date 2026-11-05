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
  return localStandIn(env, mode, "MOCK_ROLE") && env.MOCK_ROLE === "admin" ? "admin" : null;
}

// Local stand-in for a learner who has not watched anything yet (the fictional sample
// user David), so the first-run screens can be used and tested. Same conditions as
// MOCK_ROLE; never widen them.
export function resolveMockUser(env: Record<string, string | undefined>, mode: typeof authMode): "new" | null {
  return localStandIn(env, mode, "MOCK_USER") && env.MOCK_USER === "new" ? "new" : null;
}

function localStandIn(env: Record<string, string | undefined>, mode: typeof authMode, name: string): boolean {
  if (!env[name]) return false;
  if (mode === "clerk") {
    console.warn(`${name} is ignored while Clerk sign-in is active.`);
    return false;
  }
  return env.DATA_SOURCE !== "db" && !env.VERCEL && env.NODE_ENV !== "production";
}

export const mockRole = resolveMockRole(process.env, authMode);
export const mockUser = resolveMockUser(process.env, authMode);
