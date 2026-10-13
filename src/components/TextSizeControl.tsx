"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { parseTextSize, saveTextSize, TEXT_SIZES, type TextSize } from "@/lib/prefs";
import { SegmentedRadio } from "./SegmentedRadio";

const letterSize: Record<TextSize, string> = { s: "text-sm", m: "text-xl", l: "text-3xl" };

// Without `initial` the current size is read from the page, which works where this is
// mounted in the browser only (inside a menu).
export function TextSizeControl({ initial, legend }: { initial?: TextSize; legend: string }) {
  const t = useTranslations("prefs");
  const [value, setValue] = useState(() => initial ?? parseTextSize(document.documentElement.dataset.textSize));
  return (
    <SegmentedRadio
      legend={legend}
      name="text-size"
      value={value}
      onChange={(size) => {
        setValue(size);
        saveTextSize(size);
      }}
      options={TEXT_SIZES.map((size) => ({
        value: size,
        label: t(`sizes.${size}`),
        content: (
          <span aria-hidden className={letterSize[size]}>
            {t("sizeLetter")}
          </span>
        ),
      }))}
    />
  );
}
