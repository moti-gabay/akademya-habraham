"use client";

import { ClerkLoading, Show } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { primaryBtn } from "../ui";

// The button under a lesson preview: "watch" for a signed-in visitor, "sign up to watch"
// otherwise. Decided in the browser, so the page around it stays static.
// `mode` comes from the server: without Clerk every visitor is the sample user.
export function LessonCta({ mode, lessonId }: { mode: "clerk" | "stub"; lessonId: string }) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const watchHref = `/lessons/${lessonId}`;
  const watch = (
    <Link href={watchHref} className={primaryBtn}>
      {t("watch")}
    </Link>
  );
  if (mode === "stub") return watch;

  // After signing up, continue to the lesson.
  const signUp = (
    <Link href={{ pathname: "/sign-up", query: { redirect_url: `/${locale}${watchHref}` } }} className={primaryBtn}>
      {t("signUpToWatch")}
    </Link>
  );
  return (
    <>
      <ClerkLoading>{signUp}</ClerkLoading>
      <Show when="signed-out">{signUp}</Show>
      <Show when="signed-in">{watch}</Show>
    </>
  );
}
