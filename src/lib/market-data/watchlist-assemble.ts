import { percentChange } from "@/lib/domain/market-math";
import type { DailyClose } from "@/lib/market-data/earnings/history-types";
import { toCanonicalSymbol, toYahooSymbol } from "@/lib/market-data/earnings/symbols";
import type {
  DashboardWatchlistRow,
  WatchlistEnrichment,
  WatchlistQuoteInput,
  WatchlistQuoteSource,
  WatchlistSymbolDiagnostic,
} from "@/lib/market-data/watchlist-types";

export function lookupWatchlistMap<T>(
  map: Map<string, T>,
  ticker: string,
): T | undefined {
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed) return undefined;
  const canonical = toCanonicalSymbol(trimmed) ?? trimmed;
  return (
    map.get(trimmed) ??
    map.get(canonical) ??
    map.get(toYahooSymbol(trimmed))
  );
}

function roundPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function roundRvol(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function weekAgoClose(closes: DailyClose[]): number | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const bar = sorted.at(-6);
  return bar && Number.isFinite(bar.close) ? bar.close : null;
}

export function assembleWatchlistRows(
  symbols: string[],
  quotes: Map<string, WatchlistQuoteInput>,
  enrichment: Map<string, WatchlistEnrichment> = new Map(),
): DashboardWatchlistRow[] {
  return symbols.map((raw) => {
    const ticker = raw.trim().toUpperCase();
    const quote = lookupWatchlistMap(quotes, ticker);
    const extra = lookupWatchlistMap(enrichment, ticker) ?? {};
    const last = quote?.last ?? extra.last ?? extra.lastClose ?? null;
    const open = quote?.open ?? extra.open ?? null;
    const volume = quote?.volume ?? extra.volume ?? null;
    const avgVolume = extra.avgVolume ?? null;
    const changeFromOpenPercent = roundPct(percentChange(last, open));
    const change1dPercent = roundPct(
      quote?.changePercent ??
        extra.changePercent ??
        percentChange(last, extra.previousClose ?? null),
    );
    const change1wPercent = roundPct(percentChange(last, extra.weekAgoClose ?? null));
    const change1mPercent = roundPct(percentChange(last, extra.monthAgoClose ?? null));
    const changeYtdPercent = roundPct(percentChange(last, extra.ytdClose ?? null));
    const relativeVolume =
      volume != null && avgVolume != null && avgVolume !== 0
        ? roundRvol(volume / avgVolume)
        : null;
    const row: DashboardWatchlistRow = {
      ticker,
      name: extra.name ?? null,
      last,
      change1dPercent,
      changeFromOpenPercent,
      change1wPercent,
      change1mPercent,
      changeYtdPercent,
      preMarketChangePercent: roundPct(
        extra.preMarketChangePercent ?? quote?.preMarketChangePercent ?? null,
      ),
      afterHoursChangePercent: roundPct(
        extra.afterHoursChangePercent ?? quote?.afterHoursChangePercent ?? null,
      ),
      relativeVolume,
      marketCap: extra.marketCap ?? null,
      volume,
      avgVolume,
      dayHigh: extra.dayHigh ?? null,
      dayLow: extra.dayLow ?? null,
      priorClose: extra.previousClose ?? null,
      volatility: extra.volatility ?? null,
      missing: [],
    };
    row.missing = missingFields(row);
    return row;
  });
}

function missingFields(row: DashboardWatchlistRow): string[] {
  const missing: string[] = [];
  if (row.last == null) missing.push("last");
  if (row.change1dPercent == null) missing.push("change1d");
  if (row.changeFromOpenPercent == null) missing.push("changeFromOpen");
  if (row.change1wPercent == null) missing.push("change1w");
  if (row.relativeVolume == null) missing.push("rvol");
  if (row.marketCap == null) missing.push("marketCap");
  if (row.volume == null) missing.push("volume");
  return missing;
}

export function watchlistQuotedCount(rows: Array<{ last: number | null }>): number {
  return rows.filter((row) => row.last != null && Number.isFinite(row.last)).length;
}

export function buildWatchlistDiagnostics(
  rows: Array<
    Pick<DashboardWatchlistRow, "ticker" | "last" | "missing"> &
      Partial<Pick<DashboardWatchlistRow, "quoteSource" | "quoteError">>
  >,
  extras: {
    sources?: Map<string, WatchlistQuoteSource>;
    errors?: Map<string, string>;
    yahooStatus?: Map<string, "ok" | "unknown_symbol" | "provider_error">;
  } = {},
): WatchlistSymbolDiagnostic[] {
  return rows.map((row) => {
    const source =
      extras.sources?.get(row.ticker) ??
      row.quoteSource ??
      (row.last == null ? "none" : "tape");
    const yahooStatus = extras.yahooStatus?.get(row.ticker);
    const error = extras.errors?.get(row.ticker) ?? row.quoteError ?? null;
    let reason: WatchlistSymbolDiagnostic["reason"] = "ok";
    if (row.last == null) {
      if (yahooStatus === "provider_error" || (error && source === "none")) {
        reason = "provider_error";
      } else if (yahooStatus === "unknown_symbol") {
        reason = "unknown_symbol";
      } else {
        reason = "unavailable";
      }
    } else if (row.missing.length) {
      reason = "partial";
    }
    return {
      ticker: row.ticker,
      source,
      missing: row.missing,
      reason,
      error,
    };
  });
}
