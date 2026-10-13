import { getTranslations } from "next-intl/server";
import { card } from "../ui";

// What a visitor sees of a lesson without the player: what it is about, and the way in.
export async function LessonPreviewCard({
  title,
  teacher,
  durationSec,
  free,
  description,
  keyPoints = [],
  children,
}: {
  title: string;
  teacher: string;
  durationSec: number;
  free: boolean;
  description?: string;
  keyPoints?: string[];
  // The call to action.
  children: React.ReactNode;
}) {
  const t = await getTranslations("catalog");
  return (
    <article className={`${card} p-5 lg:p-8`}>
      {free && <p className="mb-2 inline-block rounded-full bg-cream px-3 py-1 text-sm font-medium text-gold">{t("free")}</p>}
      <h1 className="text-2xl leading-snug font-medium lg:text-3xl">{title}</h1>
      <p className="mt-1 text-muted">{t("lessonMeta", { teacher, minutes: Math.round(durationSec / 60) })}</p>
      {description && <p className="mt-4">{description}</p>}
      {keyPoints.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-medium">{t("keyPoints")}</h2>
          <ul className="mt-2 list-disc space-y-1 ps-6">
            {keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-6">{children}</div>
    </article>
  );
}
