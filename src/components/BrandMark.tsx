import { BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Logo and name, centered: the top of the welcome and sign-in screens.
export async function BrandMark() {
  const t = await getTranslations();
  return (
    <>
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-green text-white">
        <BookOpen aria-hidden className="size-7" />
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-green">{t("brand")}</h1>
    </>
  );
}
