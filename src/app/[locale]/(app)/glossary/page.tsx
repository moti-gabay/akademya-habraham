import { getLocale } from "next-intl/server";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { TermList } from "@/components/TermList";
import { card } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { glossaryRepo } from "@/server/repos";

export default async function GlossaryPage() {
  const terms = await glossaryRepo.list((await getLocale()) as Locale);
  return (
    <PlaceholderPage page="glossary">
      <div className={`${card} max-w-2xl px-5 py-2`}>
        <TermList terms={terms} />
      </div>
    </PlaceholderPage>
  );
}
