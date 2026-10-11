"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveTextSize, TEXT_SIZES, type TextSize } from "@/lib/prefs";

const letterSize: Record<TextSize, string> = { s: "text-sm", m: "text-xl", l: "text-3xl" };

export function TextSizeControl({ initial, legend }: { initial: TextSize; legend: string }) {
  const t = useTranslations("prefs");
  const [value, setValue] = useState(initial);
  return (
    <fieldset>
      <legend className="mb-2 w-full font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {TEXT_SIZES.map((size) => (
          <label
            key={size}
            className="tap flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-line bg-card hover:bg-green-tint/50 has-[:checked]:border-green has-[:checked]:bg-green-tint has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green"
          >
            <input
              type="radio"
              name="text-size"
              value={size}
              checked={value === size}
              onChange={() => {
                setValue(size);
                saveTextSize(size);
              }}
              aria-label={t(`sizes.${size}`)}
              className="sr-only"
            />
            <span aria-hidden className={`font-medium ${letterSize[size]}`}>
              {t("sizeLetter")}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
