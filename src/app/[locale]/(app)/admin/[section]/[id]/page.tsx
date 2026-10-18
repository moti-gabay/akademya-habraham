import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EntityForm, type EntityFormRecord } from "@/components/admin/EntityForm";
import { LessonMediaPanel } from "@/components/admin/LessonMediaPanel";
import { OrderedList } from "@/components/admin/OrderedList";
import { RecordActions } from "@/components/admin/RecordActions";
import { outlineBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isSection, labelOf, SECTIONS } from "@/lib/adminCatalog";
import { requireAdminPage } from "@/lib/auth";
import { fakeMediaActive, lessonThumbnailUrl } from "@/lib/media";
import { adminCatalogRepo as repo, mediaRepo } from "@/server/repos";

// What a new entity starts with. Lists put it last.
const blank = (entity: string, count: number): EntityFormRecord => ({
  ...(entity === "categories" && { kind: "holiday", parentId: null, sortOrder: count + 1, hebcalCode: null }),
  ...(entity === "lessons" && { categoryId: null, teacherId: null, durationSec: null, access: "members" }),
  ...((entity === "terms" || entity === "tracks") && { code: "", sortOrder: count + 1 }),
  translations: { he: {} },
});

// Create ("new") or edit one catalog entity. Lessons also get their video, captions and
// image here, choose their glossary terms and are published; a path is published here and its steps are ordered.
export default async function AdminEditPage({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section, id } = await params;
  if (!isSection(section)) notFound();
  const locale = (await getLocale()) as Locale;
  await requireAdminPage(locale);
  const t = await getTranslations("admin");
  const entity = SECTIONS[section];
  const listHref = `/admin/${section}`;
  const options = async (of: "categories" | "teachers" | "terms") =>
    (await repo.list(of)).map((record) => ({ id: record.id, label: labelOf(record, locale) }));
  const refs = {
    ...((entity === "lessons" || entity === "categories") && { categories: await options("categories") }),
    ...(entity === "lessons" && { teachers: await options("teachers") }),
  };

  if (id === "new") {
    return (
      <>
        <h1 className="mb-6 text-2xl font-medium lg:text-3xl">{t(`sections.${section}.new`)}</h1>
        <EntityForm
          entity={entity}
          initial={blank(entity, (await repo.list(entity)).length)}
          listHref={listHref}
          editHref={listHref}
          options={refs}
        />
      </>
    );
  }

  const record = await repo.get(entity, id);
  if (!record) notFound();
  const name = labelOf(record, locale);
  const media = entity === "lessons" ? await mediaRepo.getLessonMedia(id) : null;
  const steps = entity === "tracks" ? await repo.list("steps", { trackId: id }) : [];
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-medium lg:text-3xl">{name}</h1>
      <RecordActions entity={entity} id={id} name={name} status={"status" in record ? record.status : undefined} listHref={listHref} />
      <EntityForm entity={entity} id={id} initial={record} listHref={listHref} editHref={listHref} options={refs} />
      {entity === "lessons" && media && (
        <>
          {fakeMediaActive() && (
            <p role="note" className="rounded-xl border-2 border-gold bg-cream p-4 font-medium text-gold">
              {t("media.fakeBanner")}
            </p>
          )}
          <LessonMediaPanel
            lessonId={id}
            video={media.video && { status: media.video.status, durationSec: media.video.durationSec }}
            captions={media.captions.map((caption) => ({ locale: caption.locale, synced: Boolean(caption.syncedAt) }))}
            thumbnail={{
              url: lessonThumbnailUrl({ thumbnailKey: media.thumbnailKey, videoThumbnailUrl: media.video?.thumbnailUrl ?? null }),
              uploaded: Boolean(media.thumbnailKey),
            }}
          />
        </>
      )}
      {entity === "lessons" && (
        <OrderedList
          title={t("links.terms")}
          path={`lessons/${id}/terms`}
          options={await options("terms")}
          initial={await repo.getLinks("lessonTerms", id)}
        />
      )}
      {entity === "tracks" && (
        <>
          <OrderedList
            // Remount when a step is added or removed, so the list shows it.
            key={steps.map((step) => step.id).join()}
            title={t("links.steps")}
            path={`tracks/${id}/steps-order`}
            options={steps.map((step) => ({ id: step.id, label: labelOf(step, locale) }))}
            initial={steps.map((step) => step.id)}
            fixed
          />
          <section>
            <h2 className="mb-3 text-lg font-medium">{t("sections.steps.title")}</h2>
            <ul className="flex flex-wrap gap-2">
              {steps.map((step) => (
                <li key={step.id}>
                  <Link href={`/admin/tracks/${id}/steps/${step.id}`} className={outlineBtn}>
                    {labelOf(step, locale)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/admin/tracks/${id}/steps/new`} className={outlineBtn}>
                  + {t("sections.steps.new")}
                </Link>
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
