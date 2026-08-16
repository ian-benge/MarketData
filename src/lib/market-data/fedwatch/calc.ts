import {
  daysInUtcMonth,
  formatMeetingLabel,
  hasFomcMeetingInMonth,
  lastBusinessDayOfMonth,
  meetingToContractCode,
  nextMonth,
  parseIsoDate,
  prevMonth,
} from "@/lib/market-data/fedwatch/fomc";
import type {
  FedFundsQuote,
  FedWatchBin,
  FedWatchMeeting,
  FedWatchMoveKind,
  FedWatchTarget,
  TargetContext,
} from "@/lib/market-data/fedwatch/types";

export function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

export function targetFromBounds(lowerPct: number, upperPct: number): FedWatchTarget {
  const lowerBps = pctToBps(lowerPct);
  const upperBps = pctToBps(upperPct);
  return {
    lowerPct,
    upperPct,
    lowerBps,
    upperBps,
    label: `${lowerBps}-${upperBps}`,
  };
}

/** Snap EFFR to the 25bp target corridor that contains it. */
export function targetFromEffr(effr: number): FedWatchTarget {
  const lowerBps = Math.floor((effr * 100) / 25) * 25;
  return targetFromBounds(lowerBps / 100, (lowerBps + 25) / 100);
}

export function rangeLabel(lowerBps: number): string {
  return `${lowerBps}-${lowerBps + 25}`;
}

export function formatFedFundsRange(label: string | null | undefined): string {
  if (!label) return "—";
  if (/\bbps\b/i.test(label)) return label;
  return `${label} bps`;
}

export function classifyBin(
  lowerBps: number,
  currentLowerBps: number,
): FedWatchMoveKind {
  if (lowerBps < currentLowerBps) return "ease";
  if (lowerBps > currentLowerBps) return "hike";
  return "hold";
}

type RateDist = Map<number, number>;

export function expectedMoves(preRate: number, postRate: number): number {
  return (postRate - preRate) / 0.25;
}

/** Shift a rate distribution by a 25bp binary (or multi-step) move. */
export function convolveMoves(dist: RateDist, moves: number): RateDist {
  const floorMoves = Math.floor(moves);
  const pCeil = Math.max(0, Math.min(1, moves - floorMoves));
  const pFloor = 1 - pCeil;
  const next: RateDist = new Map();
  const add = (lowerBps: number, probability: number) => {
    if (probability <= 1e-12) return;
    next.set(lowerBps, (next.get(lowerBps) ?? 0) + probability);
  };
  for (const [lowerBps, probability] of dist) {
    add(lowerBps + floorMoves * 25, probability * pFloor);
    add(lowerBps + (floorMoves + 1) * 25, probability * pCeil);
  }
  return next;
}

/** Largest-remainder rounding so one-decimal bins sum to 100.0. */
export function roundProbabilities(
  masses: Array<{ lowerBps: number; probability: number }>,
): Array<{ lowerBps: number; probability: number }> {
  const usable = masses.filter((row) => row.probability > 0.0005);
  if (!usable.length) return [];
  const rows = usable.map((row) => {
    const scaled = row.probability * 10;
    const floor = Math.floor(scaled + 1e-9);
    return { ...row, floor, frac: scaled - floor };
  });
  let sum = rows.reduce((total, row) => total + row.floor, 0);
  const target = 1000;
  const order = [...rows].sort((a, b) => b.frac - a.frac || a.lowerBps - b.lowerBps);
  let index = 0;
  while (sum < target && index < order.length) {
    order[index]!.floor += 1;
    sum += 1;
    index += 1;
  }
  index = order.length - 1;
  while (sum > target && index >= 0) {
    if (order[index]!.floor > 0) {
      order[index]!.floor -= 1;
      sum -= 1;
    }
    index -= 1;
  }
  return rows
    .map((row) => ({
      lowerBps: row.lowerBps,
      probability: row.floor / 10,
    }))
    .filter((row) => row.probability > 0);
}

export function distToBins(
  dist: RateDist,
  currentLowerBps: number,
): FedWatchBin[] {
  const rounded = roundProbabilities(
    [...dist.entries()].map(([lowerBps, probability]) => ({
      lowerBps,
      probability: probability * 100,
    })),
  );
  return rounded.map((row) => ({
    lowerBps: row.lowerBps,
    upperBps: row.lowerBps + 25,
    label: rangeLabel(row.lowerBps),
    probability: row.probability,
    kind: classifyBin(row.lowerBps, currentLowerBps),
  }));
}

export function movesToBins(
  preRate: number,
  postRate: number,
  currentLowerBps: number,
): FedWatchBin[] {
  const startLower = Math.floor((preRate * 100) / 25) * 25;
  const dist = convolveMoves(
    new Map([[startLower, 1]]),
    expectedMoves(preRate, postRate),
  );
  return distToBins(dist, currentLowerBps);
}

export function summarizeBins(bins: FedWatchBin[]) {
  return bins.reduce(
    (acc, bin) => {
      acc[bin.kind] = Math.round((acc[bin.kind] + bin.probability) * 10) / 10;
      return acc;
    },
    { ease: 0, hold: 0, hike: 0 },
  );
}

export function meetingImpliedBounds(
  meetingIso: string,
  impliedRate: number,
  preRate: number,
  quotes: Map<string, FedFundsQuote>,
): { start: number; end: number } {
  const date = parseIsoDate(meetingIso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const days = daysInUtcMonth(year, month);
  const nPost = days - day + 1;
  const nPre = day - 1;
  const following = nextMonth(year, month);
  const nextQuote = quotes.get(`${following.year}-${following.month}`);
  const nextHasMeeting = hasFomcMeetingInMonth(following.year, following.month);
  const useFollowingEnd =
    Boolean(nextQuote) && (!nextHasMeeting || nPost <= 3);

  if (useFollowingEnd && nextQuote) {
    const end = 100 - nextQuote.price;
    if (nPre > 0) {
      const start =
        (days / nPre) * (impliedRate - end * (nPost / days));
      if (Number.isFinite(start)) return { start, end };
    }
    return { start: preRate, end };
  }

  if (nPost <= 0) return { start: preRate, end: impliedRate };
  return {
    start: preRate,
    end: (impliedRate * days - preRate * nPre) / nPost,
  };
}

export function postMeetingRate(
  meetingIso: string,
  impliedRate: number,
  preRate: number,
  quotes: Map<string, FedFundsQuote>,
): number {
  return meetingImpliedBounds(meetingIso, impliedRate, preRate, quotes).end;
}

export function calculateMeetings(
  meetingIsos: string[],
  quotes: FedFundsQuote[],
  target: TargetContext,
): FedWatchMeeting[] {
  const byMonth = new Map<string, FedFundsQuote>();
  for (const quote of quotes) {
    byMonth.set(`${quote.year}-${quote.month}`, quote);
  }

  const currentTarget = targetFromBounds(target.lowerPct, target.upperPct);
  const fallbackPre = target.effr ?? (target.lowerPct + target.upperPct) / 2;
  const meetings: FedWatchMeeting[] = [];
  let prevPost: number | null = null;
  let dist: RateDist = new Map([[currentTarget.lowerBps, 1]]);

  for (const iso of meetingIsos) {
    const date = parseIsoDate(iso);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const quote = byMonth.get(`${year}-${month}`);
    if (!quote) continue;

    const prior = prevMonth(year, month);
    const priorQuote = byMonth.get(`${prior.year}-${prior.month}`);
    const monthPre =
      prevPost ??
      (priorQuote ? 100 - priorQuote.price : fallbackPre);
    const impliedRate = 100 - quote.price;
    const bounds = meetingImpliedBounds(iso, impliedRate, monthPre, byMonth);
    dist = convolveMoves(dist, expectedMoves(bounds.start, bounds.end));
    const postRate = bounds.end;
    const bins = distToBins(dist, currentTarget.lowerBps);
    const summary = summarizeBins(bins);

    meetings.push({
      date: iso,
      label: formatMeetingLabel(iso, 4),
      tabLabel: formatMeetingLabel(iso, 2),
      contract: meetingToContractCode(iso),
      expires: lastBusinessDayOfMonth(year, month),
      price: quote.price,
      impliedRate: Math.round(impliedRate * 10000) / 10000,
      volume: quote.volume,
      openInterest: quote.openInterest,
      bins,
      ...summary,
    });
    prevPost = postRate;
  }

  return meetings;
}
