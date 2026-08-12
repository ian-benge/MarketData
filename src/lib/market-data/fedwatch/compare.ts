import { calculateMeetings, rangeLabel } from "@/lib/market-data/fedwatch/calc";
import type {
  FedFundsQuote,
  FedWatchCompareRow,
  FedWatchLookback,
  FedWatchLookbackId,
  FedWatchMeeting,
  TargetContext,
} from "@/lib/market-data/fedwatch/types";

export type ZqDailyClose = {
  date: string;
  close: number;
  volume: number | null;
};

export type ZqContractSeries = {
  year: number;
  month: number;
  monthKey: string;
  last: number;
  volume: number | null;
  daily: ZqDailyClose[];
};

const LOOKBACKS: Array<{ id: Exclude<FedWatchLookbackId, "now">; label: string; days: number }> =
  [
    { id: "1d", label: "1 Day", days: 1 },
    { id: "1w", label: "1 Week", days: 7 },
    { id: "1m", label: "1 Month", days: 30 },
  ];

export function isoUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function snapBusinessDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return isoUtcDate(date);
}

export function lookbackTradeDate(now: Date, days: number): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  return snapBusinessDay(isoUtcDate(date));
}

export function closeOnOrBefore(
  daily: ZqDailyClose[],
  iso: string,
): ZqDailyClose | null {
  for (let index = daily.length - 1; index >= 0; index -= 1) {
    const row = daily[index]!;
    if (row.date <= iso) return row;
  }
  return null;
}

export function quotesOnDate(
  series: ZqContractSeries[],
  iso: string,
): FedFundsQuote[] {
  const quotes: FedFundsQuote[] = [];
  for (const contract of series) {
    const hit = closeOnOrBefore(contract.daily, iso);
    if (!hit) continue;
    quotes.push({
      monthKey: contract.monthKey,
      year: contract.year,
      month: contract.month,
      price: hit.close,
      volume: hit.volume,
      openInterest: null,
    });
  }
  return quotes;
}

export function seriesToLatestQuotes(series: ZqContractSeries[]): FedFundsQuote[] {
  return series.map((contract) => ({
    monthKey: contract.monthKey,
    year: contract.year,
    month: contract.month,
    price: contract.last,
    volume: contract.volume,
    openInterest: null,
  }));
}

export function buildCompareRows(
  lookbacks: FedWatchLookback[],
  currentLowerBps: number,
): FedWatchCompareRow[] {
  const lowers = new Set<number>([currentLowerBps]);
  for (const lookback of lookbacks) {
    for (const bin of lookback.bins) lowers.add(bin.lowerBps);
  }
  return [...lowers]
    .sort((a, b) => a - b)
    .map((lowerBps) => ({
      lowerBps,
      upperBps: lowerBps + 25,
      label: rangeLabel(lowerBps),
      current: lowerBps === currentLowerBps,
      values: Object.fromEntries(
        lookbacks.map((lookback) => [
          lookback.id,
          lookback.bins.find((bin) => bin.lowerBps === lowerBps)?.probability ?? 0,
        ]),
      ),
    }));
}

export function attachMeetingHistory(
  meetings: FedWatchMeeting[],
  series: ZqContractSeries[],
  target: TargetContext,
  now = new Date(),
): FedWatchMeeting[] {
  const currentLower = Math.round(target.lowerPct * 100);
  return meetings.map((meeting) => {
    const lookbacks: FedWatchLookback[] = [
      {
        id: "now",
        label: "Now",
        date: isoUtcDate(now),
        bins: meeting.bins,
        ease: meeting.ease,
        hold: meeting.hold,
        hike: meeting.hike,
      },
    ];

    for (const spec of LOOKBACKS) {
      const date = lookbackTradeDate(now, spec.days);
      const quotes = quotesOnDate(series, date);
      const chain = meetings
        .map((item) => item.date)
        .filter((iso) => iso <= meeting.date);
      const computed = calculateMeetings(chain, quotes, target).find(
        (item) => item.date === meeting.date,
      );
      if (!computed) continue;
      lookbacks.push({
        id: spec.id,
        label: spec.label,
        date,
        bins: computed.bins,
        ease: computed.ease,
        hold: computed.hold,
        hike: computed.hike,
      });
    }

    return {
      ...meeting,
      lookbacks,
      compareRows: buildCompareRows(lookbacks, currentLower),
    };
  });
}
