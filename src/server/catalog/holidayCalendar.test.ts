import assert from "node:assert/strict";
import { test } from "node:test";
import { nextHolidayOccurrence } from "./holidayCalendar";

const codes = new Set(["Chanukah", "Purim"]);
const next = (day: string, among = codes) => {
  const found = nextHolidayOccurrence(among, new Date(`${day}T12:00:00`));
  return found && [found.code, found.start.toString()];
};

test("the next holiday is the nearest one among the given codes", () => {
  assert.equal(next("2026-10-12")?.[0], "Chanukah");
  assert.equal(next("2026-12-20")?.[0], "Purim");
  assert.equal(next("2026-12-20", new Set(["Chanukah"]))?.[0], "Chanukah");
});

test("a holiday under way is reported with its first day", () => {
  assert.deepEqual(next("2026-12-07"), ["Chanukah", "25 Kislev 5787"]);
  assert.deepEqual(next("2026-12-11"), next("2026-12-07"));
  assert.equal(next("2026-12-20")?.[1], "14 Adar II 5787");
});

test("no codes, no holiday", () => {
  assert.equal(next("2026-10-12", new Set()), null);
});
