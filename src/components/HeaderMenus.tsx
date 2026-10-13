"use client";

import * as Popover from "@radix-ui/react-popover";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { localeNames, type Locale } from "@/i18n/routing";
import { LanguageList } from "./LanguageList";
import { TextSizeControl } from "./TextSizeControl";
import { outlineBtn, popover } from "./ui";

// On mobile the header has room for one button, so text size lives in this menu too.
export function LanguageMenu() {
  const t = useTranslations("prefs");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={`${outlineBtn} bg-card px-4`} aria-label={`${t("language")}: ${localeNames[locale]}`}>
        <Globe aria-hidden className="size-5" />
        {localeNames[locale]}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className={popover}>
          <h2 id="language-menu-title" className="mb-2 font-medium">
            {t("chooseLanguage")}
          </h2>
          <LanguageList labelledBy="language-menu-title" onNavigate={() => setOpen(false)} />
          <div className="mt-4 lg:hidden">
            <TextSizeControl legend={t("textSize")} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TextSizeMenu() {
  const t = useTranslations("prefs");
  return (
    <Popover.Root>
      <Popover.Trigger className={`${outlineBtn} bg-card px-4`} aria-label={t("textSize")}>
        <span aria-hidden className="text-xs">
          {t("sizeLetter")}
        </span>
        <span aria-hidden className="text-lg">
          {t("sizeLetter")}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className={popover}>
          <TextSizeControl legend={t("textSize")} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
