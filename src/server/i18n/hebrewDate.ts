import { gematriya, Locale as HebcalLocale, type HDate } from "@hebcal/core";
import type { Locale } from "./locales";

// Month names keyed by @hebcal/core's HDate.getMonthName(). ru/es are drafts for review.
const months: Record<"ru" | "es", Record<string, string>> = {
  ru: {
    Nisan: "нисана",
    Iyyar: "ияра",
    Sivan: "сивана",
    Tamuz: "тамуза",
    Av: "ава",
    Elul: "элула",
    Tishrei: "тишрея",
    Cheshvan: "хешвана",
    Kislev: "кислева",
    Tevet: "тевета",
    "Sh'vat": "швата",
    Adar: "адара",
    "Adar I": "адара I",
    "Adar II": "адара II",
  },
  es: {
    Nisan: "nisán",
    Iyyar: "iyar",
    Sivan: "siván",
    Tamuz: "tamuz",
    Av: "av",
    Elul: "elul",
    Tishrei: "tishréi",
    Cheshvan: "jeshván",
    Kislev: "kislev",
    Tevet: "tevet",
    "Sh'vat": "shevat",
    Adar: "adar",
    "Adar I": "adar I",
    "Adar II": "adar II",
  },
};

// Day and month, e.g. "כ״ה בכסלו" / "25 Kislev".
export function formatHebrewDate(date: HDate, locale: Locale): string {
  const day = date.getDate();
  const month = date.getMonthName();
  switch (locale) {
    case "he":
      return `${gematriya(day)} ב${HebcalLocale.gettext(month, "he-x-NoNikud")}`;
    case "ru":
      return `${day} ${months.ru[month] ?? month}`;
    case "es":
      return `${day} de ${months.es[month] ?? month}`;
    default:
      return `${day} ${month}`;
  }
}
