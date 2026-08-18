import { looksUnmovedFromClose, mergeBarSeries } from "@/lib/market-data/extended-hours";
import type { YahooEquityQuote, YahooIntradayBar } from "@/lib/market-data/earnings/types";
import type { ExtendedMarketSession, LatencyClass } from "@/lib/market-data/schemas";
import type { MinuteBar } from "./types";

export type BlendedScannerPrint = {
  last: number | null;
  high: number | null;
  volume: number | null;
  notes: string[];
  usedYahooLast: boolean;
  latencyClass: LatencyClass;
};

function maxNum(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

function coalesceVolume(
  ...candidates: Array<number | null | undefined>
): number | null {
  for (const value of candidates) {
    if (value != null) return value;
  }
  return null;
}

/**
 * Free-stack print picker: Alpaca IEX is the only no-cost realtime tape.
 * IEX extended-hours prints are sparse, so Yahoo pre/post last fills the gap
 * and is labeled delayed/unofficial — never as SIP.
 */
export function blendScannerPrint(input: {
  session: ExtendedMarketSession;
  last: number | null;
  high: number | null;
  volume: number | null;
  priorClose: number | null;
  yahoo?: YahooEquityQuote | null;
  primaryLatency: LatencyClass;
}): BlendedScannerPrint {
  const yahoo = input.yahoo;
  const notes: string[] = [];
  if (!yahoo) {
    return {
      last: input.last,
      high: input.high,
      volume: input.volume,
      notes,
      usedYahooLast: false,
      latencyClass: input.primaryLatency,
    };
  }

  const iexIdle = looksUnmovedFromClose(input.last, input.priorClose);
  const preLast =
    yahoo.preMarketPrice ??
    (yahoo.marketState === "PRE" || yahoo.marketState === "PREPRE" ? yahoo.price : null);
  const postLast =
    yahoo.postMarketPrice ??
    (yahoo.marketState === "POST" || yahoo.marketState === "POSTPOST" ? yahoo.price : null);

  if (input.session === "premarket" || input.session === "overnight") {
    if (preLast != null && (iexIdle || input.last == null)) {
      notes.push(
        "Premarket last from Yahoo (unofficial). IEX had no usable extended print.",
      );
      return {
        last: preLast,
        high: maxNum(input.high, preLast),
        volume: coalesceVolume(yahoo.preMarketVolume, yahoo.volume, input.volume),
        notes,
        usedYahooLast: true,
        latencyClass: "delayed_15m",
      };
    }
    if (!iexIdle && input.last != null) {
      notes.push("Premarket last from IEX realtime when an IEX print exists.");
    }
    return {
      last: input.last ?? preLast,
      high: maxNum(input.high, preLast ?? input.last),
      volume: coalesceVolume(input.volume, yahoo.preMarketVolume, yahoo.volume),
      notes,
      usedYahooLast: false,
      latencyClass: input.primaryLatency,
    };
  }

  if (input.session === "afterhours") {
    if (postLast != null && (iexIdle || input.last == null)) {
      notes.push(
        "After-hours last from Yahoo (unofficial). IEX had no usable extended print.",
      );
      return {
        last: postLast,
        high: maxNum(input.high, postLast),
        volume: coalesceVolume(yahoo.volume, input.volume),
        notes,
        usedYahooLast: true,
        latencyClass: "delayed_15m",
      };
    }
    return {
      last: input.last ?? postLast,
      high: maxNum(input.high, postLast ?? input.last),
      volume: coalesceVolume(input.volume, yahoo.volume),
      notes,
      usedYahooLast: false,
      latencyClass: input.primaryLatency,
    };
  }

  if (iexIdle && yahoo.price != null && !looksUnmovedFromClose(yahoo.price, input.priorClose)) {
    notes.push(
      "IEX still showed prior close; regular-session last filled from Yahoo (delayed/unofficial).",
    );
    return {
      last: yahoo.price,
      high: maxNum(input.high, yahoo.dayHigh ?? yahoo.price),
      volume: coalesceVolume(yahoo.volume, input.volume),
      notes,
      usedYahooLast: true,
      latencyClass: "delayed_15m",
    };
  }

  return {
    last: input.last ?? yahoo.price,
    high: maxNum(input.high, yahoo.dayHigh ?? input.last),
    volume: coalesceVolume(input.volume, yahoo.volume),
    notes,
    usedYahooLast: false,
    latencyClass: input.primaryLatency,
  };
}

export function yahooBarsToMinute(bars: YahooIntradayBar[]): MinuteBar[] {
  return bars.map((bar) => ({
    start: bar.barStart,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

export function mergeMinuteBars(
  primary: MinuteBar[],
  extra: MinuteBar[],
  limit = 90,
): MinuteBar[] {
  const keyedPrimary = primary.map((bar) => ({ ...bar, barStart: bar.start }));
  const keyedExtra = extra.map((bar) => ({ ...bar, barStart: bar.start }));
  return mergeBarSeries(keyedPrimary, keyedExtra, 60_000)
    .map((bar) => ({
      start: bar.barStart,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? null,
    }))
    .slice(-limit);
}
