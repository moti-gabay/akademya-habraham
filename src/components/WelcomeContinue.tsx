"use client";

import { useRouter } from "@/i18n/navigation";
import { parseTextSize, saveTextSize } from "@/lib/prefs";
import { primaryBtn } from "./ui";

export function WelcomeContinue({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`${primaryBtn} mt-8 w-full text-lg`}
      onClick={() => {
        // Saving the cookie is what marks the first visit as done.
        saveTextSize(parseTextSize(document.documentElement.dataset.textSize));
        router.replace("/");
      }}
    >
      {label}
    </button>
  );
}
