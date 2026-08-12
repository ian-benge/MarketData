import type { DailyClose, HistoricalQuarter } from "@/lib/market-data/earnings/history-types";

function closeOnOrBefore(bars: DailyClose[], date: string): DailyClose | null {
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = bars[index]!;
    if (bar.date <= date) return bar;
  }
  return null;
}

function firstCloseAfter(bars: DailyClose[], date: string): DailyClose | null {
  return bars.find((bar) => bar.date > date) ?? null;
}

function nthCloseAfter(bars: DailyClose[], date: string, n: number): DailyClose | null {
  const start = bars.findIndex((bar) => bar.date > date);
  if (start < 0) return null;
  return bars[start + n - 1] ?? null;
}

function movePercent(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return Number.NaN;
  return Math.round(((to - from) / Math.abs(from)) * 1000) / 10;
}

/**
 * Close-to-close reaction.
 * BMO/RTH: print hits the same session — pre = prior close, next = report-date close.
 * AMC/unknown: print is after the close — pre = report-date close, next = following session.
 */
export function attachPriceReactions(
  quarters: HistoricalQuarter[],
  bars: DailyClose[],
): HistoricalQuarter[] {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  return quarters.map((quarter) => {
    if (!quarter.reportDate || !sorted.length) return quarter;
    const report = quarter.reportDate;
    const sameDay = sorted.find((bar) => bar.date === report) ?? null;
    const prior = closeOnOrBefore(
      sorted.filter((bar) => bar.date < report),
      report,
    );
    const bmo = quarter.session === "bmo" || quarter.session === "during";
    const pre = bmo ? prior : (sameDay ?? prior);
    const next = bmo ? (sameDay ?? firstCloseAfter(sorted, report)) : firstCloseAfter(sorted, report);
    const five = bmo
      ? nthCloseAfter(sorted, prior?.date ?? report, 5)
      : nthCloseAfter(sorted, report, 5);
    const nextPct =
      pre && next ? movePercent(pre.close, next.close) : Number.NaN;
    const fivePct =
      pre && five ? movePercent(pre.close, five.close) : Number.NaN;
    return {
      ...quarter,
      reactionNextPercent: Number.isFinite(nextPct) ? nextPct : null,
      reactionFiveDayPercent: Number.isFinite(fivePct) ? fivePct : null,
      missing: quarter.missing.filter(
        (field) => field !== "reactionNext" && field !== "reactionFiveDay",
      ).concat([
        ...(Number.isFinite(nextPct) ? [] : ["reactionNext"]),
        ...(Number.isFinite(fivePct) ? [] : ["reactionFiveDay"]),
      ]),
    };
  });
}
