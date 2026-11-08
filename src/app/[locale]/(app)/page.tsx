import { getLocale, getTranslations } from "next-intl/server";
import { ContinueCard } from "@/components/home/ContinueCard";
import { HomeNotice } from "@/components/home/HomeNotice";
import { PathSteps } from "@/components/home/PathSteps";
import { GlossaryPreview, HelpCard, HolidayCard } from "@/components/home/SideCards";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { lessonThumbnailUrl } from "@/lib/media";
import { homeState } from "@/server/catalog/path";
import { glossaryRepo, holidayRepo, pathRepo, progressRepo, userRepo } from "@/server/repos";

export default async function HomePage() {
  const t = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const { userId } = await getPageActor(locale);
  const [user, continueWatching, steps, holiday, glossary] = await Promise.all([
    userRepo.getById(userId, locale),
    progressRepo.getContinueWatching(userId, locale),
    pathRepo.getSteps(userId, locale),
    holidayRepo.getNext(locale),
    glossaryRepo.list(locale, 3),
  ]);
  const state = await homeState(steps, continueWatching, () => pathRepo.getStartLesson(userId, locale));
  const lesson = state.kind === "continue" ? state.item.lesson : state.kind === "start" ? state.lesson : null;
  const lessonTerms = lesson ? await glossaryRepo.forLesson(lesson.id, locale) : [];
  const subtitle =
    state.kind === "finished"
      ? "subtitleFinished"
      : state.kind === "empty"
        ? "subtitleEmpty"
        : state.kind === "start" && state.first
          ? "subtitleNew"
          : "subtitle";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium lg:text-3xl">{t("greeting", { name: user?.name ?? "" })}</h1>
          <p className="mt-1 text-muted">{t(subtitle)}</p>
        </div>
        {state.kind === "continue" && (
          <ContinueCard item={state.item} terms={lessonTerms} thumbnailUrl={lessonThumbnailUrl(state.item.lesson)} />
        )}
        {state.kind === "start" && (
          <ContinueCard
            item={{ lesson: state.lesson, first: state.first }}
            terms={lessonTerms}
            thumbnailUrl={lessonThumbnailUrl(state.lesson)}
          />
        )}
        {(state.kind === "finished" || state.kind === "empty") && <HomeNotice kind={state.kind} />}
        <PathSteps steps={steps} />
      </div>
      <aside className="mt-6 space-y-4 lg:mt-0">
        {holiday && <HolidayCard holiday={holiday} />}
        <GlossaryPreview terms={glossary} className="hidden lg:block" />
        <HelpCard className="hidden lg:block" />
      </aside>
    </div>
  );
}
