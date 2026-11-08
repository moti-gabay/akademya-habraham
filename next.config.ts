import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { authMode } from "./src/lib/authMode";
import { securityHeaders } from "./src/lib/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function config(phase: string): NextConfig {
  const headers = securityHeaders({ env: process.env, clerk: authMode === "clerk", dev: phase === PHASE_DEVELOPMENT_SERVER });
  return withNextIntl({
    devIndicators: false,
    poweredByHeader: false,
    // The e2e dev server gets its own output directory, so it and a production build
    // never write over each other.
    distDir: process.env.NEXT_DIST_DIR || ".next",
    // Every route, static files and pre-rendered pages included.
    headers: async () => [{ source: "/:path*", headers }],
  });
}
