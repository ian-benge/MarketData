import { percentChange } from "@/lib/domain/market-math";
import type { DailyClose } from "@/lib/market-data/earnings/history-types";
import type {
  DashboardWatchlistRow,
  WatchlistEnrichment,
  WatchlistQuoteInput,
} from "@/lib/market-data/watchlist-types";

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
    const quote = quotes.get(ticker);
    const extra = enrichment.get(ticker) ?? {};
    const last = quote?.last ?? null;
    const open = quote?.open ?? null;
    const volume = quote?.volume ?? null;
    const avgVolume = extra.avgVolume ?? null;
    const changeFromOpenPercent = roundPct(percentChange(last, open));
    const change1wPercent = roundPct(percentChange(last, extra.weekAgoClose ?? null));
    const relativeVolume =
      volume != null && avgVolume != null && avgVolume !== 0
        ? roundRvol(volume / avgVolume)
        : null;
    const row: DashboardWatchlistRow = {
      ticker,
      name: extra.name ?? null,
      last,
      change1dPercent: roundPct(quote?.changePercent ?? null),
      changeFromOpenPercent,
      change1wPercent,
      relativeVolume,
      marketCap: extra.marketCap ?? null,
      volume,
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
