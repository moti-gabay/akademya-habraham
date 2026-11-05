import { Check, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/ProgressBar";
import { Timecode } from "@/components/Timecode";
import { card, outlineBtn, primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { StepDetail, StepLesson } from "@/server/repos";

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

// A step of the path: how far the learner is, one clear action, and its published lessons.
export async function StepLessons({ step }: { step: StepDetail }) {
  const t = await getTranslations("pathStep");
  const next = step.lessons.find((lesson) => lesson.isNext);
  const finished = step.lessonsTotal > 0 && step.lessonsDone === step.lessonsTotal;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/path" className="tap -ms-1 inline-flex items-center gap-1 font-medium text-green">
        <ChevronLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>

      <p className="mt-2 text-sm font-medium text-green">{t("stepLabel", { n: step.number })}</p>
      <h1 className="text-2xl font-medium lg:text-3xl">{step.name}</h1>
      <p className="mt-1 mb-2 text-muted">{t("doneCount", { done: step.lessonsDone, total: step.lessonsTotal })}</p>
      <ProgressBar value={step.lessonsDone} max={step.lessonsTotal} label={t("progress")} />

      {next && (
        <Link href={`/lessons/${next.id}`} className={`${primaryBtn} mt-5 w-full text-lg`}>
          {/* Play is not a directional icon: it stays on the left, as in the sketch. */}
          <Play aria-hidden className="size-4 shrink-0 fill-current rtl:order-last" />
          <span>{t(next.state === "in_progress" ? "continue" : "start", { title: next.title })}</span>
        </Link>
      )}
      {finished && (
        <div className={`${card} mt-5 flex flex-col gap-3 p-5`}>
          <p className="flex items-center gap-2 text-lg font-medium">
            <Check aria-hidden className="size-5 text-green" strokeWidth={3} />
            {t("stepDone")}
          </p>
          {step.nextStep ? (
            <Link href={`/path/${step.nextStep.id}`} className={primaryBtn}>
              {t("nextStep", { step: step.nextStep.name })}
            </Link>
          ) : (
            <Link href="/path" className={outlineBtn}>
              {t("back")}
            </Link>
          )}
        </div>
      )}

      <ol className={`${card} mt-6 divide-y divide-line px-3`}>
        {step.lessons.map((lesson) => (
          <li key={lesson.id} className="py-1">
            <LessonRow lesson={lesson} />
          </li>
        ))}
      </ol>
    </div>
  );
}

async function LessonRow({ lesson }: { lesson: StepLesson }) {
  const t = await getTranslations("pathStep");
  const done = lesson.state === "done";
  const status = done ? (
    t("completed")
  ) : lesson.state === "in_progress" ? (
    t.rich("stoppedAt", { tc: () => <Timecode seconds={lesson.positionSec} /> })
  ) : !lesson.ready ? (
    t("notReady")
  ) : lesson.isNext ? (
    t("upNext")
  ) : null;

  const content = (
    <>
      <span
        aria-hidden
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          done ? "bg-green text-white" : lesson.isNext ? "border-2 border-green font-bold text-green" : "border border-muted/60 text-muted"
        }`}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : lesson.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{t("lessonNumber", { n: lesson.number })}: </span>
        <span className={`block ${lesson.isNext ? "font-semibold" : "font-medium"}`}>{lesson.title}</span>
        <span className="block text-sm text-muted">
          {t("minutes", { minutes: minutes(lesson.durationSec) })}
          {status && <> · {status}</>}
          {lesson.isNext && lesson.state === "in_progress" && <> · {t("upNext")}</>}
        </span>
      </span>
    </>
  );

  const row = `flex items-center gap-3 rounded-xl px-2 py-2 ${lesson.isNext ? "ring-2 ring-green" : ""}`;
  // A lesson whose video is still being prepared is shown, but leads nowhere yet.
  if (!lesson.ready) return <div className={`${row} min-h-12`}>{content}</div>;
  return (
    <Link href={`/lessons/${lesson.id}`} className={`tap ${row} hover:bg-green-tint/50`}>
      {content}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted rtl:-scale-x-100" />
    </Link>
  );
}
