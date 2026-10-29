import { LOCALES } from "../i18n/locales";

// Sample subtitles for every lesson that has no captions of its own.
export const sampleSubtitles = LOCALES.map((locale) => ({ locale, url: `/samples/lesson-${locale}.vtt` }));
