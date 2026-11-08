import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LessonCta } from "@/components/catalog/LessonCta";
import { LessonPreviewCard } from "@/components/catalog/LessonPreviewCard";
import type { LessonEnding } from "@/components/LessonEndCard";
import { Player } from "@/components/Player";
import { TermList } from "@/components/TermList";
import { card } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { authMode } from "@/lib/authMode";
import { lessonSubtitles } from "@/lib/media";
import { canWatch } from "@/server/catalog/access";
import { glossaryRepo, lessonRepo, pathRepo, progressRepo } from "@/server/repos";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("player");
  const actor = await getPageActor(locale);
  const lesson = await lessonRepo.getById(lessonId, locale);
  if (!lesson) notFound();
  // Shows the preview instead of the player; the video itself is handed out by /api/play.
  if (!canWatch(actor, lesson)) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 pt-4 pb-10">
        <LessonPreviewCard title={lesson.title} teacher={lesson.teacher} durationSec={lesson.durationSec} free={lesson.access === "free"}>
          <LessonCta mode={authMode} lessonId={lesson.id} />
        </LessonPreviewCard>
      </main>
    );
  }
  const subtitles = lessonSubtitles(lesson);
  // Only with a player: the preview above needs none of this.
  const [startAt, terms, end] = await Promise.all([
    progressRepo.getPosition(actor.userId, lessonId),
    glossaryRepo.forLesson(lessonId, locale),
    pathRepo.getLessonEnd(actor.userId, lessonId, locale),
  ]);
  const ending: LessonEnding = !end
    ? { kind: "home" }
    : end.next
      ? {
          kind: "next",
          lessonId: end.next.lesson.id,
          title: end.next.lesson.title,
          newStep: end.next.newStep ? end.next.lesson.stepName : null,
        }
      : { kind: end.pathFinished ? "pathFinished" : "lastForNow" };

  return (
    <main id="main" className="mx-auto max-w-3xl pb-10 lg:px-12 lg:pt-4">
      {/* A new lesson gets a new player, so progress state never carries over. */}
      <Player
        key={lesson.id}
        lessonId={lesson.id}
        subtitles={subtitles}
        startAt={startAt}
        defaultSubtitle={subtitles.some((track) => track.locale === locale) ? locale : "off"}
        mode={authMode}
        backHref={end ? `/path/${end.stepId}` : "/"}
        ending={ending}
      >
        <div>
          <p className="text-sm font-medium text-green">
            {t("meta", { n: lesson.stepNumber, step: lesson.stepName, lesson: lesson.lessonNumber })}
          </p>
          <h1 className="mt-1 text-xl leading-snug font-medium lg:text-2xl">{lesson.title}</h1>
          <p className="mt-1 text-muted">{lesson.teacher}</p>
        </div>
      </Player>

      {terms.length > 0 && (
        <section className={`${card} mx-4 mt-4 px-4 pt-4 pb-1 lg:mx-0`}>
          <h2 className="text-lg font-medium">{t("words")}</h2>
          <TermList terms={terms} />
        </section>
      )}
    </main>
  );
}
