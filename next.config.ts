import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // The e2e dev server gets its own output directory, so it and a production build
  // never write over each other.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withNextIntl(nextConfig);
