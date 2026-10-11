import { BookOpen } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { LanguageList } from "@/components/LanguageList";
import { TextSizeControl } from "@/components/TextSizeControl";
import { WelcomeContinue } from "@/components/WelcomeContinue";
import { routing } from "@/i18n/routing";
import { parseTextSize, TEXT_SIZE_COOKIE } from "@/lib/prefs";

export default async function WelcomePage() {
  const locale = await getLocale();
  const t = await getTranslations();
  const textSize = parseTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);

  // Nobody has chosen a language yet, so labels are shown in English too.
  const en = await getTranslations({ locale: "en", namespace: "prefs" });
  const bilingual = (key: "chooseLanguage" | "textSize") =>
    locale === "en" ? en(key) : `${t(`prefs.${key}`)} · ${en(key)}`;
  const greetings = await Promise.all(
    routing.locales.map(async (l) => ({
      locale: l,
      text: (await getTranslations({ locale: l, namespace: "prefs" }))("welcome"),
    })),
  );

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-green text-white">
          <BookOpen aria-hidden className="size-7" />
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-green">{t("brand")}</h1>
        <p className="mx-auto mt-2 flex max-w-xs flex-wrap justify-center gap-x-2 text-sm text-muted">
          {greetings.map((greeting, index) => (
            <span key={greeting.locale} lang={greeting.locale}>
              {greeting.text}
              {index < greetings.length - 1 && <span aria-hidden> ·</span>}
            </span>
          ))}
        </p>
        <h2 id="choose-language" className="mt-8 mb-2 font-medium">
          {bilingual("chooseLanguage")}
        </h2>
      </div>
      <LanguageList labelledBy="choose-language" />
      <div className="mt-6 text-center">
        <TextSizeControl initial={textSize} legend={bilingual("textSize")} />
      </div>
      <WelcomeContinue label={t("prefs.continue")} />
      <p className="mt-3 text-center text-sm text-muted">{t("prefs.changeAnytime")}</p>
    </main>
  );
}
