import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CompletenessBadges } from "@/components/admin/CompletenessBadges";
import { card, primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isSection, labelOf, SECTIONS } from "@/lib/adminCatalog";
import { requireAdminPage } from "@/lib/auth";
import { adminCatalogRepo } from "@/server/repos";

// List of one kind of catalog entity, with the languages each one is translated into.
export default async function AdminListPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSection(section)) notFound();
  const locale = (await getLocale()) as Locale;
  await requireAdminPage(locale);
  const t = await getTranslations("admin");
  const records = await adminCatalogRepo.list(SECTIONS[section]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-medium lg:text-3xl">{t(`sections.${section}.title`)}</h1>
        <Link href={`/admin/${section}/new`} className={primaryBtn}>
          {t(`sections.${section}.new`)}
        </Link>
      </div>
      {records.length === 0 ? (
        <p className={`${card} p-5`}>{t(`sections.${section}.empty`)}</p>
      ) : (
        <ul className="grid gap-2">
          {records.map((record) => {
            const status = "status" in record ? record.status : undefined;
            return (
              <li key={record.id} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 p-3 ps-5`}>
                <Link href={`/admin/${section}/${record.id}`} className="tap inline-flex min-w-0 flex-1 basis-64 items-center font-medium text-green underline">
                  {labelOf(record, locale)}
                </Link>
                {status && <span className={status === "published" ? "text-green" : "text-gold"}>{t(`status.${status}`)}</span>}
                <CompletenessBadges translations={record.translations} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
