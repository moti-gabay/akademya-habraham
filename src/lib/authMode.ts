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
