import { jaccard, titleTokens } from "@/lib/domain/news-cluster";
import type { NewsCluster } from "@/lib/domain/news-cluster";
import type { NoveltyState, PriorHeadline } from "./types";

const RECYCLED_MS = 36 * 60 * 60 * 1000;
const UPDATE_MS = 2 * 60 * 60 * 1000;

export function detectNovelty(
  cluster: NewsCluster,
  prior: PriorHeadline[],
  now = Date.parse(cluster.representative.publishedAt),
): NoveltyState {
  const hash = cluster.contentHash ?? cluster.representative.contentHash;
  const tokens = titleTokens(cluster.representative.title);
  const tickers = new Set(
    cluster.items.flatMap((item) => item.tickers.map((ticker) => ticker.toUpperCase())),
  );

  let best = { state: "new" as NoveltyState, score: 0 };

  for (const item of prior) {
    const priorAt = Date.parse(item.publishedAt);
    if (!Number.isFinite(priorAt) || priorAt >= now) continue;
    const age = now - priorAt;
    if (hash && item.contentHash && hash === item.contentHash) {
      return age >= RECYCLED_MS ? "recycled" : "duplicate";
    }
    const sim = jaccard(tokens, titleTokens(item.title));
    const overlap =
      tickers.size === 0 ||
      item.tickers.some((ticker) => tickers.has(ticker.toUpperCase()));
    if (sim >= 0.82 && overlap) {
      const state: NoveltyState = age >= RECYCLED_MS ? "recycled" : "duplicate";
      if (sim > best.score) best = { state, score: sim };
    } else if (sim >= 0.55 && overlap && age >= UPDATE_MS) {
      if (sim > best.score) best = { state: "update", score: sim };
    }
  }

  return best.score > 0 ? best.state : "new";
}
