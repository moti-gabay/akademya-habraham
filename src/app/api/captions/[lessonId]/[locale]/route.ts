import { getActor } from "@/lib/auth";
import { getFileStorage } from "@/server/media";
import { captionKey } from "@/server/media/service";
import { canWatch } from "@/server/catalog/access";
import { LOCALES, type Locale } from "@/server/i18n/locales";
import { lessonRepo } from "@/server/repos";

const missing = () => new Response(null, { status: 404 });

// A lesson's caption file for one language, for the player's <track>. Captions are
// served here and never from a public bucket, so the same check as for the lesson
// applies. That check is UI-level for now; enforcement comes with /api/play (Milestone 4).
export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string; locale: string }> }) {
  const { lessonId, locale } = await params;
  if (!LOCALES.includes(locale as Locale)) return missing();
  const actor = await getActor().catch(() => null);
  const lesson = await lessonRepo.getById(lessonId, locale as Locale);
  if (!lesson || !canWatch(actor, lesson) || !lesson.captions.includes(locale as Locale)) return missing();
  const file = await getFileStorage().get(captionKey(lessonId, locale as Locale));
  if (!file) return missing();
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
