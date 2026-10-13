import { UserButton } from "@clerk/nextjs";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { authMode } from "@/lib/authMode";
import { userRepo } from "@/server/repos";
import { LanguageMenu, TextSizeMenu } from "./HeaderMenus";
import { TopNav } from "./MainNav";

export async function Header({ className = "" }: { className?: string }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const user = await userRepo.getById((await getPageActor(locale)).userId, locale);
  return (
    <header className={`lg:border-b lg:border-line lg:bg-card ${className}`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-card px-5 py-3 font-medium focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {t("common.skipToContent")}
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 lg:px-12 lg:py-3">
        <Link href="/" className="tap inline-flex items-center text-lg leading-tight font-semibold text-green lg:me-3 lg:text-xl">
          {t("brand")}
        </Link>
        <TopNav />
        <div className="ms-auto flex items-center gap-2">
          <div className="hidden lg:block">
            <TextSizeMenu />
          </div>
          <LanguageMenu />
          {authMode === "clerk" ? (
            <div className="hidden size-12 place-items-center lg:grid">
              <UserButton appearance={{ elements: { avatarBox: { width: "3rem", height: "3rem" } } }} />
            </div>
          ) : (
            user && (
              <span
                role="img"
                aria-label={t("prefs.account", { name: user.name })}
                className="hidden size-12 place-items-center rounded-full bg-green font-medium text-white lg:grid"
              >
                {user.name.charAt(0)}
              </span>
            )
          )}
        </div>
      </div>
    </header>
  );
}
