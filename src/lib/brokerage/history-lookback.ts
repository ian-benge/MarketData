import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";

export const HISTORY_LOOKBACKS = ["1d", "1w", "1m", "all"] as const;
export type HistoryLookback = (typeof HISTORY_LOOKBACKS)[number];

export const HISTORY_LOOKBACK_LABELS: Record<HistoryLookback, string> = {
  "1d": "1 day",
  "1w": "1 week",
  "1m": "1 month",
  all: "All history",
};

export function isHistoryLookback(value: unknown): value is HistoryLookback {
  return (
    typeof value === "string" &&
    (HISTORY_LOOKBACKS as readonly string[]).includes(value)
  );
}

/** Inclusive Chicago calendar start for SnapTrade `startDate`. `all` has no bound. */
export function historyLookbackStart(
  lookback: HistoryLookback,
  now = new Date(),
): string | null {
  if (lookback === "all") return null;
  const today = chicagoDateString(now);
  const noon = fromZonedTime(`${today}T12:00:00`, CHICAGO_TZ);
  if (lookback === "1d") noon.setUTCDate(noon.getUTCDate() - 1);
  else if (lookback === "1w") noon.setUTCDate(noon.getUTCDate() - 7);
  else noon.setUTCMonth(noon.getUTCMonth() - 1);
  return formatInTimeZone(noon, CHICAGO_TZ, "yyyy-MM-dd");
}
