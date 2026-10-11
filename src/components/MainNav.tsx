"use client";

import { CircleHelp, Flag, House, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const hrefs = {
  home: "/",
  path: "/path",
  search: "/search",
  holidays: "/holidays",
  glossary: "/glossary",
  help: "/help",
} as const;

const topItems = ["home", "path", "holidays", "glossary", "help"] as const;
const bottomItems = [
  ["home", House],
  ["path", Flag],
  ["search", Search],
  ["help", CircleHelp],
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function TopNav() {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="hidden items-center gap-1 lg:flex">
      {topItems.map((item) => {
        const active = isActive(hrefs[item]);
        return (
          <Link
            key={item}
            href={hrefs[item]}
            aria-current={active ? "page" : undefined}
            className={`tap inline-flex items-center rounded-full px-4 font-medium ${
              active ? "bg-green-tint text-green" : "hover:bg-ink/5"
            }`}
          >
            {t(item)}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {bottomItems.map(([item, Icon]) => {
          const active = isActive(hrefs[item]);
          return (
            <li key={item}>
              <Link
                href={hrefs[item]}
                aria-current={active ? "page" : undefined}
                className={`tap flex flex-col items-center gap-0.5 py-2 text-sm font-medium ${active ? "text-green" : ""}`}
              >
                <span className={`rounded-full px-4 py-1 ${active ? "bg-green-tint" : ""}`}>
                  <Icon aria-hidden className="size-6" />
                </span>
                {t(item)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
