import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { PathStep } from "@/server/repos";

const badge: Record<PathStep["status"], string> = {
  completed: "bg-green text-white",
  in_progress: "border-2 border-green font-bold text-green",
  up_next: "border border-muted/60 text-muted",
  later: "border border-muted/60 text-muted",
};

// Mobile: one card with a list. Desktop: a row of cards, the current step outlined in green.
export async function PathSteps({ steps }: { steps: PathStep[] }) {
  const t = await getTranslations("home");
  return (
    <section aria-labelledby="my-path">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="my-path" className="text-lg font-medium lg:text-xl">
          {t("myPath")}
        </h2>
        <Link href="/path" className="tap inline-flex items-center text-sm font-medium text-green">
          {t("seeFullPath")}
        </Link>
      </div>
      <ol className="divide-y divide-line rounded-card border border-line bg-card px-4 lg:grid lg:grid-cols-5 lg:gap-3 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {steps.map((step) => {
          const current = step.status === "in_progress";
          const counts = { done: step.lessonsDone, total: step.lessonsTotal };
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-3 py-3 lg:flex-col lg:items-start lg:gap-2 lg:rounded-card lg:border lg:bg-card lg:p-4 ${
                current ? "lg:border-green lg:ring-1 lg:ring-green" : "lg:border-line"
              }`}
            >
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${badge[step.status]}`}>
                {step.status === "completed" ? <Check className="size-4" strokeWidth={3} /> : step.number}
              </span>
              <span>
                <span className={`block ${current ? "font-semibold" : ""}`}>{step.name}</span>
                {step.status === "completed" && <span className="block text-sm text-muted">{t("status.completed")}</span>}
                {step.status === "up_next" && <span className="block text-sm text-muted">{t("status.upNext")}</span>}
                {current && (
                  <>
                    <span className="block text-sm text-muted lg:hidden">{t("status.inProgress", counts)}</span>
                    <span className="hidden text-sm text-muted lg:block">{t("status.inProgressShort", counts)}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
