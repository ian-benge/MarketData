import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addCalendarDays } from "@/lib/market-data/earnings/window";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";

export const CATALYST_LOOKBACK_DAYS = 365;
export const CATALYST_LOOKAHEAD_DAYS = 90;
export const CATALYST_FILL_CHUNK_DAYS = 90;

export function chicagoEventDay(event: NormalizedCalendarEvent): string {
  return chicagoDateString(new Date(event.scheduledAt));
}

export function sundayOfChicagoDate(isoDate: string): string {
  const noon = fromZonedTime(`${isoDate}T12:00:00`, CHICAGO_TZ);
  const weekday = Number(formatInTimeZone(noon, CHICAGO_TZ, "i"));
  const sundayOffset = weekday === 7 ? 0 : -weekday;
  return addCalendarDays(isoDate, sundayOffset);
}

export function chicagoWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
}

export function catalystWeekBounds(
  eventDays: readonly string[],
  today = chicagoDateString(new Date()),
): { earliest: string; latest: string } {
  const thisWeek = sundayOfChicagoDate(today);
  let earliest = thisWeek;
  let latest = thisWeek;
  for (const day of eventDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const start = sundayOfChicagoDate(day);
    if (start < earliest) earliest = start;
    if (start > latest) latest = start;
  }
  return { earliest, latest };
}

/** Prefer `preferred` on any Chicago date it covers; keep `fill` for the rest. */
export function mergePreferredCalendarEvents(
  preferred: readonly NormalizedCalendarEvent[],
  fill: readonly NormalizedCalendarEvent[],
): NormalizedCalendarEvent[] {
  const preferredDays = new Set(preferred.map(chicagoEventDay));
  const extra = fill.filter((event) => !preferredDays.has(chicagoEventDay(event)));
  return [...preferred, ...extra].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
}

export function catalystFillWindows(now = new Date()): Array<{ start: string; end: string }> {
  const today = chicagoDateString(now);
  const from = addCalendarDays(today, -CATALYST_LOOKBACK_DAYS);
  const to = addCalendarDays(today, CATALYST_LOOKAHEAD_DAYS);
  const windows: Array<{ start: string; end: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    const chunkEnd = addCalendarDays(cursor, CATALYST_FILL_CHUNK_DAYS - 1);
    const end = chunkEnd < to ? chunkEnd : to;
    windows.push({ start: cursor, end });
    cursor = addCalendarDays(end, 1);
  }
  return windows;
}
