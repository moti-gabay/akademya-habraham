import { getLocale, getTranslations } from "next-intl/server";
import { ContinueCard } from "@/components/home/ContinueCard";
import { PathSteps } from "@/components/home/PathSteps";
import { GlossaryPreview, HelpCard, HolidayCard } from "@/components/home/SideCards";
import type { Locale } from "@/i18n/routing";
import { getCurrentUserId } from "@/server/auth";
import { glossaryRepo, holidayRepo, pathRepo, progressRepo, userRepo } from "@/server/repos";

export default async function HomePage() {
  const t = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const userId = await getCurrentUserId();
  const [user, continueWatching, steps, holiday, glossary] = await Promise.all([
    userRepo.getById(userId, locale),
    progressRepo.getContinueWatching(userId, locale),
    pathRepo.getSteps(userId, locale),
    holidayRepo.getNext(locale),
    glossaryRepo.list(locale, 3),
  ]);
  const lessonTerms = continueWatching ? await glossaryRepo.forLesson(continueWatching.lesson.id, locale) : [];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium lg:text-3xl">{t("greeting", { name: user?.name ?? "" })}</h1>
          <p className="mt-1 text-muted">{t("subtitle")}</p>
        </div>
        {continueWatching && <ContinueCard item={continueWatching} terms={lessonTerms} />}
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
