import { Play } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/ProgressBar";
import { Timecode } from "@/components/Timecode";
import { TitleWithTerms } from "@/components/TitleWithTerms";
import { card, primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { ContinueWatching, GlossaryTerm } from "@/server/repos";

const chip = "w-fit rounded-full bg-green-tint px-3 py-1 text-sm font-medium text-green";

export async function ContinueCard({
  item,
  terms,
  thumbnailUrl,
}: {
  item: ContinueWatching;
  terms: GlossaryTerm[];
  // The lesson's image; without one the card keeps its plain placeholder.
  thumbnailUrl: string | null;
}) {
  const t = await getTranslations("home");
  const { lesson, positionSec } = item;
  const href = `/lessons/${lesson.id}`;
  const step = { n: lesson.stepNumber, step: lesson.stepName, lesson: lesson.lessonNumber, total: lesson.lessonsInStep };
  const tc = () => <Timecode seconds={positionSec} />;

  return (
    <section className={`${card} flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-6 lg:p-5`}>
      <p className={`${chip} lg:hidden`}>{t("stepChip", step)}</p>
      {/* Decorative: the button below is the one real link to the lesson. */}
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="grid aspect-[12/5] place-items-center rounded-xl bg-video bg-cover bg-center lg:aspect-[3/2] lg:w-1/2"
        style={thumbnailUrl ? { backgroundImage: `url("${encodeURI(thumbnailUrl)}")` } : undefined}
      >
        <span className="hidden size-14 place-items-center rounded-full bg-white/90 text-ink lg:grid">
          <Play className="size-5 fill-current" />
        </span>
      </Link>
      <div className="flex flex-col gap-3 lg:w-1/2">
        <p className={`${chip} hidden lg:block`}>{t("stepChipLesson", step)}</p>
        <h2 className="text-xl leading-snug font-medium lg:text-2xl">
          <TitleWithTerms title={lesson.title} terms={terms} />
        </h2>
        <p className="text-sm text-muted lg:hidden">{t.rich("lessonMeta", { ...step, tc })}</p>
        <p className="hidden text-muted lg:block">{t.rich("teacherMeta", { teacher: lesson.teacher, tc })}</p>
        <ProgressBar value={positionSec} max={lesson.durationSec} label={t("progress")} />
        <Link href={href} className={`${primaryBtn} mt-1 lg:w-fit lg:px-7`}>
          {/* Play is not a directional icon: it stays on the left, as in the sketch. */}
          <Play aria-hidden className="size-4 fill-current rtl:order-last" />
          {t("continueWatching")}
        </Link>
      </div>
    </section>
  );
}
