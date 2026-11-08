"use client";

import { useEffect, useRef } from "react";
import { primaryBtn } from "@/components/ui";
import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";
import { rubik } from "@/lib/font";
import { DEFAULT_TEXT_SIZE, parseTextSize, TEXT_SIZE_COOKIE, TEXT_SIZE_SCRIPT } from "@/lib/prefs";
import "./globals.css";

// Shown only when the root layout itself fails, in production builds. It replaces the
// layout, so it has its own <html> and no next-intl: the words come straight from the
// message files, Hebrew first and English below, each with its own reload button.
const blocks = [
  { lang: "he", dir: "rtl", text: he.globalError },
  { lang: "en", dir: "ltr", text: en.globalError },
] as const;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Next usually draws this page in the browser, where the <head> script below does not
    // run, so the visitor's text size is applied here too.
    const saved = document.cookie.match(new RegExp(`(?:^|; )${TEXT_SIZE_COOKIE}=([^;]*)`))?.[1];
    document.documentElement.dataset.textSize = parseTextSize(saved);
    heading.current?.focus();
  }, []);

  return (
    <html lang="he" dir="rtl" data-text-size={DEFAULT_TEXT_SIZE} className={rubik.variable} suppressHydrationWarning>
      <head>
        <title>{`${he.globalError.title} · ${en.globalError.title}`}</title>
        {/* The visitor's text size before the first paint, when this page comes as server HTML. */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 px-6 py-10">
          {blocks.map(({ lang, dir, text }, index) => {
            const Heading = index === 0 ? "h1" : "h2";
            const [before, after] = text.reference.split("{digest}");
            return (
              <section key={lang} lang={lang} dir={dir} className="flex flex-col items-center gap-4 text-center">
                <Heading ref={index === 0 ? heading : undefined} tabIndex={index === 0 ? -1 : undefined} className="text-2xl font-medium">
                  {text.title}
                </Heading>
                <p className="text-lg">{text.text}</p>
                <button type="button" className={`${primaryBtn} w-full text-lg`} onClick={() => window.location.reload()}>
                  {text.reload}
                </button>
                {error.digest && (
                  <p className="text-sm text-muted">
                    {before}
                    <span dir="ltr">{error.digest}</span>
                    {after}
                  </p>
                )}
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
