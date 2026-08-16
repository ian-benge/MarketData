import type { MoveExplanation } from "@/lib/intelligence/types";
import type {
  EnrichedPosition,
  PositionsSnapshot,
} from "@/lib/positions/types";

export type BookImpactContributor = {
  ticker: string;
  side: "long" | "short";
  dayPnl: number | null;
  dayPercent: number | null;
  unexplained: boolean;
};

export type DashboardBookImpact = {
  asOf: string;
  openCount: number;
  quotedCount: number;
  ownerLocked: boolean;
  persistence: PositionsSnapshot["persistence"];
  dayPnl: number | null;
  dayPercent: number | null;
  largestWeight: number | null;
  openTickers: string[];
  contributors: BookImpactContributor[];
  unexplainedTickers: string[];
  error: string | null;
  stale: boolean;
  usingFixtures: boolean;
};

export function isPositionsSnapshot(value: unknown): value is PositionsSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PositionsSnapshot>;
  return Array.isArray(row.positions) && Boolean(row.summary) && typeof row.asOf === "string";
}

const CONTRIBUTOR_CAP = 4;

function unexplainedSet(moves: MoveExplanation[], inBook: Set<string>) {
  const out = new Set<string>();
  for (const move of moves) {
    const ticker = move.ticker.toUpperCase();
    if (!inBook.has(ticker)) continue;
    if (!move.significant) continue;
    if (move.attribution === "unknown") out.add(ticker);
  }
  return out;
}

function openLots(positions: EnrichedPosition[]) {
  return positions.filter((row) => row.status === "open");
}

export function emptyBookImpact(
  error: string | null = null,
  extra?: Partial<DashboardBookImpact>,
): DashboardBookImpact {
  return {
    asOf: extra?.asOf ?? new Date().toISOString(),
    openCount: 0,
    quotedCount: 0,
    ownerLocked: false,
    persistence: "unavailable",
    dayPnl: null,
    dayPercent: null,
    largestWeight: null,
    openTickers: [],
    contributors: [],
    unexplainedTickers: [],
    error,
    stale: Boolean(error),
    usingFixtures: false,
    ...extra,
  };
}

export function compactBookImpact(
  snapshot: PositionsSnapshot,
  moves: MoveExplanation[] = [],
): DashboardBookImpact {
  if (!Array.isArray(snapshot.positions) || !snapshot.summary) {
    return emptyBookImpact("Position blotter payload was incomplete.");
  }
  const open = openLots(snapshot.positions);
  const openTickers = [...new Set(open.map((row) => row.ticker.toUpperCase()))];
  const inBook = new Set(open.map((row) => row.ticker.toUpperCase()));
  const unexplained = unexplainedSet(moves, inBook);
  const locked = snapshot.ownerLocked;
  const ranked = [...open].sort((a, b) => {
    const aScore = Math.abs(a.dayPnl ?? 0) || Math.abs(a.dayPercent ?? 0);
    const bScore = Math.abs(b.dayPnl ?? 0) || Math.abs(b.dayPercent ?? 0);
    if (bScore !== aScore) return bScore - aScore;
    return a.ticker.localeCompare(b.ticker);
  });
  const contributors = ranked.slice(0, CONTRIBUTOR_CAP).map((row) => ({
    ticker: row.ticker.toUpperCase(),
    side: row.side,
    dayPnl: locked ? null : row.dayPnl,
    dayPercent: locked ? null : row.dayPercent,
    unexplained: unexplained.has(row.ticker.toUpperCase()),
  }));

  return {
    asOf: snapshot.asOf,
    openCount: snapshot.summary.openCount,
    quotedCount: snapshot.summary.quotedCount,
    ownerLocked: locked,
    persistence: snapshot.persistence,
    dayPnl: locked ? null : snapshot.summary.dayPnl,
    dayPercent: locked ? null : snapshot.summary.dayPercent,
    largestWeight: locked ? null : snapshot.summary.largestWeight,
    openTickers,
    contributors,
    unexplainedTickers: [...unexplained],
    error: snapshot.error,
    stale: snapshot.stale,
    usingFixtures: snapshot.usingFixtures,
  };
}

export function attachMovesToBookImpact(
  book: DashboardBookImpact,
  moves: MoveExplanation[] = [],
): DashboardBookImpact {
  const inBook = new Set(
    (book.openTickers?.length
      ? book.openTickers
      : book.contributors.map((row) => row.ticker)
    ).map((ticker) => ticker.toUpperCase()),
  );
  const unexplained = [...unexplainedSet(moves, inBook)];
  const flagged = new Set(unexplained);
  return {
    ...book,
    unexplainedTickers: unexplained,
    contributors: book.contributors.map((row) => ({
      ...row,
      unexplained: flagged.has(row.ticker.toUpperCase()),
    })),
  };
}
