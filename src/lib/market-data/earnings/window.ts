import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  EARNINGS_LOOKAHEAD_DAYS,
  EARNINGS_LOOKBACK_DAYS,
} from "@/lib/market-data/earnings/types";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function addCalendarDays(
  yyyyMmDd: string,
  days: number,
  timeZone = CHICAGO_TZ,
): string {
  const noon = fromZonedTime(`${yyyyMmDd}T12:00:00`, timeZone);
  noon.setUTCDate(noon.getUTCDate() + days);
  return formatInTimeZone(noon, timeZone, "yyyy-MM-dd");
}

export function parseIsoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = ISO_DATE.exec(trimmed.slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  const iso = new Date(utc).toISOString().slice(0, 10);
  return iso === `${match[1]}-${match[2]}-${match[3]}` ? iso : null;
}

export function calendarDayDiff(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.NaN;
  return Math.round((end - start) / 86_400_000);
}

export function isDateInInclusiveWindow(
  date: string,
  from: string,
  to: string,
): boolean {
  return date >= from && date <= to;
}

export type EarningsCoverageWindow = {
  from: string;
  to: string;
};

/**
 * Yesterday through +6 months on the America/Chicago calendar.
 * Using Chicago (not UTC midnight) keeps the API window aligned with the UI.
 */
export function earningsCoverageWindow(
  now = new Date(),
): EarningsCoverageWindow {
  const today = chicagoDateString(now);
  return {
    from: addCalendarDays(today, -EARNINGS_LOOKBACK_DAYS),
    to: addCalendarDays(today, EARNINGS_LOOKAHEAD_DAYS),
  };
}

/** Provider fetch range: display window padded one calendar day on each side. */
export function earningsProviderFetchWindow(
  window: EarningsCoverageWindow,
): EarningsCoverageWindow {
  return {
    from: addCalendarDays(window.from, -1),
    to: addCalendarDays(window.to, 1),
  };
}

export function foldWeekendReportDate(yyyyMmDd: string): string {
  const monday = mondayOfChicagoWeek(yyyyMmDd);
  const friday = addCalendarDays(monday, 4);
  const sunday = addCalendarDays(monday, 6);
  if (yyyyMmDd > friday && yyyyMmDd <= sunday) return friday;
  return yyyyMmDd;
}

export function mondayOfChicagoWeek(yyyyMmDd: string): string {
  const noon = fromZonedTime(`${yyyyMmDd}T12:00:00`, CHICAGO_TZ);
  const weekday = Number(formatInTimeZone(noon, CHICAGO_TZ, "i"));
  return addCalendarDays(yyyyMmDd, 1 - weekday);
}
