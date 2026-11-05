import { getTranslations } from "next-intl/server";
import { primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";

// Every 404 inside a site language: a page's notFound(), and unknown addresses through
// the catch-all route next to this file. Plain words and one large way back.
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <h1 className="text-2xl font-medium">{t("title")}</h1>
      <p className="text-lg">{t("text")}</p>
      <Link href="/" className={`${primaryBtn} w-full text-lg`}>
        {t("home")}
      </Link>
    </main>
  );
}
