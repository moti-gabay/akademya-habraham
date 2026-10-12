import { getLocale } from "next-intl/server";
import { PathStepList } from "@/components/home/PathSteps";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import type { Locale } from "@/i18n/routing";
import { getCurrentUserId } from "@/server/auth";
import { pathRepo } from "@/server/repos";

export default async function PathPage() {
  const steps = await pathRepo.getSteps(await getCurrentUserId(), (await getLocale()) as Locale);
  return (
    <PlaceholderPage page="path">
      <PathStepList steps={steps} />
    </PlaceholderPage>
  );
}
