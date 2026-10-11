import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Player } from "@/components/Player";
import { TermList } from "@/components/TermList";
import { card } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { getCurrentUserId } from "@/server/auth";
import { glossaryRepo, lessonRepo, progressRepo } from "@/server/repos";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("player");
  const lesson = await lessonRepo.getById(lessonId, locale);
  if (!lesson) notFound();
  const [startAt, terms] = await Promise.all([
    progressRepo.getPosition(await getCurrentUserId(), lessonId),
    glossaryRepo.forLesson(lessonId, locale),
  ]);

  return (
    <main id="main" className="mx-auto max-w-3xl pb-10 lg:px-12 lg:pt-4">
      <Player
        lessonId={lesson.id}
        src={lesson.videoUrl}
        subtitles={lesson.subtitles}
        startAt={startAt}
        defaultSubtitle={locale}
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
