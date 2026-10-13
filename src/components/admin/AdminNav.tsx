"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const items = [
  ["overview", "/admin"],
  ["lessons", "/admin/lessons"],
  ["categories", "/admin/categories"],
  ["teachers", "/admin/teachers"],
  ["glossary", "/admin/glossary"],
  ["tracks", "/admin/tracks"],
] as const;

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="mb-6 flex flex-wrap gap-1">
      {items.map(([item, href]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={item}
            href={href}
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
