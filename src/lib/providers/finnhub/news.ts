import { z } from "zod";
import { canonicalizeUrl, hashContent } from "@/lib/domain/news-cluster";
import type { NewsProvider } from "@/lib/providers/interfaces";
import type {
  NewsSearchRequest,
  NormalizedNewsItem,
} from "@/lib/providers/types";
import { NormalizedNewsItemSchema } from "@/lib/providers/types";

const FinnhubNewsRawSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
  datetime: z.number().optional(),
  related: z.string().optional(),
  category: z.string().optional(),
  image: z.string().optional(),
});

const FinnhubNewsListSchema = z.array(FinnhubNewsRawSchema);

const COVERAGE =
  "Finnhub news — secondary/wire aggregation; verify primary sources for material claims.";

function isoNow(): string {
  return new Date().toISOString();
}

export function normalizeFinnhubNewsItem(
  raw: unknown,
  retrievalTimestamp = isoNow(),
): NormalizedNewsItem | null {
  const n = FinnhubNewsRawSchema.parse(raw);
  const title = n.headline?.trim();
  if (!title) return null;
  const url = n.url?.trim() || `https://finnhub.io/news/${n.id ?? "unknown"}`;
  const summary = n.summary?.trim() || undefined;
  const publishedAt =
    n.datetime != null && n.datetime > 0
      ? new Date(n.datetime * 1000).toISOString()
      : retrievalTimestamp;
  const tickers = (n.related ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const item: NormalizedNewsItem = {
    id: `finnhub-news-${n.id ?? hashContent(title).slice(0, 12)}`,
    title,
    summary,
    url,
    canonicalUrl: canonicalizeUrl(url),
    contentHash: hashContent(`${title}\n${summary ?? ""}`),
    publisher: n.source,
    publishedAt,
    retrievedAt: retrievalTimestamp,
    tickers,
    sourceClass: "wire",
    providerName: "finnhub",
    sourceQuality: "secondary",
    coverageNotes: COVERAGE,
    excerpt: summary,
  };
  return NormalizedNewsItemSchema.parse(item);
}

export type FinnhubNewsOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export class FinnhubNewsProvider implements NewsProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: FinnhubNewsOptions) {
    if (!options.apiKey) {
      throw new Error("FinnhubNewsProvider requires apiKey");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://finnhub.io/api/v1";
  }

  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("token", this.apiKey);
    const res = await this.fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Finnhub ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    const retrieval = isoNow();
    const limit = request.limit ?? 50;
    const tickers = (request.tickers ?? []).map((t) => t.toUpperCase());
    const rawItems: unknown[] = [];

    if (tickers.length > 0) {
      const end = request.range?.end
        ? request.range.end.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const start = request.range?.start
        ? request.range.start.slice(0, 10)
        : new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      for (const symbol of tickers.slice(0, 5)) {
        const raw = await this.getJson("/company-news", {
          symbol,
          from: start,
          to: end,
        });
        const list = FinnhubNewsListSchema.parse(raw);
        rawItems.push(...list);
      }
    } else {
      const raw = await this.getJson("/news", { category: "general" });
      const list = FinnhubNewsListSchema.parse(raw);
      rawItems.push(...list);
    }

    let items = rawItems
      .map((r) => normalizeFinnhubNewsItem(r, retrieval))
      .filter((x): x is NormalizedNewsItem => x != null);

    if (request.query) {
      const q = request.query.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.summary?.toLowerCase().includes(q) ?? false),
      );
    }

    if (tickers.length > 0) {
      items = items.filter((item) =>
        item.tickers.some((t) => tickers.includes(t.toUpperCase())),
      );
    }

    return items.slice(0, limit);
  }
}
