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
  NormalizedCorporateAction,
  NormalizedInstrument,
  NormalizedMarketStatus,
  NormalizedMoverObservation,
  NormalizedQuoteObservation,
  NormalizedSnapshotObservation,
  ProductSurface,
} from "@/lib/market-data/schemas";
import {
  NormalizedBarObservationSchema,
  NormalizedCorporateActionSchema,
  NormalizedInstrumentSchema,
  NormalizedMarketStatusSchema,
  NormalizedQuoteObservationSchema,
  NormalizedSnapshotObservationSchema,
} from "@/lib/market-data/schemas";

const AggBarSchema = z
  .object({
    o: z.number().nullable().optional(),
    h: z.number().nullable().optional(),
    l: z.number().nullable().optional(),
    c: z.number().nullable().optional(),
    v: z.number().nullable().optional(),
    vw: z.number().nullable().optional(),
    t: z.number().nullable().optional(),
    n: z.number().nullable().optional(),
  })
  .passthrough();

const LastTradeSchema = z
  .object({
    p: z.number().nullable().optional(),
    s: z.number().nullable().optional(),
    t: z.number().nullable().optional(),
    x: z.number().nullable().optional(),
  })
  .passthrough();

const LastQuoteSchema = z
  .object({
    P: z.number().nullable().optional(),
    p: z.number().nullable().optional(),
    S: z.number().nullable().optional(),
    s: z.number().nullable().optional(),
    t: z.number().nullable().optional(),
  })
  .passthrough();

export const MassiveTickerSnapshotSchema = z
  .object({
    ticker: z.string(),
    day: AggBarSchema.optional(),
    min: AggBarSchema.optional(),
    prevDay: AggBarSchema.optional(),
    lastTrade: LastTradeSchema.optional(),
    lastQuote: LastQuoteSchema.optional(),
    fmv: z.number().nullable().optional(),
    todaysChange: z.number().nullable().optional(),
    todaysChangePerc: z.number().nullable().optional(),
    updated: z.number().nullable().optional(),
  })
  .passthrough();

export const MassiveSnapshotsResponseSchema = z.object({
  status: z.string().optional(),
  count: z.number().optional(),
  tickers: z.array(MassiveTickerSnapshotSchema).optional(),
  ticker: MassiveTickerSnapshotSchema.optional(),
});

export const MassiveAggsResponseSchema = z.object({
  status: z.string().optional(),
  ticker: z.string().optional(),
  resultsCount: z.number().optional(),
  results: z.array(AggBarSchema).optional(),
});

export const MassiveMarketStatusSchema = z.object({
  afterHours: z.boolean().optional(),
  earlyHours: z.boolean().optional(),
  market: z.string().optional(),
  serverTime: z.string().optional(),
  exchanges: z.record(z.string(), z.string()).optional(),
});

export const MassiveTickerDetailsSchema = z.object({
  status: z.string().optional(),
  results: z
    .object({
      ticker: z.string(),
      name: z.string().nullable().optional(),
      market: z.string().nullable().optional(),
      locale: z.string().nullable().optional(),
      primary_exchange: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      active: z.boolean().optional(),
      currency_name: z.string().nullable().optional(),
      cik: z.string().nullable().optional(),
      composite_figi: z.string().nullable().optional(),
    })
    .passthrough()
    .optional(),
});

export const MassiveTickersListSchema = z.object({
  status: z.string().optional(),
  results: z
    .array(
      z
        .object({
          ticker: z.string(),
          name: z.string().nullable().optional(),
          market: z.string().nullable().optional(),
          primary_exchange: z.string().nullable().optional(),
          type: z.string().nullable().optional(),
          active: z.boolean().optional(),
          currency_name: z.string().nullable().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export const MassiveDividendSchema = z
  .object({
    id: z.string().optional(),
    ticker: z.string(),
    cash_amount: z.number().nullable().optional(),
    currency: z.string().optional(),
    declaration_date: z.string().nullable().optional(),
    ex_dividend_date: z.string().nullable().optional(),
    pay_date: z.string().nullable().optional(),
    record_date: z.string().nullable().optional(),
    distribution_type: z.string().nullable().optional(),
  })
  .passthrough();

export const MassiveDividendsResponseSchema = z.object({
  status: z.string().optional(),
  results: z.array(MassiveDividendSchema).optional(),
});

export const MassiveSplitSchema = z
  .object({
    id: z.string().optional(),
    ticker: z.string(),
    execution_date: z.string().nullable().optional(),
    split_from: z.number().nullable().optional(),
    split_to: z.number().nullable().optional(),
  })
  .passthrough();

export const MassiveSplitsResponseSchema = z.object({
  status: z.string().optional(),
  results: z.array(MassiveSplitSchema).optional(),
});

export type MassiveNormalizeContext = {
  licenseScopeId: string;
  permittedSurfaces: ProductSurface[];
  retrievalTimestamp?: string;
  marketSession?: ExtendedMarketSession;
  /** Prefer FMV field when present (business plans). */
  preferFmv?: boolean;
  /** Plan may be delayed — set from configuration, not guessed from payload. */
  latencyClass?: LatencyClass;
  feedCoverage?: FeedCoverage;
};

function isoNow(): string {
  return new Date().toISOString();
}

function num(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function nsToIso(ns: number | null | undefined): string | null {
  if (ns == null || !Number.isFinite(ns) || ns <= 0) return null;
  // Massive/Polygon timestamps may be ns or ms
  const ms = ns > 1e14 ? Math.floor(ns / 1e6) : ns;
  return new Date(ms).toISOString();
}

export function resolveMassiveCoverage(ctx: MassiveNormalizeContext): {
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  coverageNotes: string;
} {
  const feedCoverage =
    ctx.feedCoverage ?? (ctx.preferFmv ? "fmv" : "full_market");
  const latencyClass = ctx.latencyClass ?? "realtime";
  const coverageNotes =
    feedCoverage === "fmv"
      ? "Massive FMV/aggregate path — not claimed as tick-level SIP/NBBO unless plan includes it."
      : feedCoverage === "delayed_15m"
        ? "Massive 15-minute delayed stocks data per plan recency."
        : "Massive stocks snapshot/aggregate — coverage depends on configured plan; do not over-claim entitlements.";
  return { feedCoverage, latencyClass, coverageNotes };
}

function meta(ctx: MassiveNormalizeContext, providerTimestamp: string) {
  const cov = resolveMassiveCoverage(ctx);
  return {
    providerName: "massive",
    providerTimestamp,
    retrievalTimestamp: ctx.retrievalTimestamp ?? isoNow(),
    feedCoverage: cov.feedCoverage,
    latencyClass: cov.latencyClass,
    licenseScopeId: ctx.licenseScopeId,
    permittedSurfaces: ctx.permittedSurfaces,
    valueKind: "normalized" as const,
    currency: "USD",
    sourceQuality: "secondary" as const,
    coverageNotes: cov.coverageNotes,
  };
}

export function mapLegacySession(
  session: ExtendedMarketSession,
): "premarket" | "regular" | "afterhours" | "closed" | "unknown" {
  if (session === "overnight") return "premarket";
  return session;
}

export function sessionFromMassiveStatus(raw: {
  afterHours?: boolean;
  earlyHours?: boolean;
  market?: string;
}): ExtendedMarketSession {
  if (raw.earlyHours) return "premarket";
  if (raw.afterHours) return "afterhours";
  const m = (raw.market ?? "").toLowerCase();
  if (m === "open") return "regular";
  if (m === "extended-hours") return "afterhours";
  if (m.includes("early")) return "premarket";
  if (m === "closed") return "closed";
  return "closed";
}

export function normalizeMassiveSnapshot(
  raw: unknown,
  ctx: MassiveNormalizeContext,
): NormalizedSnapshotObservation {
  const snap = MassiveTickerSnapshotSchema.parse(raw);
  const symbol = snap.ticker.toUpperCase();
  const fmv = num(snap.fmv);
  const tradeLast = num(snap.lastTrade?.p);
  const last =
    ctx.preferFmv && fmv != null ? fmv : (tradeLast ?? fmv ?? num(snap.min?.c) ?? num(snap.day?.c));
  const priorClose = num(snap.prevDay?.c);
  const providerTimestamp =
    nsToIso(snap.lastTrade?.t) ??
    nsToIso(snap.updated) ??
    nsToIso(snap.min?.t) ??
    isoNow();

  const changeAbsolute =
    num(snap.todaysChange) ?? absoluteChange(last, priorClose);
  const changePercent =
    num(snap.todaysChangePerc) ?? percentChange(last, priorClose);

  const observation: NormalizedSnapshotObservation = {
    ...meta(ctx, providerTimestamp),
    instrumentId: `massive:${symbol}`,
    ticker: symbol,
    last,
    bid: num(snap.lastQuote?.p),
    ask: num(snap.lastQuote?.P),
    open: num(snap.day?.o),
    high: num(snap.day?.h),
    low: num(snap.day?.l),
    priorClose,
    volume: num(snap.day?.v),
    changeAbsolute,
    changePercent,
    marketSession: ctx.marketSession ?? "closed",
    minuteOpen: num(snap.min?.o),
    minuteHigh: num(snap.min?.h),
    minuteLow: num(snap.min?.l),
    minuteClose: num(snap.min?.c),
    minuteVolume: num(snap.min?.v),
    dailyOpen: num(snap.day?.o),
    dailyHigh: num(snap.day?.h),
    dailyLow: num(snap.day?.l),
    dailyClose: num(snap.day?.c),
    dailyVolume: num(snap.day?.v),
  };
  return NormalizedSnapshotObservationSchema.parse(observation);
}

export function snapshotToQuote(
  snap: NormalizedSnapshotObservation,
): NormalizedQuoteObservation {
  return NormalizedQuoteObservationSchema.parse({ ...snap });
}

export function normalizeMassiveAggBar(
  ticker: string,
  raw: unknown,
  interval: NormalizedBarObservation["interval"],
  ctx: MassiveNormalizeContext,
): NormalizedBarObservation {
  const bar = AggBarSchema.parse(raw);
  const symbol = ticker.toUpperCase();
  const barStart = nsToIso(bar.t) ?? isoNow();
  const close = num(bar.c);
  return NormalizedBarObservationSchema.parse({
    ...meta(ctx, barStart),
    instrumentId: `massive:${symbol}`,
    ticker: symbol,
    interval,
    open: num(bar.o),
    high: num(bar.h),
    low: num(bar.l),
    close,
    volume: num(bar.v),
    barStart,
    marketSession: ctx.marketSession,
  });
}

export function normalizeMassiveMarketStatus(
  raw: unknown,
  ctx: MassiveNormalizeContext,
): NormalizedMarketStatus {
  const status = MassiveMarketStatusSchema.parse(raw);
  const session = sessionFromMassiveStatus(status);
  const asOf = status.serverTime ?? isoNow();
  return NormalizedMarketStatusSchema.parse({
    ...meta(ctx, asOf),
    asOf,
    session,
    isOpen: (status.market ?? "").toLowerCase() === "open",
    nextOpen: null,
    nextClose: null,
    rawMarket: status.market,
    marketSession: session,
  });
}

export function normalizeMassiveInstrument(
  raw: unknown,
  ctx: MassiveNormalizeContext,
): NormalizedInstrument {
  const row = z
    .object({
      ticker: z.string(),
      name: z.string().nullable().optional(),
      primary_exchange: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      active: z.boolean().optional(),
      currency_name: z.string().nullable().optional(),
      cik: z.string().nullable().optional(),
      composite_figi: z.string().nullable().optional(),
    })
    .passthrough()
    .parse(raw);
  const ticker = row.ticker.toUpperCase();
  return NormalizedInstrumentSchema.parse({
    ...meta(ctx, isoNow()),
    instrumentId: `massive:${ticker}`,
    ticker,
    name: row.name ?? null,
    exchange: row.primary_exchange ?? null,
    assetClass: row.type ?? "equity",
    currency: (row.currency_name ?? "USD").toUpperCase().slice(0, 3) || "USD",
    active: row.active,
    figi: row.composite_figi ?? null,
    cik: row.cik ?? null,
  });
}

export function normalizeMassiveDividend(
  raw: unknown,
  ctx: MassiveNormalizeContext,
): NormalizedCorporateAction {
  const d = MassiveDividendSchema.parse(raw);
  return NormalizedCorporateActionSchema.parse({
    ...meta(ctx, d.ex_dividend_date ?? isoNow()),
    id: d.id ?? `div:${d.ticker}:${d.ex_dividend_date ?? "unknown"}`,
    ticker: d.ticker.toUpperCase(),
    actionType: "dividend",
    exDate: d.ex_dividend_date ?? undefined,
    payDate: d.pay_date ?? undefined,
    recordDate: d.record_date ?? undefined,
    declarationDate: d.declaration_date ?? undefined,
    cashAmount: num(d.cash_amount),
    details: { distribution_type: d.distribution_type, currency: d.currency },
  });
}

export function normalizeMassiveSplit(
  raw: unknown,
  ctx: MassiveNormalizeContext,
): NormalizedCorporateAction {
  const s = MassiveSplitSchema.parse(raw);
  return NormalizedCorporateActionSchema.parse({
    ...meta(ctx, s.execution_date ?? isoNow()),
    id: s.id ?? `split:${s.ticker}:${s.execution_date ?? "unknown"}`,
    ticker: s.ticker.toUpperCase(),
    actionType: "split",
    exDate: s.execution_date ?? undefined,
    splitFrom: num(s.split_from),
    splitTo: num(s.split_to),
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

export const MASSIVE_TIMESPAN: Record<
  NormalizedBarObservation["interval"],
  { multiplier: number; timespan: string }
> = {
  "1m": { multiplier: 1, timespan: "minute" },
  "5m": { multiplier: 5, timespan: "minute" },
  "15m": { multiplier: 15, timespan: "minute" },
  "1h": { multiplier: 1, timespan: "hour" },
  "1d": { multiplier: 1, timespan: "day" },
};
