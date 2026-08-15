import type { NewsCluster } from "@/lib/domain/news-cluster";
import { classifyHeadline } from "./event-classify";
import type {
  CoverageLink,
  IntelligenceEvent,
  NoveltyState,
  QuoteContext,
  ResolvedEntity,
} from "./types";

const HALF_LIFE_MS = 6 * 60 * 60 * 1000;

const SOURCE_WEIGHT: Record<string, number> = {
  primary: 1,
  wire: 0.75,
  secondary: 0.5,
  blog: 0.28,
  unknown: 0.35,
};

const NOVELTY_WEIGHT: Record<NoveltyState, number> = {
  new: 1,
  update: 0.86,
  duplicate: 0.34,
  recycled: 0.16,
};

function recencyScore(publishedAt: string, now: number): number {
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at)) return 0.2;
  const age = Math.max(0, now - at);
  return Math.exp((-Math.LN2 * age) / HALF_LIFE_MS);
}

function coverageBoost(
  tickers: ResolvedEntity[],
  coverageTickers: Set<string>,
): number {
  if (!coverageTickers.size || !tickers.length) return 0;
  const hits = tickers.filter((entity) => coverageTickers.has(entity.ticker)).length;
  return Math.min(1, hits / Math.max(1, Math.min(tickers.length, 3)));
}

function reactionBoost(
  tickers: ResolvedEntity[],
  quotes: Map<string, QuoteContext>,
): number {
  let best = 0;
  for (const entity of tickers) {
    const quote = quotes.get(entity.ticker);
    if (!quote) continue;
    const move = Math.abs(quote.changePercent ?? 0);
    const rvol = quote.relativeVolume ?? 0;
    const score = Math.min(1, move / 8) * 0.7 + Math.min(1, Math.max(0, rvol - 1) / 2) * 0.3;
    if (score > best) best = score;
  }
  return best;
}

export function rankEvent(input: {
  cluster: NewsCluster;
  eventTypeScore: number;
  novelty: NoveltyState;
  tickers: ResolvedEntity[];
  coverageTickers: Set<string>;
  quotes: Map<string, QuoteContext>;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const representative = input.cluster.representative;
  const recency = recencyScore(representative.publishedAt, now);
  const credibility = SOURCE_WEIGHT[representative.sourceClass] ?? 0.35;
  const novelty = NOVELTY_WEIGHT[input.novelty];
  const typeScore = input.eventTypeScore / 100;
  const coverage = coverageBoost(input.tickers, input.coverageTickers);
  const reaction = reactionBoost(input.tickers, input.quotes);
  const clusterSize = Math.min(1, (input.cluster.items.length - 1) / 4);

  const score =
    recency * 28 +
    novelty * 16 +
    credibility * 14 +
    typeScore * 16 +
    coverage * 12 +
    reaction * 10 +
    clusterSize * 4;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function sortEvents(events: IntelligenceEvent[]): IntelligenceEvent[] {
  return [...events].sort((a, b) => {
    const aCov = a.tickers.some((entity) => entity.role === "primary") ? 1 : 0;
    const bCov = b.tickers.some((entity) => entity.role === "primary") ? 1 : 0;
    if (a.materialityScore !== b.materialityScore) {
      return b.materialityScore - a.materialityScore;
    }
    if (aCov !== bCov) return bCov - aCov;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

export function preferCoverage(
  events: IntelligenceEvent[],
  coverage: CoverageLink[] | Set<string>,
): IntelligenceEvent[] {
  const set =
    coverage instanceof Set
      ? coverage
      : new Set(coverage.map((row) => row.ticker.toUpperCase()));
  return [...events].sort((a, b) => {
    const aHit = a.tickers.some((entity) => set.has(entity.ticker));
    const bHit = b.tickers.some((entity) => set.has(entity.ticker));
    if (aHit !== bHit) return aHit ? -1 : 1;
    return b.materialityScore - a.materialityScore;
  });
}

export { classifyHeadline };
