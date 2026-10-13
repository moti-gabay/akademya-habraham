export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

// Presence of this cookie also marks that the first-visit screen was completed.
export const TEXT_SIZE_COOKIE = "ah_text_size";
export const DEFAULT_TEXT_SIZE: TextSize = "m";
export const PREFS_MAX_AGE = 60 * 60 * 24 * 365;

export const parseTextSize = (value: string | undefined): TextSize =>
  TEXT_SIZES.includes(value as TextSize) ? (value as TextSize) : DEFAULT_TEXT_SIZE;

// Runs in <head> before the first paint, so statically rendered pages show the chosen
// size with no flash. The server always renders the default.
export const TEXT_SIZE_SCRIPT = `(function(){var m=document.cookie.match(/(?:^|; )${TEXT_SIZE_COOKIE}=([${TEXT_SIZES.join("")}])(?:;|$)/);if(m)document.documentElement.dataset.textSize=m[1]})()`;

// Client only. Applies the size at once and stores it for the next server render.
export function saveTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
  document.cookie = `${TEXT_SIZE_COOKIE}=${size}; path=/; max-age=${PREFS_MAX_AGE}; samesite=lax`;
}
