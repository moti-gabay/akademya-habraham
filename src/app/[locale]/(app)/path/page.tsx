import { getLocale } from "next-intl/server";
import { PathStepList } from "@/components/home/PathSteps";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import type { Locale } from "@/i18n/routing";
import { getPageActor } from "@/lib/auth";
import { pathRepo } from "@/server/repos";

export default async function PathPage() {
  const locale = (await getLocale()) as Locale;
  const steps = await pathRepo.getSteps((await getPageActor(locale)).userId, locale);
  return (
    <PlaceholderPage page="path">
      <PathStepList steps={steps} />
    </PlaceholderPage>
  );
}
