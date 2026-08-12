/**
 * Official NYSE early-close sessions (1:00 p.m. America/New_York).
 * Regular close on these days is 12:00 p.m. America/Chicago.
 * Combined close/postmarket publishes one hour after that official close.
 *
 * Source: NYSE holiday / early-close calendar (observed dates 2024–2027).
 * Full-day holidays live in chicago-schedule.ts and are not listed here.
 */
export const NYSE_EARLY_CLOSE_DATES: ReadonlySet<string> = new Set([
  // 2024 — Independence Day eve, day after Thanksgiving, Christmas Eve
  "2024-07-03",
  "2024-11-29",
  "2024-12-24",
  // 2025
  "2025-07-03",
  "2025-11-28",
  "2025-12-24",
  // 2026 — Jul 3 is a full holiday (Independence Day observed)
  "2026-11-27",
  "2026-12-24",
  // 2027 — Jul 5 is a full holiday (Independence Day observed);
  // Christmas observed Fri Dec 24, so Eve is Thu Dec 23
  "2027-11-26",
  "2027-12-23",
]);

export type CalendarOverrides = {
  extraHolidays?: string[];
  extraEarlyCloses?: string[];
  forceOpen?: string[];
};

export function isNyseEarlyCloseDay(
  isoDate: string,
  overrides?: CalendarOverrides,
): boolean {
  if (overrides?.forceOpen?.includes(isoDate)) return false;
  if (overrides?.extraEarlyCloses?.includes(isoDate)) return true;
  return NYSE_EARLY_CLOSE_DATES.has(isoDate);
}
