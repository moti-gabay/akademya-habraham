import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Rubik } from "next/font/google";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { dirOf, routing } from "@/i18n/routing";
import { authMode } from "@/lib/authMode";
import { clerkAppearance, clerkLocalization } from "@/lib/clerkUi";
import { parseTextSize, TEXT_SIZE_COOKIE } from "@/lib/prefs";
import "../globals.css";

const rubik = Rubik({ subsets: ["hebrew", "latin", "latin-ext", "cyrillic"], variable: "--font-rubik" });

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("brand") };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const textSize = parseTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);

  const page = <NextIntlClientProvider>{children}</NextIntlClientProvider>;
  return (
    <html lang={locale} dir={dirOf(locale)} data-text-size={textSize} className={rubik.variable}>
      <body className="min-h-dvh antialiased">
        {authMode === "clerk" ? (
          <ClerkProvider
            localization={clerkLocalization[locale]}
            appearance={clerkAppearance}
            signInUrl={`/${locale}/sign-in`}
            signUpUrl={`/${locale}/sign-up`}
            signInFallbackRedirectUrl={`/${locale}`}
            signUpFallbackRedirectUrl={`/${locale}`}
            afterSignOutUrl={`/${locale}/sign-in`}
          >
            {page}
          </ClerkProvider>
        ) : (
          page
        )}
      </body>
    </html>
  );
}
