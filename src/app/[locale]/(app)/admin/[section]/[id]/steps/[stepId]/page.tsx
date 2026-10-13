import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/EntityForm";
import { OrderedList } from "@/components/admin/OrderedList";
import { RecordActions } from "@/components/admin/RecordActions";
import type { Locale } from "@/i18n/routing";
import { labelOf } from "@/lib/adminCatalog";
import { requireAdminPage } from "@/lib/auth";
import { adminCatalogRepo as repo } from "@/server/repos";

// Create ("new") or edit one step of a learning path, and choose its lessons.
export default async function AdminStepPage({ params }: { params: Promise<{ section: string; id: string; stepId: string }> }) {
  const { section, id: trackId, stepId } = await params;
  if (section !== "tracks") notFound();
  const locale = (await getLocale()) as Locale;
  await requireAdminPage(locale);
  const t = await getTranslations("admin");
  const track = await repo.get("tracks", trackId);
  if (!track) notFound();
  const trackHref = `/admin/tracks/${trackId}`;
  const stepsHref = `${trackHref}/steps`;

  if (stepId === "new") {
    return (
      <>
        <h1 className="mb-6 text-2xl font-medium lg:text-3xl">
          {labelOf(track, locale)}: {t("sections.steps.new")}
        </h1>
        <EntityForm entity="steps" initial={{ trackId, translations: { he: {} } }} listHref={trackHref} editHref={stepsHref} />
      </>
    );
  }

  const step = await repo.get("steps", stepId);
  if (!step || step.trackId !== trackId) notFound();
  const name = labelOf(step, locale);
  const lessons = (await repo.list("lessons")).map((lesson) => ({ id: lesson.id, label: labelOf(lesson, locale) }));
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-medium lg:text-3xl">
        {labelOf(track, locale)}: {name}
      </h1>
      <RecordActions entity="steps" id={stepId} name={name} listHref={trackHref} />
      <EntityForm entity="steps" id={stepId} initial={step} listHref={trackHref} editHref={stepsHref} />
      <OrderedList
        title={t("links.lessons")}
        path={`steps/${stepId}/lessons`}
        options={lessons}
        initial={await repo.getLinks("stepLessons", stepId)}
      />
    </div>
  );
}
