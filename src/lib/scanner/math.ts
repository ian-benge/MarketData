import { absoluteChange, percentChange } from "@/lib/domain/market-math";
import type { MinuteBar, NewsFreshnessBucket, ScannerMarketCapCategory } from "./types";

export function relativeVolume(
  volume: number | null | undefined,
  averageVolume: number | null | undefined,
): number | null {
  if (volume == null || averageVolume == null) return null;
  if (!Number.isFinite(volume) || !Number.isFinite(averageVolume)) return null;
  if (averageVolume <= 0) return null;
  return volume / averageVolume;
}

/**
 * Time-of-day adjusted relative volume. Expects sessionElapsed as 0–1 of
 * the typical full-session volume profile. Missing elapsed → unadjusted RVOL.
 */
export function sessionRelativeVolume(
  volume: number | null | undefined,
  averageVolume: number | null | undefined,
  sessionElapsed: number | null | undefined,
): number | null {
  const raw = relativeVolume(volume, averageVolume);
  if (raw == null) return null;
  if (sessionElapsed == null || !Number.isFinite(sessionElapsed) || sessionElapsed <= 0) {
    return raw;
  }
  return raw / Math.min(1, Math.max(sessionElapsed, 0.02));
}

export function dollarVolume(
  last: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  if (last == null || volume == null) return null;
  if (!Number.isFinite(last) || !Number.isFinite(volume)) return null;
  return last * volume;
}

export function floatRotation(
  volume: number | null | undefined,
  floatShares: number | null | undefined,
): number | null {
  if (volume == null || floatShares == null) return null;
  if (!Number.isFinite(volume) || !Number.isFinite(floatShares)) return null;
  if (floatShares <= 0) return null;
  return volume / floatShares;
}

export function spreadFraction(
  bid: number | null | undefined,
  ask: number | null | undefined,
): number | null {
  if (bid == null || ask == null) return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  if (bid <= 0 || ask <= 0 || ask < bid) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return (ask - bid) / mid;
}

export function distanceFromHighPct(
  last: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (last == null || high == null) return null;
  if (!Number.isFinite(last) || !Number.isFinite(high) || high <= 0) return null;
  return ((last - high) / high) * 100;
}

export function newsFreshnessBucket(
  publishedAt: string | null | undefined,
  now: Date,
): NewsFreshnessBucket {
  if (!publishedAt) return "none";
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return "none";
  const hours = (now.getTime() - ts) / 3_600_000;
  if (hours < 0) return "0_2h";
  if (hours <= 2) return "0_2h";
  if (hours <= 12) return "2_12h";
  if (hours <= 24) return "12_24h";
  return "none";
}

export function marketCapCategory(
  marketCap: number | null | undefined,
): ScannerMarketCapCategory {
  if (marketCap == null || !Number.isFinite(marketCap) || marketCap <= 0) {
    return "unknown";
  }
  if (marketCap >= 200_000_000_000) return "mega";
  if (marketCap >= 10_000_000_000) return "large";
  if (marketCap >= 2_000_000_000) return "mid";
  if (marketCap >= 300_000_000) return "small";
  if (marketCap >= 50_000_000) return "micro";
  return "nano";
}

export function typicalVolumeForElapsed(
  averageFullSession: number | null | undefined,
  elapsed: number | null | undefined,
): number | null {
  if (averageFullSession == null || elapsed == null) return null;
  if (!Number.isFinite(averageFullSession) || !Number.isFinite(elapsed)) return null;
  if (averageFullSession <= 0 || elapsed <= 0) return null;
  return averageFullSession * Math.min(1, elapsed);
}

export function fiveMinuteRelativeVolume(
  fiveMinuteVolume: number | null | undefined,
  averageDailyVolume: number | null | undefined,
  barsPerSession = 78,
): number | null {
  if (fiveMinuteVolume == null || averageDailyVolume == null) return null;
  if (!Number.isFinite(fiveMinuteVolume) || !Number.isFinite(averageDailyVolume)) {
    return null;
  }
  if (averageDailyVolume <= 0 || barsPerSession <= 0) return null;
  const typical = averageDailyVolume / barsPerSession;
  if (typical <= 0) return null;
  return fiveMinuteVolume / typical;
}

export function velocityFromBars(
  bars: MinuteBar[],
  windowMinutes: number,
  nowMs?: number,
): number | null {
  if (!bars.length || windowMinutes <= 0) return null;
  const end = nowMs ?? Date.parse(bars[bars.length - 1]!.start);
  if (!Number.isFinite(end)) return null;
  const cutoff = end - windowMinutes * 60_000;
  const inWindow = bars.filter((bar) => {
    const ts = Date.parse(bar.start);
    return Number.isFinite(ts) && ts >= cutoff && ts <= end;
  });
  if (inWindow.length < 1) return null;
  const first = inWindow[0]!.open;
  const last = inWindow[inWindow.length - 1]!.close;
  return percentChange(last, first);
}

export function volumeInWindow(
  bars: MinuteBar[],
  windowMinutes: number,
  nowMs?: number,
): number | null {
  if (!bars.length || windowMinutes <= 0) return null;
  const end = nowMs ?? Date.parse(bars[bars.length - 1]!.start);
  if (!Number.isFinite(end)) return null;
  const cutoff = end - windowMinutes * 60_000;
  let sum = 0;
  let any = false;
  for (const bar of bars) {
    const ts = Date.parse(bar.start);
    if (!Number.isFinite(ts) || ts < cutoff || ts > end) continue;
    if (bar.volume == null || !Number.isFinite(bar.volume)) continue;
    sum += bar.volume;
    any = true;
  }
  return any ? sum : null;
}

export function accelerationFromBars(bars: MinuteBar[], windowMinutes = 5): number | null {
  const recent = velocityFromBars(bars, windowMinutes);
  if (recent == null || bars.length < 2) return null;
  const end = Date.parse(bars[bars.length - 1]!.start);
  if (!Number.isFinite(end)) return null;
  const priorEnd = end - windowMinutes * 60_000;
  const prior = bars.filter((bar) => Date.parse(bar.start) <= priorEnd);
  const previous = velocityFromBars(prior, windowMinutes, priorEnd);
  if (previous == null) return recent;
  return recent - previous;
}

export function sessionVwap(bars: MinuteBar[]): number | null {
  let notional = 0;
  let volume = 0;
  for (const bar of bars) {
    if (bar.volume == null || !Number.isFinite(bar.volume) || bar.volume <= 0) continue;
    const typical = (bar.high + bar.low + bar.close) / 3;
    if (!Number.isFinite(typical)) continue;
    notional += typical * bar.volume;
    volume += bar.volume;
  }
  if (volume <= 0) return null;
  return notional / volume;
}

export function averageTrueRange(dailyBars: MinuteBar[], period = 14): number | null {
  if (dailyBars.length < 2) return null;
  const ranges: number[] = [];
  for (let i = 1; i < dailyBars.length; i += 1) {
    const current = dailyBars[i]!;
    const prev = dailyBars[i - 1]!;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close),
    );
    if (Number.isFinite(tr)) ranges.push(tr);
  }
  if (!ranges.length) return null;
  const slice = ranges.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function isNearHigh(
  last: number | null | undefined,
  high: number | null | undefined,
  withinPct = 0.25,
): boolean {
  const distance = distanceFromHighPct(last, high);
  if (distance == null) return false;
  return distance >= -Math.abs(withinPct);
}

export function isNewHigh(
  last: number | null | undefined,
  high: number | null | undefined,
  previousHigh: number | null | undefined,
  epsilonPct = 0.02,
): boolean {
  if (last == null || high == null || !Number.isFinite(last) || !Number.isFinite(high)) {
    return false;
  }
  if (previousHigh == null || !Number.isFinite(previousHigh) || previousHigh <= 0) {
    return last >= high * (1 - epsilonPct / 100) && isNearHigh(last, high, 0.05);
  }
  return high > previousHigh * (1 + epsilonPct / 100) && isNearHigh(last, high, 0.08);
}

/** Forward split: from 1 → to 4. Reverse split: from 10 → to 1. */
export function isReverseSplit(
  splitFrom: number | null | undefined,
  splitTo: number | null | undefined,
): boolean {
  if (splitFrom == null || splitTo == null) return false;
  if (!Number.isFinite(splitFrom) || !Number.isFinite(splitTo)) return false;
  if (splitFrom <= 0 || splitTo <= 0) return false;
  return splitFrom > splitTo;
}

export function adjustPriceForSplit(
  price: number | null | undefined,
  splitFrom: number,
  splitTo: number,
): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  if (!Number.isFinite(splitFrom) || !Number.isFinite(splitTo) || splitFrom <= 0 || splitTo <= 0) {
    return null;
  }
  return (price * splitFrom) / splitTo;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export { percentChange, absoluteChange };
