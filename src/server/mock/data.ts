import type { Localized } from "../i18n/locales";
import { sampleSubtitles } from "../media/sample";
import type { LessonAccess, StepStatus } from "../repos/types";

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
    subtitles: typeof sampleSubtitles;
    termIds: string[];
    // Catalog fields. Defaults: no category, members only, published.
    categoryId?: string;
    access?: LessonAccess;
    status?: "draft" | "published";
    description?: Localized;
    keyPoints?: Localized<string[]>;
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
    subtitles: sampleSubtitles,
    termIds: [],
    categoryId: "hanukkah",
    access: "free",
    description: {
      he: "שיעור היכרות: נס פך השמן",
      en: "Introduction: the miracle of the oil",
      ru: "Вводный урок: чудо с маслом",
      es: "Introducción: el milagro del aceite",
    },
    keyPoints: {
      he: ["מה קרה בימי החשמונאים", "למה חוגגים שמונה ימים", "מה מיוחד בשמן הזית"],
      en: ["What happened in the days of the Hasmoneans", "Why the holiday lasts eight days", "What is special about olive oil"],
      ru: ["Что произошло во времена Хасмонеев", "Почему праздник длится восемь дней", "Чем особенно оливковое масло"],
      es: ["Qué ocurrió en los días de los asmoneos", "Por qué la fiesta dura ocho días", "Qué tiene de especial el aceite de oliva"],
    },
  },
  "hanukkah-candles": {
    title: {
      he: "חנוכה: איך מדליקים נרות",
      en: "Hanukkah: how to light the candles",
      ru: "Ханука: как зажигать свечи",
      es: "Janucá: cómo encender las velas",
    },
    teacher: teacher.name,
    durationSec: 27 * 60,
    stepId: "holidays",
    lessonNumber: 2,
    subtitles: sampleSubtitles,
    termIds: [],
    categoryId: "hanukkah",
    description: {
      he: "סדר ההדלקה והברכות, צעד אחר צעד",
      en: "The order of lighting and the blessings, step by step",
      ru: "Порядок зажигания и благословения, шаг за шагом",
      es: "El orden del encendido y las bendiciones, paso a paso",
    },
    keyPoints: {
      he: ["איפה מעמידים את החנוכייה", "באיזה סדר מדליקים", "אילו ברכות אומרים"],
      en: ["Where to place the menorah", "In what order to light", "Which blessings are said"],
      ru: ["Где ставить ханукию", "В каком порядке зажигать", "Какие благословения произносят"],
      es: ["Dónde colocar la januquiá", "En qué orden se enciende", "Qué bendiciones se dicen"],
    },
  },
  "purim-megillah": {
    title: {
      he: "פורים: סיפור המגילה",
      en: "Purim: the story of the Megillah",
      ru: "Пурим: история Мегилы",
      es: "Purim: la historia de la Meguilá",
    },
    teacher: teacher.name,
    durationSec: 31 * 60,
    stepId: "holidays",
    lessonNumber: 3,
    subtitles: sampleSubtitles,
    termIds: [],
    categoryId: "purim",
    access: "free",
    description: {
      he: "שיעור היכרות: מגילת אסתר וארבע מצוות היום",
      en: "Introduction: the Book of Esther and the four mitzvot of the day",
      ru: "Вводный урок: Книга Эстер и четыре заповеди дня",
      es: "Introducción: el Libro de Ester y los cuatro preceptos del día",
    },
    keyPoints: {
      he: ["מי היו אסתר ומרדכי", "ארבע מצוות הפורים", "למה מתחפשים"],
      en: ["Who Esther and Mordechai were", "The four mitzvot of Purim", "Why people dress up"],
      ru: ["Кто такие Эстер и Мордехай", "Четыре заповеди Пурима", "Почему надевают костюмы"],
      es: ["Quiénes fueron Ester y Mordejai", "Los cuatro preceptos de Purim", "Por qué la gente se disfraza"],
    },
  },
  "pesach-seder": {
    title: {
      he: "פסח: ליל הסדר",
      en: "Pesach: the Seder night",
      ru: "Песах: ночь Седера",
      es: "Pésaj: la noche del Séder",
    },
    teacher: teacher.name,
    durationSec: 38 * 60,
    stepId: "holidays",
    lessonNumber: 4,
    subtitles: sampleSubtitles,
    termIds: [],
    categoryId: "pesach",
    access: "free",
    description: {
      he: "שיעור היכרות: מה עושים בליל הסדר ולמה",
      en: "Introduction: what is done on the Seder night, and why",
      ru: "Вводный урок: что делают в ночь Седера и почему",
      es: "Introducción: qué se hace en la noche del Séder y por qué",
    },
    keyPoints: {
      he: ["סדר הערב לפי ההגדה", "מה מונח על קערת הסדר", "ארבע הכוסות"],
      en: ["The order of the evening in the Haggadah", "What is on the Seder plate", "The four cups"],
      ru: ["Порядок вечера по Агаде", "Что лежит на блюде Седера", "Четыре бокала"],
      es: ["El orden de la noche según la Hagadá", "Qué hay en el plato del Séder", "Las cuatro copas"],
    },
  },
  // A draft: it never appears on the public pages.
  "pesach-chametz": {
    title: {
      he: "פסח: מהו חמץ",
      en: "Pesach: what is chametz",
      ru: "Песах: что такое хамец",
      es: "Pésaj: qué es el jametz",
    },
    teacher: teacher.name,
    durationSec: 24 * 60,
    stepId: "holidays",
    lessonNumber: 5,
    subtitles: sampleSubtitles,
    termIds: [],
    categoryId: "pesach",
    status: "draft",
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

// Holiday names as @hebcal/core spells them (Event.basename()). The home card shows the
// next one that has a published lesson; Shavuot has none yet.
export const holidayCategories: { id: string; hebcalCode: string; name: Localized }[] = [
  { id: "hanukkah", hebcalCode: "Chanukah", name: { he: "חנוכה", en: "Hanukkah", ru: "Ханука", es: "Janucá" } },
  { id: "purim", hebcalCode: "Purim", name: { he: "פורים", en: "Purim", ru: "Пурим", es: "Purim" } },
  { id: "pesach", hebcalCode: "Pesach", name: { he: "פסח", en: "Pesach", ru: "Песах", es: "Pésaj" } },
  { id: "shavuot", hebcalCode: "Shavuot", name: { he: "שבועות", en: "Shavuot", ru: "Шавуот", es: "Shavuot" } },
];

export const initialProgress: [userId: string, lessonId: string, positionSec: number][] = [
  [SAMPLE_USER_ID, "shabbat-6", 12 * 60 + 40],
];
