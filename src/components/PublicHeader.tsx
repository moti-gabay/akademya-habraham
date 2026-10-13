import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageMenu, TextSizeMenu } from "./HeaderMenus";
import { TopNav } from "./MainNav";

// Header of the public catalog pages. Unlike Header it knows nothing about the visitor,
// so the pages under it can be rendered once and served to everyone.
export async function PublicHeader() {
  const t = await getTranslations();
  return (
    <header className="lg:border-b lg:border-line lg:bg-card">
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
        </div>
      </div>
    </header>
  );
}
