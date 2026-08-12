import { formatInTimeZone } from "date-fns-tz";
import type { BarsRequest } from "@/lib/market-data/schemas";

const DAY_MS = 86_400_000;
const NY_TZ = "America/New_York";
export const CHICAGO_TZ = "America/Chicago";

const INTERVAL_MS: Record<Exclude<NonNullable<BarsRequest["interval"]>, "1d">, number> =
  {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
  };

/** Inclusive start so providers return a full window instead of a single latest bar. */
export function defaultBarsStart(
  interval: NonNullable<BarsRequest["interval"]>,
  limit: number,
): string {
  const n = Math.max(limit, 2);
  if (interval === "1d") {
    return new Date(Date.now() - (n + 21) * DAY_MS).toISOString();
  }
  // Size the window by wall-clock bar width, then pad for nights/weekends.
  // Keep it inside one Alpaca page (10_000) so the latest session is not dropped.
  const spanMs = n * INTERVAL_MS[interval] * 1.6 + 5 * DAY_MS;
  return new Date(Date.now() - spanMs).toISOString();
}

export function chicagoDateKey(iso: string): string {
  return formatInTimeZone(new Date(iso), CHICAGO_TZ, "yyyy-MM-dd");
}

/** U.S. equity regular session: 09:30–16:00 America/New_York, weekdays. */
export function isUsRegularSession(iso: string): boolean {
  const date = new Date(iso);
  const weekday = Number(formatInTimeZone(date, NY_TZ, "i"));
  if (weekday >= 6) return false;
  const hm = formatInTimeZone(date, NY_TZ, "HHmm");
  return hm >= "0930" && hm < "1600";
}

export function sliceLastTradingDays<T extends { barStart: string }>(
  bars: T[],
  tradingDays: number,
  regularSessionOnly = false,
): T[] {
  const filtered = regularSessionOnly
    ? bars.filter((bar) => isUsRegularSession(bar.barStart))
    : bars;
  const usable = filtered.length ? filtered : bars;
  if (tradingDays <= 0 || !usable.length) return [];

  const dates: string[] = [];
  const seen = new Set<string>();
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const key = chicagoDateKey(usable[index]!.barStart);
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push(key);
    if (dates.length === tradingDays) break;
  }
  const keep = new Set(dates);
  return usable.filter((bar) => keep.has(chicagoDateKey(bar.barStart)));
}
