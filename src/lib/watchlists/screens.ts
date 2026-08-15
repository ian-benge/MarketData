import type { CoverageCatalyst, CoverageQuote } from "./types";
import type { ScreenKey } from "./taxonomy";

const OIL_UNIVERSE = new Set([
  "XLE",
  "XOP",
  "USO",
  "XOM",
  "CVX",
  "COP",
  "OXY",
  "MPC",
  "VLO",
  "PSX",
  "FANG",
  "DVN",
  "APA",
  "EOG",
  "HES",
  "MRO",
  "HAL",
  "SLB",
  "BKR",
  "CTRA",
  "EQT",
  "AR",
  "RRC",
  "SWN",
  "SM",
  "PR",
  "MTDR",
  "CHRD",
  "CIVI",
  "LNG",
  "KMI",
  "WMB",
  "TRGP",
  "ET",
  "EPD",
]);

export function chicagoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addChicagoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function inUniverse(ticker: string, universe?: string[]) {
  if (!universe?.length) return true;
  return universe.includes(ticker);
}

function earningsDatesFrom(
  catalysts: CoverageCatalyst[] | undefined,
  extra?: Map<string, string>,
): Map<string, string> {
  const map = extra ? new Map(extra) : new Map<string, string>();
  for (const item of catalysts ?? []) {
    if (item.kind !== "earnings" || !item.at) continue;
    const ticker = item.ticker.toUpperCase();
    if (!map.has(ticker)) map.set(ticker, item.at.slice(0, 10));
  }
  return map;
}

export function runScreen(
  key: ScreenKey,
  quotes: CoverageQuote[],
  options: {
    universe?: string[];
    catalysts?: CoverageCatalyst[];
    earningsDates?: Map<string, string>;
    now?: Date;
  } = {},
): string[] {
  const universe = options.universe?.map((symbol) => symbol.toUpperCase());
  const pool = quotes.filter((row) => inUniverse(row.ticker, universe));
  const today = chicagoDate(options.now);
  const weekEnd = addChicagoDays(today, 7);
  const earnings = earningsDatesFrom(options.catalysts, options.earningsDates);

  if (key === "premarket_movers") {
    return [...pool]
      .filter(
        (row) =>
          row.preMarketChangePercent != null &&
          Math.abs(row.preMarketChangePercent) >= 1.5,
      )
      .sort(
        (a, b) =>
          Math.abs(b.preMarketChangePercent ?? 0) -
          Math.abs(a.preMarketChangePercent ?? 0),
      )
      .slice(0, 40)
      .map((row) => row.ticker);
  }

  if (key === "relative_volume") {
    return [...pool]
      .filter((row) => row.relativeVolume != null && row.relativeVolume >= 1.8)
      .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))
      .slice(0, 40)
      .map((row) => row.ticker);
  }

  if (key === "unusual_activity") {
    return [...pool]
      .filter(
        (row) =>
          row.flags.includes("rvol") ||
          row.flags.includes("move") ||
          row.flags.includes("peer") ||
          (row.relativeVolume != null && row.relativeVolume >= 1.5),
      )
      .sort((a, b) => {
        const aScore =
          (a.relativeVolume ?? 0) + Math.abs(a.change1dPercent ?? 0) / 2;
        const bScore =
          (b.relativeVolume ?? 0) + Math.abs(b.change1dPercent ?? 0) / 2;
        return bScore - aScore;
      })
      .slice(0, 40)
      .map((row) => row.ticker);
  }

  if (key === "earnings_today") {
    return pool
      .filter((row) => earnings.get(row.ticker) === today)
      .map((row) => row.ticker);
  }

  if (key === "earnings_week") {
    return pool
      .filter((row) => {
        const date = earnings.get(row.ticker);
        return date != null && date >= today && date <= weekEnd;
      })
      .map((row) => row.ticker);
  }

  const xle = quotes.find((row) => row.ticker === "XLE")?.change1dPercent;
  const hurdle =
    xle != null && Number.isFinite(xle) ? Math.max(1.5, Math.abs(xle) * 1.5) : 2;
  return [...pool]
    .filter((row) => {
      if (!OIL_UNIVERSE.has(row.ticker) && universe?.length) {
        return false;
      }
      if (!OIL_UNIVERSE.has(row.ticker) && !universe?.length) return false;
      const move = Math.abs(row.change1dPercent ?? 0);
      const rvol = row.relativeVolume ?? 0;
      const vol = row.volatility ?? 0;
      return move >= hurdle || rvol >= 1.5 || vol >= 35;
    })
    .sort(
      (a, b) => Math.abs(b.change1dPercent ?? 0) - Math.abs(a.change1dPercent ?? 0),
    )
    .slice(0, 40)
    .map((row) => row.ticker);
}

export function symbolsForCollection(
  sector: { screenKey?: string | null; symbols: string[] },
  quotes: CoverageQuote[],
  options: {
    catalysts?: CoverageCatalyst[];
    earningsDates?: Map<string, string>;
    now?: Date;
  } = {},
): string[] {
  if (!sector.screenKey) return sector.symbols;
  return runScreen(sector.screenKey as ScreenKey, quotes, {
    universe: sector.symbols,
    catalysts: options.catalysts,
    earningsDates: options.earningsDates,
    now: options.now,
  });
}
