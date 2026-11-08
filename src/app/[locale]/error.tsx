"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { outlineBtn, primaryBtn } from "@/components/ui";
import { Link } from "@/i18n/navigation";

// Any error while a page renders, in the visitor's language: plain words, a way to try
// again and a way home, never a message or a stack. The digest is Next's reference for
// the server's log line (`⨯ Error: … digest: '…'`); errors thrown in the browser have none.
// A page's notFound() never comes here: Next sends it to not-found.tsx.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("error");
  const heading = useRef<HTMLHeadingElement>(null);
  // The error a retry was started for: a double click sends one refresh, and a retry
  // that fails again brings a new error, which enables the button again.
  const [retriedFor, setRetriedFor] = useState<unknown>(null);
  const retrying = retriedFor === error;

  useEffect(() => heading.current?.focus(), [error]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-medium">
        {t("title")}
      </h1>
      <p className="text-lg">{t("text")}</p>
      <button
        type="button"
        disabled={retrying}
        className={`${primaryBtn} w-full text-lg disabled:opacity-70`}
        onClick={() => {
          setRetriedFor(error);
          // Fetches the page from the server again, then clears the error.
          retry();
        }}
      >
        {t("retry")}
      </button>
      <Link href="/" className={`${outlineBtn} w-full text-lg`}>
        {t("home")}
      </Link>
      {error.digest && (
        <p className="text-sm text-muted">
          {t.rich("reference", { digest: error.digest, ref: (chunks) => <span dir="ltr">{chunks}</span> })}
        </p>
      )}
    </main>
  );
}
