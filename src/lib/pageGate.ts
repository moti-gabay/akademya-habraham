// Which pages a visitor may open, decided from the address alone. Used by the proxy
// (src/proxy.ts); kept free of Next and Clerk so it can be unit-tested.

// Pages a signed-out visitor may open.
const PUBLIC_PAGES = new Set(["welcome", "sign-in", "sign-up", "holidays"]);
// The public catalog opens directly, so shared links and search engines reach it; every
// other page first sends a new visitor to choose a language and text size.
const NO_WELCOME = new Set(["welcome", "holidays"]);

// `pathname` starts with the locale ("/he/path/…"). `isSignedIn` is only called when the
// page is not public, so public pages never wait for a session check.
export async function pageGate(
  pathname: string,
  hasPrefs: boolean,
  isSignedIn: () => Promise<boolean> | boolean,
): Promise<"welcome" | "sign-in" | null> {
  const [, , page] = pathname.split("/");
  if (!hasPrefs && !NO_WELCOME.has(page)) return "welcome";
  if (!PUBLIC_PAGES.has(page) && !(await isSignedIn())) return "sign-in";
  return null;
}
