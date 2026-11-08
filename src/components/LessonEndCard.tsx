"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { card, outlineBtn, primaryBtn } from "./ui";

// What the end of a lesson offers, decided on the server (pathRepo.getLessonEnd).
export type LessonEnding =
  // newStep: the name of the step the next lesson begins, or null within the same step.
  | { kind: "next"; lessonId: string; title: string; newStep: string | null }
  | { kind: "pathFinished" | "lastForNow" | "home" };

// Shown under the video once it has ended. Never moves on by itself.
export function LessonEndCard({ ending, onAgain }: { ending: LessonEnding; onAgain: () => void }) {
  const t = useTranslations();
  const primary = useRef<HTMLAnchorElement>(null);
  // Mounted only when the video has just ended: the one moment focus moves here.
  useEffect(() => primary.current?.focus(), []);

  const heading = ending.kind === "pathFinished" ? t("home.finishedTitle") : t("player.end.done");
  const text =
    ending.kind === "next" && ending.newStep
      ? t("player.end.newStep", { step: ending.newStep })
      : ending.kind === "lastForNow"
        ? t("player.end.lastForNow")
        : null;
  const [href, label] =
    ending.kind === "next"
      ? [`/lessons/${ending.lessonId}`, t("player.end.next", { title: ending.title })]
      : ending.kind === "home"
        ? ["/", t("player.end.toHome")]
        : ["/path", t("player.end.toPath")];

  return (
    <section aria-labelledby="lesson-end-title" className={`${card} flex flex-col gap-3 p-4 lg:p-5`}>
      <h2 id="lesson-end-title" className="text-xl leading-snug font-medium lg:text-2xl">
        {heading}
      </h2>
      {text && <p className="text-muted">{text}</p>}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <Link ref={primary} href={href} aria-describedby="lesson-end-title" className={`${primaryBtn} py-2 text-center`}>
          {label}
        </Link>
        <button type="button" onClick={onAgain} className={outlineBtn}>
          <RotateCcw aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("player.end.again")}
        </button>
      </div>
    </section>
  );
}
