import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { StepLessons } from "@/components/path/StepLessons";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { pathRepo } from "@/server/repos";

// One step of the learner's path. Per user, so rendered on every request (no static
// params). An unknown id, or a step with nothing published yet, is a 404.
export default async function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  const locale = (await getLocale()) as Locale;
  const { userId } = await getPageActor(locale);
  const step = await pathRepo.getStep(userId, stepId, locale);
  if (!step) notFound();
  return <StepLessons step={step} />;
}
