import { createHash } from "node:crypto";
import type { NormalizedNewsItem } from "@/lib/providers/types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

/**
 * Stable SHA-256 content hash for title+summary (or provided body).
 */
export function hashContent(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Canonicalize a URL for deduplication: lowercase host, strip hash,
 * drop tracking query params, remove trailing slash (except root).
 */
export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.protocol === "http:") {
      // Prefer https equivalence for comparison when host matches
      url.protocol = "https:";
    }
    const kept: string[] = [];
    url.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    });
    kept.sort();
    url.search = kept.length ? `?${kept.join("&")}` : "";
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    url.pathname = path;
    return url.toString();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type NewsCluster = {
  clusterId: string;
  canonicalUrl?: string;
  contentHash?: string;
  representative: NormalizedNewsItem;
  items: NormalizedNewsItem[];
  similarity: number;
};

export type ClusterNewsOptions = {
  /** Jaccard threshold for title similarity clustering (0–1). */
  titleSimilarityThreshold?: number;
};

/**
 * Deduplicate by canonical URL + content hash, then cluster similar titles.
 */
export function clusterNewsItems(
  items: NormalizedNewsItem[],
  options: ClusterNewsOptions = {},
): NewsCluster[] {
  const titleSimilarityThreshold = options.titleSimilarityThreshold ?? 0.55;

  const enriched = items.map((item) => {
    const canonicalUrl = item.canonicalUrl ?? canonicalizeUrl(item.url);
    const contentHash =
      item.contentHash ??
      hashContent(`${item.title}\n${item.summary ?? ""}\n${item.excerpt ?? ""}`);
    return { ...item, canonicalUrl, contentHash };
  });

  // Exact dedupe by canonical URL or content hash
  const seenKeys = new Set<string>();
  const unique: NormalizedNewsItem[] = [];
  for (const item of enriched) {
    const keys = [
      `url:${item.canonicalUrl}`,
      `hash:${item.contentHash}`,
    ];
    if (keys.some((k) => seenKeys.has(k))) continue;
    for (const k of keys) seenKeys.add(k);
    unique.push(item);
  }

  const assigned = new Set<string>();
  const clusters: NewsCluster[] = [];

  for (let i = 0; i < unique.length; i += 1) {
    const seed = unique[i]!;
    if (assigned.has(seed.id)) continue;

    const seedTokens = titleTokens(seed.title);
    const members: NormalizedNewsItem[] = [seed];
    assigned.add(seed.id);
    let bestSim = 1;

    for (let j = i + 1; j < unique.length; j += 1) {
      const other = unique[j]!;
      if (assigned.has(other.id)) continue;
      const sim = jaccard(seedTokens, titleTokens(other.title));
      if (sim >= titleSimilarityThreshold) {
        members.push(other);
        assigned.add(other.id);
        bestSim = Math.min(bestSim, sim);
      }
    }

    const representative = [...members].sort((a, b) => {
      const rank = (x: NormalizedNewsItem) =>
        x.sourceClass === "primary" ? 0 : x.sourceClass === "wire" ? 1 : 2;
      return rank(a) - rank(b);
    })[0]!;

    clusters.push({
      clusterId: `cluster:${representative.contentHash ?? representative.id}`,
      canonicalUrl: representative.canonicalUrl,
      contentHash: representative.contentHash,
      representative,
      items: members,
      similarity: members.length === 1 ? 1 : bestSim,
    });
  }

  return clusters;
}
