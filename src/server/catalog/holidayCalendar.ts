import { flags, HebrewCalendar, type HDate } from "@hebcal/core";

const DAY_MS = 86_400_000;
// Longer than any holiday, so one that already began is still found.
const LOOKBACK_DAYS = 10;

// The next holiday among `codes` (names as @hebcal/core spells them, Event.basename()),
// or the one under way. A holiday can span several calendar entries (eight days of
// Hanukkah): they are grouped and the first day is reported. "Erev …" entries are
// skipped: they are the day before.
export function nextHolidayOccurrence(codes: ReadonlySet<string>, now: Date): { code: string; start: HDate } | null {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 13);
  const occurrences: { code: string; start: HDate; lastDay: number }[] = [];
  for (const item of HebrewCalendar.calendar({ start: from, end: to, il: true })) {
    const code = item.basename();
    if (!codes.has(code) || item.getFlags() & flags.EREV) continue;
    const day = item.getDate().greg().getTime();
    const current = occurrences.findLast((occurrence) => occurrence.code === code);
    if (current && day - current.lastDay <= 2 * DAY_MS) current.lastDay = day;
    else occurrences.push({ code, start: item.getDate(), lastDay: day });
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return occurrences.find((occurrence) => occurrence.lastDay >= today) ?? null;
}
