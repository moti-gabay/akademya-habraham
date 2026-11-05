import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { authMode } from "./lib/authMode";
import { pageGate } from "./lib/pageGate";
import { TEXT_SIZE_COOKIE } from "./lib/prefs";

const intl = createMiddleware(routing);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF: a mutating API call must come from our own pages. Webhooks are exempt; they
// are verified by signature instead.
function handleApi(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || request.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }
  const sameOrigin =
    request.headers.get("sec-fetch-site") === "same-origin" || request.headers.get("origin") === request.nextUrl.origin;
  return sameOrigin ? NextResponse.next() : NextResponse.json({ error: "cross_origin" }, { status: 403 });
}

async function handle(request: NextRequest, isSignedIn: () => Promise<boolean>) {
  if (request.nextUrl.pathname.startsWith("/api/")) return handleApi(request);

  const response = intl(request);
  if (response.headers.has("location")) return response;

  // First visit (no preferences yet): the language and text size screen. Pages other
  // than the public ones need a session.
  const [, locale] = request.nextUrl.pathname.split("/");
  const gate = await pageGate(request.nextUrl.pathname, request.cookies.has(TEXT_SIZE_COOKIE), isSignedIn);
  return gate ? NextResponse.redirect(new URL(`/${locale}/${gate}`, request.url)) : response;
}

// Without Clerk (mock mode, CI) every visitor is the sample user, so nobody is signed out.
export default authMode === "clerk"
  ? clerkMiddleware((auth, request) => handle(request, async () => Boolean((await auth()).userId)))
  : (request: NextRequest) => handle(request, async () => true);

export const config = { matcher: ["/((?!_next|_vercel|.*\\..*).*)"] };
