import { percentChange } from "@/lib/domain/market-math";
import type { DailyClose } from "@/lib/market-data/earnings/history-types";
import { runScreen } from "./screens";
import type {
  CoverageCatalyst,
  CoverageFlag,
  CoverageMover,
  CoverageQuote,
  CoverageSummary,
  SectorBoardRow,
  CoverageSector,
} from "./types";

export function roundPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (!nums.length) return null;
  return roundPct(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

export function closeSessionsAgo(
  closes: DailyClose[],
  sessions: number,
): number | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const bar = sorted.at(-(sessions + 1));
  return bar && Number.isFinite(bar.close) ? bar.close : null;
}

export function priorYearClose(
  closes: DailyClose[],
  asOf = new Date(),
): number | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
  }).format(asOf);
  const cutoff = `${year}-01-01`;
  const prior = [...sorted].reverse().find((bar) => bar.date < cutoff);
  return prior && Number.isFinite(prior.close)
    ? prior.close
    : sorted[0] && Number.isFinite(sorted[0].close)
      ? sorted[0].close
      : null;
}

export function realizedVolPercent(
  closes: DailyClose[],
  window = 21,
): number | null {
  const sorted = [...closes]
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const slice = sorted.slice(-(window + 1));
  if (slice.length < 6) return null;
  const returns: number[] = [];
  for (let index = 1; index < slice.length; index += 1) {
    const prev = slice[index - 1]!.close;
    const next = slice[index]!.close;
    if (prev <= 0) continue;
    returns.push(Math.log(next / prev));
  }
  if (returns.length < 5) return null;
  const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (returns.length - 1);
  if (!(variance >= 0)) return null;
  return roundPct(Math.sqrt(variance * 252) * 100);
}

export function flagsFor(row: {
  change1dPercent: number | null;
  relativeVolume: number | null;
  vsGroup1dPercent: number | null;
  preMarketChangePercent: number | null;
  afterHoursChangePercent: number | null;
}): CoverageFlag[] {
  const flags: CoverageFlag[] = [];
  const change = row.change1dPercent;
  const rvol = row.relativeVolume;
  const vsGroup = row.vsGroup1dPercent;
  const pre = row.preMarketChangePercent;
  const post = row.afterHoursChangePercent;
  if (rvol != null && rvol >= 1.8) flags.push("rvol");
  if (change != null && Math.abs(change) >= 3) flags.push("move");
  if (vsGroup != null && Math.abs(vsGroup) >= 2.5) flags.push("peer");
  if (
    (pre != null && Math.abs(pre) >= 1.5) ||
    (post != null && Math.abs(post) >= 1.5)
  ) {
    flags.push("extended");
  }
  if (vsGroup != null && change != null && vsGroup >= 1.5 && change > 0) {
    flags.push("leader");
  }
  if (vsGroup != null && change != null && vsGroup <= -1.5 && change < 0) {
    flags.push("laggard");
  }
  return flags;
}

export function capWeight1d(rows: CoverageQuote[]): number | null {
  let weighted = 0;
  let cap = 0;
  for (const row of rows) {
    if (row.change1dPercent == null || row.marketCap == null || row.marketCap <= 0) {
      continue;
    }
    weighted += row.change1dPercent * row.marketCap;
    cap += row.marketCap;
  }
  return cap > 0 ? roundPct(weighted / cap) : null;
}

export function dataQualityFor(rows: CoverageQuote[]): CoverageSummary["dataQuality"] {
  if (!rows.length) return "ok";
  const missingShare =
    rows.filter((row) => row.last == null || row.change1dPercent == null).length /
    rows.length;
  const quarantined = rows.filter(
    (row) => row.resolutionStatus === "quarantined",
  ).length;
  if (missingShare >= 0.4 || quarantined >= Math.max(3, rows.length / 3)) {
    return "poor";
  }
  if (missingShare > 0 || quarantined > 0) return "partial";
  return "ok";
}

export function summarizeQuotes(
  rows: CoverageQuote[],
  benchmarkSymbol: string | null = null,
  benchmark1d: number | null = null,
): CoverageSummary {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let missing = 0;
  let unusualCount = 0;
  let quarantinedCount = 0;
  for (const row of rows) {
    if (row.change1dPercent == null) missing += 1;
    else if (row.change1dPercent > 0) advancers += 1;
    else if (row.change1dPercent < 0) decliners += 1;
    else unchanged += 1;
    if (row.flags.some((flag) => flag === "rvol" || flag === "move" || flag === "peer")) {
      unusualCount += 1;
    }
    if (row.resolutionStatus === "quarantined") quarantinedCount += 1;
  }
  const decided = advancers + decliners;
  const avg1dPercent = mean(rows.map((row) => row.change1dPercent));
  return {
    nameCount: rows.length,
    quotedCount: rows.filter((row) => row.last != null).length,
    advancers,
    decliners,
    unchanged,
    missing,
    avg1dPercent,
    avg1wPercent: mean(rows.map((row) => row.change1wPercent)),
    avg1mPercent: mean(rows.map((row) => row.change1mPercent)),
    avgYtdPercent: mean(rows.map((row) => row.changeYtdPercent)),
    capWeight1dPercent: capWeight1d(rows),
    vsBenchmark1dPercent: relativeTo(avg1dPercent, benchmark1d),
    breadth: decided ? roundPct((advancers / decided) * 100) : null,
    unusualCount,
    quarantinedCount,
    dataQuality: dataQualityFor(rows),
    benchmarkSymbol,
  };
}

export function moversFrom(
  rows: CoverageQuote[],
  direction: "up" | "down" | "unusual",
  limit = 5,
): CoverageMover[] {
  const ranked = [...rows];
  if (direction === "unusual") {
    ranked.sort((a, b) => {
      const aScore =
        (a.relativeVolume ?? 0) + Math.abs(a.change1dPercent ?? 0) / 2;
      const bScore =
        (b.relativeVolume ?? 0) + Math.abs(b.change1dPercent ?? 0) / 2;
      return bScore - aScore;
    });
  } else {
    ranked.sort((a, b) => {
      const aVal = a.change1dPercent ?? (direction === "up" ? -Infinity : Infinity);
      const bVal = b.change1dPercent ?? (direction === "up" ? -Infinity : Infinity);
      return direction === "up" ? bVal - aVal : aVal - bVal;
    });
  }
  const filtered =
    direction === "unusual"
      ? ranked.filter(
          (row) =>
            row.flags.includes("rvol") ||
            row.flags.includes("move") ||
            row.flags.includes("peer") ||
            (row.relativeVolume != null && row.relativeVolume >= 1.5),
        )
      : ranked.filter((row) => row.change1dPercent != null);
  return filtered.slice(0, limit).map((row) => ({
    ticker: row.ticker,
    name: row.name,
    changePercent: row.change1dPercent,
    relativeVolume: row.relativeVolume,
    flags: row.flags,
  }));
}

export function relativeTo(
  value: number | null,
  benchmark: number | null,
): number | null {
  if (value == null || benchmark == null) return null;
  return roundPct(value - benchmark);
}

export function equalWeight(
  rows: CoverageQuote[],
  key: keyof Pick<
    CoverageQuote,
    | "change1dPercent"
    | "change1wPercent"
    | "change1mPercent"
    | "changeYtdPercent"
  >,
): number | null {
  return mean(rows.map((row) => row[key]));
}

export function buildSectorBoard(
  sectors: CoverageSector[],
  quotes: Map<string, CoverageQuote>,
  spy1d: number | null,
  catalysts: CoverageCatalyst[] = [],
): SectorBoardRow[] {
  const quoted = [...quotes.values()];
  return sectors
    .filter((sector) => !sector.archivedAt)
    .map((sector) => {
      const members = sector.screenKey
        ? runScreen(sector.screenKey, quoted, {
            universe: sector.symbols,
            catalysts,
          })
        : sector.symbols;
      const rows = members
        .map((ticker) => quotes.get(ticker))
        .filter((row): row is CoverageQuote => row != null);
      const avg1d = equalWeight(rows, "change1dPercent");
      const ranked = [...rows]
        .filter((row) => row.change1dPercent != null)
        .sort(
          (a, b) => (b.change1dPercent ?? 0) - (a.change1dPercent ?? 0),
        );
      const benchmark = sector.benchmarkSymbol?.toUpperCase() ?? "SPY";
      const benchmark1d = quotes.get(benchmark)?.change1dPercent ?? spy1d;
      const summary = summarizeQuotes(rows, benchmark, benchmark1d);
      return {
        id: sector.id,
        name: sector.name,
        slug: sector.slug,
        kind: sector.kind,
        navGroup: sector.navGroup,
        parentId: sector.parentId,
        symbolCount: members.length,
        quotedCount: rows.filter((row) => row.last != null).length,
        avg1dPercent: avg1d,
        avg1wPercent: equalWeight(rows, "change1wPercent"),
        avg1mPercent: equalWeight(rows, "change1mPercent"),
        avgYtdPercent: equalWeight(rows, "changeYtdPercent"),
        vsSpy1dPercent: relativeTo(avg1d, spy1d),
        vsBenchmark1dPercent: relativeTo(avg1d, benchmark1d),
        breadth: summary.breadth,
        leaders: ranked.slice(0, 3).map((row) => row.ticker),
        laggards: ranked.slice(-3).reverse().map((row) => row.ticker),
        unusualCount: summary.unusualCount,
        screenKey: sector.screenKey,
        benchmarkSymbol: sector.benchmarkSymbol,
        dataQuality: summary.dataQuality,
      };
    })
    .sort((a, b) => (b.avg1dPercent ?? -999) - (a.avg1dPercent ?? -999));
}

export function attachRelativeStrength(
  rows: CoverageQuote[],
  spy1d: number | null,
  group1dByTicker: Map<string, number | null>,
  benchmark1d: number | null = spy1d,
): CoverageQuote[] {
  return rows.map((row) => {
    const vsSpy1dPercent = relativeTo(row.change1dPercent, spy1d);
    const vsBenchmark1dPercent = relativeTo(row.change1dPercent, benchmark1d);
    const vsGroup1dPercent = relativeTo(
      row.change1dPercent,
      group1dByTicker.get(row.ticker) ?? null,
    );
    const next: CoverageQuote = {
      ...row,
      vsSpy1dPercent,
      vsBenchmark1dPercent,
      vsGroup1dPercent,
    };
    next.flags = flagsFor(next);
    return next;
  });
}

export { percentChange };
