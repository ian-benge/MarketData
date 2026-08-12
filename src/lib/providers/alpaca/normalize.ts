import { z } from "zod";
import {
  absoluteChange,
  percentChange,
} from "@/lib/domain/market-math";
import type {
  ExtendedMarketSession,
  FeedCoverage,
  LatencyClass,
  NormalizedBarObservation,
  NormalizedMoverObservation,
  NormalizedQuoteObservation,
  NormalizedSnapshotObservation,
  ProductSurface,
} from "@/lib/market-data/schemas";
import {
  NormalizedBarObservationSchema,
  NormalizedQuoteObservationSchema,
  NormalizedSnapshotObservationSchema,
} from "@/lib/market-data/schemas";

const AlpacaTradeSchema = z
  .object({
    t: z.string().optional(),
    px: z.number().optional(),
    p: z.number().optional(),
    s: z.number().optional(),
    x: z.string().optional(),
  })
  .passthrough();

const AlpacaQuoteSchema = z
  .object({
    t: z.string().optional(),
    bp: z.number().optional(),
    ap: z.number().optional(),
    bs: z.number().optional(),
    as: z.number().optional(),
  })
  .passthrough();

const AlpacaBarSchema = z
  .object({
    t: z.string(),
    o: z.number().nullable().optional(),
    h: z.number().nullable().optional(),
    l: z.number().nullable().optional(),
    c: z.number().nullable().optional(),
    v: z.number().nullable().optional(),
    n: z.number().nullable().optional(),
    vw: z.number().nullable().optional(),
  })
  .passthrough();

export const AlpacaSnapshotSchema = z
  .object({
    latestTrade: AlpacaTradeSchema.nullable().optional(),
    latestQuote: AlpacaQuoteSchema.nullable().optional(),
    minuteBar: AlpacaBarSchema.nullable().optional(),
    dailyBar: AlpacaBarSchema.nullable().optional(),
    prevDailyBar: AlpacaBarSchema.nullable().optional(),
  })
  .passthrough();

export const AlpacaSnapshotsResponseSchema = z.record(
  z.string(),
  AlpacaSnapshotSchema.nullable(),
);

export const AlpacaBarsResponseSchema = z.object({
  bars: z.array(AlpacaBarSchema).nullable().optional(),
  symbol: z.string().optional(),
  next_page_token: z.string().nullable().optional(),
});

export const AlpacaMultiBarsResponseSchema = z.object({
  bars: z
    .record(z.string(), z.array(AlpacaBarSchema).nullable())
    .optional(),
  next_page_token: z.string().nullable().optional(),
});

export const AlpacaClockSchema = z.object({
  timestamp: z.string(),
  is_open: z.boolean(),
  next_open: z.string(),
  next_close: z.string(),
});

export type AlpacaNormalizeContext = {
  feed: "iex" | "sip";
  licenseScopeId: string;
  permittedSurfaces: ProductSurface[];
  retrievalTimestamp?: string;
  marketSession?: ExtendedMarketSession;
};

function isoNow(): string {
  return new Date().toISOString();
}

function num(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

export function feedCoverageFromAlpacaFeed(feed: "iex" | "sip"): FeedCoverage {
  return feed;
}

export function latencyClassForAlpacaFeed(feed: "iex" | "sip"): LatencyClass {
  void feed;
  return "realtime";
}

export function coverageNotesForFeed(feed: "iex" | "sip"): string {
  if (feed === "iex") {
    return "Alpaca real-time IEX (single-exchange) — not SIP, not NBBO, not full-market consolidated volume.";
  }
  return "Alpaca real-time SIP consolidated feed when account is entitled.";
}

export function mapLegacySession(
  session: ExtendedMarketSession,
): "premarket" | "regular" | "afterhours" | "closed" | "unknown" {
  if (session === "overnight") return "premarket";
  return session;
}

export function sessionFromAlpacaClock(raw: {
  is_open: boolean;
  timestamp: string;
}): ExtendedMarketSession {
  if (raw.is_open) return "regular";
  // Without calendar segments, treat closed clock as closed (extended sessions
  // are labeled by callers when known).
  const hourEt = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).formatToParts(new Date(raw.timestamp));
      const h = parts.find((p) => p.type === "hour")?.value;
      return h != null ? Number(h) : null;
    } catch {
      return null;
    }
  })();
  if (hourEt == null) return "closed";
  if (hourEt >= 4 && hourEt < 9) return "premarket";
  if (hourEt >= 16 && hourEt < 20) return "afterhours";
  if (hourEt >= 20 || hourEt < 4) return "overnight";
  return "closed";
}

function meta(ctx: AlpacaNormalizeContext, providerTimestamp: string) {
  return {
    providerName: "alpaca",
    providerTimestamp,
    retrievalTimestamp: ctx.retrievalTimestamp ?? isoNow(),
    feedCoverage: feedCoverageFromAlpacaFeed(ctx.feed),
    latencyClass: latencyClassForAlpacaFeed(ctx.feed),
    licenseScopeId: ctx.licenseScopeId,
    permittedSurfaces: ctx.permittedSurfaces,
    valueKind: "normalized" as const,
    currency: "USD",
    sourceQuality: "secondary" as const,
    coverageNotes: coverageNotesForFeed(ctx.feed),
  };
}

export function normalizeAlpacaSnapshot(
  ticker: string,
  raw: unknown,
  ctx: AlpacaNormalizeContext,
): NormalizedSnapshotObservation | null {
  if (raw == null) return null;
  const snap = AlpacaSnapshotSchema.parse(raw);
  const symbol = ticker.toUpperCase();
  const last = num(snap.latestTrade?.p ?? snap.latestTrade?.px);
  const priorClose = num(snap.prevDailyBar?.c);
  const open = num(snap.dailyBar?.o);
  const high = num(snap.dailyBar?.h);
  const low = num(snap.dailyBar?.l);
  const volume = num(snap.dailyBar?.v);
  const bid = num(snap.latestQuote?.bp);
  const ask = num(snap.latestQuote?.ap);
  const providerTimestamp =
    snap.latestTrade?.t ??
    snap.latestQuote?.t ??
    snap.minuteBar?.t ??
    snap.dailyBar?.t ??
    isoNow();
  const marketSession: ExtendedMarketSession = ctx.marketSession ?? "closed";

  const observation: NormalizedSnapshotObservation = {
    ...meta(ctx, providerTimestamp),
    instrumentId: `alpaca:${symbol}`,
    ticker: symbol,
    last,
    bid,
    ask,
    open,
    high,
    low,
    priorClose,
    volume,
    changeAbsolute: absoluteChange(last, priorClose),
    changePercent: percentChange(last, priorClose),
    marketSession,
    minuteOpen: num(snap.minuteBar?.o),
    minuteHigh: num(snap.minuteBar?.h),
    minuteLow: num(snap.minuteBar?.l),
    minuteClose: num(snap.minuteBar?.c),
    minuteVolume: num(snap.minuteBar?.v),
    dailyOpen: open,
    dailyHigh: high,
    dailyLow: low,
    dailyClose: num(snap.dailyBar?.c),
    dailyVolume: volume,
  };
  return NormalizedSnapshotObservationSchema.parse(observation);
}

export function snapshotToQuote(
  snap: NormalizedSnapshotObservation,
): NormalizedQuoteObservation {
  return NormalizedQuoteObservationSchema.parse({
    ...snap,
  });
}

export function normalizeAlpacaBar(
  ticker: string,
  raw: unknown,
  interval: NormalizedBarObservation["interval"],
  ctx: AlpacaNormalizeContext,
): NormalizedBarObservation {
  const bar = AlpacaBarSchema.parse(raw);
  const symbol = ticker.toUpperCase();
  const close = num(bar.c);
  return NormalizedBarObservationSchema.parse({
    ...meta(ctx, bar.t),
    instrumentId: `alpaca:${symbol}`,
    ticker: symbol,
    interval,
    open: num(bar.o),
    high: num(bar.h),
    low: num(bar.l),
    close,
    volume: num(bar.v),
    barStart: bar.t,
    marketSession: ctx.marketSession,
  });
}

export function snapshotsToMovers(
  snapshots: NormalizedSnapshotObservation[],
  direction: "up" | "down" | "both",
  limit: number,
): NormalizedMoverObservation[] {
  let movers: NormalizedMoverObservation[] = snapshots.map((s) => {
    const changePercent = s.changePercent;
    const dir: "up" | "down" =
      changePercent != null && changePercent < 0 ? "down" : "up";
    return {
      ...s,
      name: s.ticker,
      changeAbsolute: s.changeAbsolute ?? null,
      changePercent: changePercent ?? null,
      direction: dir,
      valueKind: "derived" as const,
    };
  });

  if (direction === "up") movers = movers.filter((m) => m.direction === "up");
  if (direction === "down")
    movers = movers.filter((m) => m.direction === "down");

  movers.sort(
    (a, b) =>
      Math.abs(b.changePercent ?? Number.NEGATIVE_INFINITY) -
      Math.abs(a.changePercent ?? Number.NEGATIVE_INFINITY),
  );
  return movers.slice(0, limit);
}

export const ALPACA_TIMEFRAME: Record<
  NormalizedBarObservation["interval"],
  string
> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "1h": "1Hour",
  "1d": "1Day",
};
