"use client";

import { Check } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { dirOf, localeNames, routing } from "@/i18n/routing";

// Each language is a link to the same page in that locale.
export function LanguageList({ labelledBy, onNavigate }: { labelledBy: string; onNavigate?: () => void }) {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <ul aria-labelledby={labelledBy} className="grid gap-2">
      {routing.locales.map((l) => {
        const current = l === locale;
        return (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              replace
              scroll={false}
              lang={l}
              dir={dirOf(l)}
              aria-current={current ? "true" : undefined}
              onClick={onNavigate}
              className={`tap flex items-center justify-between rounded-xl border-2 px-4 text-lg font-medium ${
                current ? "border-green bg-green-tint" : "border-line bg-card hover:bg-green-tint/50"
              }`}
            >
              {localeNames[l]}
              {current && (
                <span className="grid size-6 place-items-center rounded-full bg-green text-white">
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
