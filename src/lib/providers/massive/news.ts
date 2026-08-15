import { z } from "zod";
import { canonicalizeUrl, hashContent } from "@/lib/domain/news-cluster";
import { EntitlementError } from "@/lib/market-data/schemas";
import { MassiveClient } from "@/lib/providers/massive/client";
import type { NewsProvider } from "@/lib/providers/interfaces";
import type { NewsSearchRequest, NormalizedNewsItem } from "@/lib/providers/types";
import { NormalizedNewsItemSchema } from "@/lib/providers/types";

const PublisherSchema = z
  .object({
    name: z.string().optional(),
    homepage_url: z.string().optional(),
  })
  .passthrough();

const MassiveNewsItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    article_url: z.string().optional(),
    published_utc: z.string().optional(),
    author: z.string().optional(),
    tickers: z.array(z.string()).optional(),
    publisher: PublisherSchema.optional(),
  })
  .passthrough();

const MassiveNewsListSchema = z
  .object({
    results: z.array(MassiveNewsItemSchema).optional(),
    status: z.string().optional(),
  })
  .passthrough();

const COVERAGE =
  "Massive/Polygon reference news — plan-dependent. Verify primary sources for material claims.";

function isoNow() {
  return new Date().toISOString();
}

export function normalizeMassiveNewsItem(
  raw: unknown,
  retrievalTimestamp = isoNow(),
): NormalizedNewsItem | null {
  const parsed = MassiveNewsItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const n = parsed.data;
  const title = n.title?.trim();
  const url = n.article_url?.trim();
  if (!title || !url) return null;
  const summary = n.description?.trim() || undefined;
  const publishedAt = n.published_utc
    ? new Date(n.published_utc).toISOString()
    : retrievalTimestamp;
  const tickers = (n.tickers ?? []).map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
  const item: NormalizedNewsItem = {
    id: `massive-news-${n.id ?? hashContent(title).slice(0, 12)}`,
    title,
    summary,
    url,
    canonicalUrl: canonicalizeUrl(url),
    contentHash: hashContent(`${title}\n${summary ?? ""}`),
    publisher: n.publisher?.name ?? n.author,
    publishedAt: Number.isNaN(Date.parse(publishedAt)) ? retrievalTimestamp : publishedAt,
    retrievedAt: retrievalTimestamp,
    tickers,
    sourceClass: "wire",
    providerName: "massive",
    sourceQuality: "secondary",
    coverageNotes: COVERAGE,
    excerpt: summary,
  };
  return NormalizedNewsItemSchema.parse(item);
}

export class MassiveNewsProvider implements NewsProvider {
  private readonly client: MassiveClient;

  constructor(options: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.client = new MassiveClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    });
  }

  async search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    const retrieval = isoNow();
    const limit = Math.min(request.limit ?? 50, 50);
    const params: Record<string, string> = {
      limit: String(limit),
      order: "desc",
      sort: "published_utc",
    };
    if (request.tickers?.length) {
      params.ticker = request.tickers[0]!.toUpperCase();
    }
    if (request.query) params["q"] = request.query;
    const raw = await this.client.getJson("/v2/reference/news", params);
    const list = MassiveNewsListSchema.parse(raw);
    let items = (list.results ?? [])
      .map((row) => normalizeMassiveNewsItem(row, retrieval))
      .filter((row): row is NormalizedNewsItem => row != null);
    if (request.tickers?.length) {
      const tickers = request.tickers.map((ticker) => ticker.toUpperCase());
      items = items.filter((item) => item.tickers.some((ticker) => tickers.includes(ticker)));
    }
    return items.slice(0, limit);
  }
}

export function isNewsEntitlementError(error: unknown): boolean {
  return error instanceof EntitlementError;
}
