import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  NYSE_HOLIDAYS_2024_2027,
} from "@/lib/scheduling/chicago-schedule";
import { isNyseEarlyCloseDay } from "@/lib/scheduling/nyse-early-close";
import type { ExtendedMarketSession } from "@/lib/market-data/schemas";
import type { ScannerSessionPreset } from "./types";

export const NY_TZ = "America/New_York";

export type ScannerSessionClock = {
  now: Date;
  session: ExtendedMarketSession;
  sessionDate: string;
  isTradingDay: boolean;
  isEarlyClose: boolean;
  regularCloseHm: string;
  afterHoursCloseHm: string;
  minutesIntoSession: number | null;
  sessionElapsed: number | null;
  preset: ScannerSessionPreset;
};

function nyDate(now: Date): string {
  return formatInTimeZone(now, NY_TZ, "yyyy-MM-dd");
}

function nyHm(now: Date): string {
  return formatInTimeZone(now, NY_TZ, "HHmm");
}

function nyWeekday(now: Date): number {
  return Number(formatInTimeZone(now, NY_TZ, "i"));
}

export function isNyseTradingDayNy(now: Date): boolean {
  const weekday = nyWeekday(now);
  if (weekday >= 6) return false;
  return !NYSE_HOLIDAYS_2024_2027.has(nyDate(now));
}

export function scannerSessionBounds(now: Date): {
  sessionDate: string;
  isTradingDay: boolean;
  isEarlyClose: boolean;
  regularOpenHm: string;
  regularCloseHm: string;
  afterHoursCloseHm: string;
  premarketOpenHm: string;
} {
  const sessionDate = nyDate(now);
  const isTradingDay = isNyseTradingDayNy(now);
  const isEarlyClose = isTradingDay && isNyseEarlyCloseDay(sessionDate);
  return {
    sessionDate,
    isTradingDay,
    isEarlyClose,
    premarketOpenHm: "0400",
    regularOpenHm: "0930",
    regularCloseHm: isEarlyClose ? "1300" : "1600",
    afterHoursCloseHm: isEarlyClose ? "1700" : "2000",
  };
}

export function inferScannerSession(now: Date = new Date()): ExtendedMarketSession {
  const bounds = scannerSessionBounds(now);
  if (!bounds.isTradingDay) return "closed";
  const hm = nyHm(now);
  if (hm >= "0000" && hm < "0400") return "overnight";
  if (hm >= "0400" && hm < "0930") return "premarket";
  if (hm >= "0930" && hm < bounds.regularCloseHm) return "regular";
  if (hm >= bounds.regularCloseHm && hm < bounds.afterHoursCloseHm) return "afterhours";
  return "closed";
}

function minutesFromHm(hm: string): number {
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(2, 4));
}

export function sessionElapsedFraction(now: Date = new Date()): number | null {
  const session = inferScannerSession(now);
  const bounds = scannerSessionBounds(now);
  if (!bounds.isTradingDay) return null;
  const minutes = minutesFromHm(nyHm(now));
  if (session === "premarket") {
    const start = minutesFromHm("0400");
    const end = minutesFromHm("0930");
    return Math.min(1, Math.max(0, (minutes - start) / (end - start)));
  }
  if (session === "regular") {
    const start = minutesFromHm("0930");
    const end = minutesFromHm(bounds.regularCloseHm);
    return Math.min(1, Math.max(0, (minutes - start) / (end - start)));
  }
  if (session === "afterhours") {
    const start = minutesFromHm(bounds.regularCloseHm);
    const end = minutesFromHm(bounds.afterHoursCloseHm);
    return Math.min(1, Math.max(0, (minutes - start) / (end - start)));
  }
  return null;
}

export function minutesIntoActiveSession(now: Date = new Date()): number | null {
  const session = inferScannerSession(now);
  const bounds = scannerSessionBounds(now);
  const minutes = minutesFromHm(nyHm(now));
  if (session === "premarket") return minutes - minutesFromHm("0400");
  if (session === "regular") return minutes - minutesFromHm("0930");
  if (session === "afterhours") return minutes - minutesFromHm(bounds.regularCloseHm);
  return null;
}

export function inferSessionPreset(now: Date = new Date()): ScannerSessionPreset {
  const session = inferScannerSession(now);
  if (session === "premarket" || session === "overnight") return "premarket";
  if (session === "afterhours" || session === "closed") return "after_hours";
  const minutes = minutesIntoActiveSession(now) ?? 0;
  if (minutes < 30) return "open";
  const bounds = scannerSessionBounds(now);
  const regularLength =
    minutesFromHm(bounds.regularCloseHm) - minutesFromHm("0930");
  if (minutes >= regularLength - 60) return "power_hour";
  return "midday";
}

export function readScannerClock(now: Date = new Date()): ScannerSessionClock {
  const bounds = scannerSessionBounds(now);
  return {
    now,
    session: inferScannerSession(now),
    sessionDate: bounds.sessionDate,
    isTradingDay: bounds.isTradingDay,
    isEarlyClose: bounds.isEarlyClose,
    regularCloseHm: bounds.regularCloseHm,
    afterHoursCloseHm: bounds.afterHoursCloseHm,
    minutesIntoSession: minutesIntoActiveSession(now),
    sessionElapsed: sessionElapsedFraction(now),
    preset: inferSessionPreset(now),
  };
}

export function sessionResetKey(now: Date = new Date()): string {
  const clock = readScannerClock(now);
  return `${clock.sessionDate}:${clock.session}`;
}

export function nyWallClock(now: Date, hm: string): Date {
  const date = nyDate(now);
  const hour = hm.slice(0, 2);
  const minute = hm.slice(2, 4);
  return fromZonedTime(`${date}T${hour}:${minute}:00`, NY_TZ);
}

export function scannerCadenceSeconds(
  session: ExtendedMarketSession,
  env: {
    SCANNER_REFRESH_OPEN_SECONDS: number;
    SCANNER_REFRESH_EXTENDED_SECONDS: number;
    SCANNER_REFRESH_CLOSED_SECONDS: number;
  },
): number {
  if (session === "regular") return env.SCANNER_REFRESH_OPEN_SECONDS;
  if (session === "premarket" || session === "afterhours") {
    return env.SCANNER_REFRESH_EXTENDED_SECONDS;
  }
  return env.SCANNER_REFRESH_CLOSED_SECONDS;
}

export function isScannerMonitorWindow(now: Date = new Date()): boolean {
  if (!isNyseTradingDayNy(now)) return false;
  const hm = nyHm(now);
  const bounds = scannerSessionBounds(now);
  return hm >= "0400" && hm < bounds.afterHoursCloseHm;
}
