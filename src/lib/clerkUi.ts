import { enUS, esES, heIL, ruRU } from "@clerk/localizations";
import type { Locale } from "@/i18n/routing";

// Clerk's own screens (sign-in, sign-up, account menu) in our languages and colors.
export const clerkLocalization = { he: heIL, en: enUS, ru: ruRU, es: esES } satisfies Record<Locale, unknown>;

export const clerkAppearance = {
  variables: {
    colorPrimary: "#2e5a3e",
    colorText: "#1f2420",
    colorBackground: "#ffffff",
    fontFamily: "var(--font-rubik), system-ui, sans-serif",
    borderRadius: "1rem",
    fontSize: "1rem",
  },
};
