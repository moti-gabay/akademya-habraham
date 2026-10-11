import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { TEXT_SIZE_COOKIE } from "./lib/prefs";

const intl = createMiddleware(routing);

function handle(request: NextRequest) {
  const response = intl(request);
  if (response.headers.has("location")) return response;

  // First visit: no preferences yet, so show the language and text size screen.
  const [, locale, page] = request.nextUrl.pathname.split("/");
  if (!request.cookies.has(TEXT_SIZE_COOKIE) && page !== "welcome") {
    return NextResponse.redirect(new URL(`/${locale}/welcome`, request.url));
  }
  return response;
}

// Clerk is wired in only when keys exist, so the app runs on mock data without them.
export default process.env.CLERK_SECRET_KEY ? clerkMiddleware((_auth, request) => handle(request)) : handle;

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
