import type { ExtendedMarketSession } from "@/lib/market-data/schemas";
import {
  CHICAGO_TZ,
  isUsEquityTradingDay,
} from "@/lib/scheduling/chicago-schedule";
import { formatInTimeZone } from "date-fns-tz";

export function inferUsEquitySession(now: Date = new Date()): ExtendedMarketSession {
  if (!isUsEquityTradingDay(now)) return "closed";
  const hm = formatInTimeZone(now, CHICAGO_TZ, "HH:mm");
  const [hStr, mStr] = hm.split(":");
  const minutes = Number(hStr) * 60 + Number(mStr);
  // CT approximations of US equity sessions
  // Overnight: 00:00–03:00 | Premarket: 03:00–08:30 | Regular: 08:30–15:00
  // Afterhours: 15:00–19:00 | Closed: 19:00–24:00
  if (minutes >= 3 * 60 && minutes < 8 * 60 + 30) return "premarket";
  if (minutes >= 8 * 60 + 30 && minutes < 15 * 60) return "regular";
  if (minutes >= 15 * 60 && minutes < 19 * 60) return "afterhours";
  if (minutes < 3 * 60) return "overnight";
  return "closed";
}

export function isExtendedHoursSession(
  session: string | null | undefined,
): boolean {
  return (
    session === "premarket" ||
    session === "overnight" ||
    session === "afterhours"
  );
}
