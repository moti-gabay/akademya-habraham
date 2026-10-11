export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

// Presence of this cookie also marks that the first-visit screen was completed.
export const TEXT_SIZE_COOKIE = "ah_text_size";
export const DEFAULT_TEXT_SIZE: TextSize = "m";
export const PREFS_MAX_AGE = 60 * 60 * 24 * 365;

export const parseTextSize = (value: string | undefined): TextSize =>
  TEXT_SIZES.includes(value as TextSize) ? (value as TextSize) : DEFAULT_TEXT_SIZE;

// Client only. Applies the size at once and stores it for the next server render.
export function saveTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
  document.cookie = `${TEXT_SIZE_COOKIE}=${size}; path=/; max-age=${PREFS_MAX_AGE}; samesite=lax`;
}
