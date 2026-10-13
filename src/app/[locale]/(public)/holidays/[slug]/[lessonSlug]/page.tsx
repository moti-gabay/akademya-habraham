import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LessonCta } from "@/components/catalog/LessonCta";
import { LessonPreviewCard } from "@/components/catalog/LessonPreviewCard";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { authMode } from "@/lib/authMode";
import { getLessonPreview } from "@/lib/catalogCache";
import { safeStaticParams } from "@/lib/staticParams";
import { listPublicParams } from "@/server/catalog/public";
import { catalogRepo } from "@/server/repos";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return safeStaticParams("holidays/[slug]/[lessonSlug]", () => listPublicParams(catalogRepo));
}

// Preview of one lesson: what it is about and a button to watch. No player here; the
// lesson itself is at /lessons/[lessonId] for signed-in visitors.
export default async function LessonPreviewPage({ params }: { params: Promise<{ locale: string; slug: string; lessonSlug: string }> }) {
  const raw = await params;
  const locale = raw.locale as Locale;
  setRequestLocale(locale);
  const [slug, lessonSlug] = [decodeURIComponent(raw.slug), decodeURIComponent(raw.lessonSlug)];
  const preview = await getLessonPreview(slug, lessonSlug, locale);
  if (!preview) notFound();
  const { category, lesson } = preview;
  // The address used another language's names (after a language switch).
  if (category.slug !== slug || lesson.slug !== lessonSlug) {
    redirect({ href: `/holidays/${category.slug}/${lesson.slug}`, locale });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/holidays/${category.slug}`} className="tap mb-2 inline-flex items-center font-medium text-green underline">
        {category.name}
      </Link>
      <LessonPreviewCard
        title={lesson.title}
        teacher={lesson.teacher}
        durationSec={lesson.durationSec}
        free={lesson.access === "free"}
        description={lesson.description}
        keyPoints={lesson.keyPoints}
      >
        <LessonCta mode={authMode} lessonId={lesson.id} />
      </LessonPreviewCard>
    </div>
  );
}
