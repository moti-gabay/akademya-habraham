import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
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
        <BrandMark />
        <p className="mt-2 text-sm text-muted">
          {/* Two greetings per line, as many lines as there are site languages. */}
          {greetings
            .filter((_, index) => index % 2 === 0)
            .map((first, line) => {
              const second = greetings[line * 2 + 1];
              return (
                <span key={first.locale} className="block">
                  <bdi lang={first.locale}>{first.text}</bdi>
                  {second && (
                    <>
                      <span aria-hidden> · </span>
                      <bdi lang={second.locale}>{second.text}</bdi>
                    </>
                  )}
                </span>
              );
            })}
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
