"use client";

import * as Popover from "@radix-ui/react-popover";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GlossaryTerm } from "@/server/repos";
import { popover } from "./ui";

// A glossary word inside running text: dotted underline + "?", opens a short explanation.
export function Term({ term, children }: { term: GlossaryTerm; children: React.ReactNode }) {
  const t = useTranslations();
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t("term.explain", { term: term.term })}
        className="-my-2 inline cursor-help rounded py-2 text-start underline decoration-green decoration-dotted decoration-2 underline-offset-4"
      >
        {children}
        <span
          aria-hidden
          className="ms-1 inline-grid size-[1.1em] place-items-center rounded-full bg-green align-super text-[0.55em] font-bold text-white no-underline"
        >
          ?
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={16} className={`${popover} text-base font-normal`}>
          <p className="font-medium">{term.term}</p>
          <p className="mt-1 text-muted">{term.definition}</p>
          <div className="mt-2 flex items-center justify-between">
            <Link href="/glossary" className="tap inline-flex items-center font-medium text-green">
              {t("home.allTerms")}
            </Link>
            <Popover.Close className="tap rounded-full px-3 font-medium hover:bg-ink/5">{t("term.close")}</Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
