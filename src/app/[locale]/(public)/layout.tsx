import { setRequestLocale } from "next-intl/server";
import { BottomNav } from "@/components/MainNav";
import { PublicHeader } from "@/components/PublicHeader";
import type { Locale } from "@/i18n/routing";

// Pages anyone can open without signing in: the holiday catalog. Nothing here reads the
// request (no cookies, no session), so the pages are rendered once per locale and
// refreshed when the catalog changes.
export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale as Locale);
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-2 pb-28 lg:px-12 lg:pt-8 lg:pb-12">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
