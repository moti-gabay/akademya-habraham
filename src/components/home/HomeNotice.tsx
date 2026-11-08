import { CircleCheck, Hourglass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { card } from "@/components/ui";

// Home without a lesson to offer: the whole path finished, or nothing ready yet. No
// button: the path list below stays the way on.
export async function HomeNotice({ kind }: { kind: "finished" | "empty" }) {
  const t = await getTranslations("home");
  const Icon = kind === "finished" ? CircleCheck : Hourglass;
  return (
    <section aria-labelledby="home-notice" className={`${card} flex items-start gap-4 p-4 lg:p-5`}>
      {/* Decorative: the heading next to it says it all. */}
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-green-tint text-green">
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="home-notice" className="text-xl leading-snug font-medium lg:text-2xl">
          {t(kind === "finished" ? "finishedTitle" : "emptyTitle")}
        </h2>
        <p className="text-muted">{t(kind === "finished" ? "finishedText" : "emptyText")}</p>
      </div>
    </section>
  );
}
