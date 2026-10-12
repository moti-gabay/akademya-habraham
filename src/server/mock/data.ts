import type { Localized } from "../i18n/locales";
import { SAMPLE_HLS, sampleSubtitles } from "../media/sample";
import type { StepStatus } from "../repos/types";

// Sample content that matches design/final-sketch.pdf. It feeds both the mock repos
// and the database seed (src/server/db/seed.ts), so the two cannot drift.
// Everything here is fictional. ru/es strings are initial drafts and need review.

// Fixed id of the sample user, the same in mock mode and in a seeded database.
export const SAMPLE_USER_ID = "5a3b1c2d-0000-4000-8000-000000000001";

export const users: Record<string, { name: Localized; email: string }> = {
  [SAMPLE_USER_ID]: { name: { he: "משה", en: "Moshe", ru: "Моше", es: "Moshé" }, email: "moshe@example.com" },
};

export const track = {
  code: "learning-path",
  name: { he: "מסלול הלימוד", en: "Learning path", ru: "Путь обучения", es: "Camino de estudio" } as Localized,
};

export const teacher = {
  id: "rav-avraham",
  name: { he: "הרב אברהם", en: "Rav Avraham", ru: "Рав Авраам", es: "Rav Abraham" } as Localized,
};

export const steps: { id: string; name: Localized; status: StepStatus; lessonsDone: number; lessonsTotal: number }[] = [
  {
    id: "faith",
    name: { he: "יסודות האמונה", en: "Foundations of faith", ru: "Основы веры", es: "Fundamentos de la fe" },
    status: "completed",
    lessonsDone: 8,
    lessonsTotal: 8,
  },
  {
    id: "shabbat",
    name: { he: "שבת", en: "Shabbat", ru: "Шаббат", es: "Shabat" },
    status: "in_progress",
    lessonsDone: 5,
    lessonsTotal: 12,
  },
  {
    id: "kashrut",
    name: { he: "כשרות", en: "Kashrut", ru: "Кашрут", es: "Kashrut" },
    status: "up_next",
    lessonsDone: 0,
    lessonsTotal: 10,
  },
  {
    id: "prayer",
    name: { he: "תפילה וברכות", en: "Prayer and blessings", ru: "Молитва и благословения", es: "Oración y bendiciones" },
    status: "later",
    lessonsDone: 0,
    lessonsTotal: 10,
  },
  {
    id: "holidays",
    name: { he: "חגי ישראל", en: "The Jewish holidays", ru: "Еврейские праздники", es: "Las fiestas judías" },
    status: "later",
    lessonsDone: 0,
    lessonsTotal: 9,
  },
];

export const lessons: Record<
  string,
  {
    title: Localized;
    teacher: Localized;
    durationSec: number;
    stepId: string | null;
    lessonNumber: number;
    videoUrl: string;
    subtitles: typeof sampleSubtitles;
    termIds: string[];
  }
> = {
  "shabbat-6": {
    title: {
      he: "הלכות שבת: ל״ט מלאכות, חלק א",
      en: "Laws of Shabbat: the 39 Melachot, part 1",
      ru: "Законы Шаббата: 39 мелахот, часть 1",
      es: "Leyes de Shabat: las 39 melajot, parte 1",
    },
    teacher: teacher.name,
    durationSec: 42 * 60 + 15,
    stepId: "shabbat",
    lessonNumber: 6,
    videoUrl: SAMPLE_HLS,
    subtitles: sampleSubtitles,
    termIds: ["melachot", "halacha"],
  },
  "hanukkah-intro": {
    title: {
      he: "חנוכה: נס פך השמן",
      en: "Hanukkah: the miracle of the oil",
      ru: "Ханука: чудо с маслом",
      es: "Janucá: el milagro del aceite",
    },
    teacher: teacher.name,
    durationSec: 33 * 60,
    stepId: "holidays",
    lessonNumber: 1,
    videoUrl: SAMPLE_HLS,
    subtitles: sampleSubtitles,
    termIds: [],
  },
};

export const glossary: { id: string; term: Localized; definition: Localized }[] = [
  {
    id: "shabbat",
    term: { he: "שבת", en: "Shabbat", ru: "Шаббат", es: "Shabat" },
    definition: {
      he: "יום המנוחה השבועי, משקיעת השמש ביום שישי ועד צאת הכוכבים במוצאי שבת.",
      en: "The weekly day of rest, from sunset on Friday until the stars come out on Saturday night.",
      ru: "Еженедельный день отдыха: от захода солнца в пятницу до появления звёзд в субботу вечером.",
      es: "El día de descanso semanal, desde la puesta del sol del viernes hasta que salen las estrellas el sábado por la noche.",
    },
  },
  {
    id: "kashrut",
    term: { he: "כשרות", en: "Kashrut", ru: "Кашрут", es: "Kashrut" },
    definition: {
      he: "הכללים מה מותר לאכול ואיך מכינים את האוכל.",
      en: "The rules about what may be eaten and how food is prepared.",
      ru: "Правила о том, что можно есть и как готовить пищу.",
      es: "Las reglas sobre qué se puede comer y cómo se prepara la comida.",
    },
  },
  {
    id: "halacha",
    term: { he: "הלכה", en: "Halacha", ru: "Галаха", es: "Halajá" },
    definition: {
      he: "הכללים המעשיים של היהדות בחיי היום־יום.",
      en: "The practical rules of Judaism in everyday life.",
      ru: "Практические правила иудаизма в повседневной жизни.",
      es: "Las reglas prácticas del judaísmo en la vida diaria.",
    },
  },
  {
    id: "melachot",
    term: { he: "ל״ט מלאכות", en: "39 Melachot", ru: "39 мелахот", es: "39 melajot" },
    definition: {
      he: "39 סוגי העבודה שאסור לעשות בשבת.",
      en: "The 39 kinds of work that are not done on Shabbat.",
      ru: "39 видов работы, которые запрещены в Шаббат.",
      es: "Los 39 tipos de trabajo que no se hacen en Shabat.",
    },
  },
];

export const nextHoliday = {
  id: "hanukkah",
  // Holiday name as @hebcal/core spells it (Event.basename()).
  hebcalCode: "Chanukah",
  name: { he: "חנוכה", en: "Hanukkah", ru: "Ханука", es: "Janucá" } as Localized,
  hebrewDate: { he: "כ״ה בכסלו", en: "25 Kislev", ru: "25 кислева", es: "25 de kislev" } as Localized,
  description: {
    he: "שיעור היכרות: נס פך השמן",
    en: "Introduction: the miracle of the oil",
    ru: "Вводный урок: чудо с маслом",
    es: "Introducción: el milagro del aceite",
  } as Localized,
  lessonId: "hanukkah-intro",
};

export const initialProgress: [userId: string, lessonId: string, positionSec: number][] = [
  [SAMPLE_USER_ID, "shabbat-6", 12 * 60 + 40],
];
