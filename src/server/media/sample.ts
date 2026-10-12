import { LOCALES } from "../i18n/locales";

// Public test stream (Big Buck Bunny, 10:34) and sample subtitles for every lesson,
// until signed Bunny URLs and in-manifest captions arrive in Milestone 4.
export const SAMPLE_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
export const sampleSubtitles = LOCALES.map((locale) => ({ locale, url: `/samples/lesson-${locale}.vtt` }));
