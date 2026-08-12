import { canonicalizeUrl, hashContent } from "@/lib/domain/news-cluster";
import type { NewsProvider } from "@/lib/providers/interfaces";
import type {
  NewsSearchRequest,
  NormalizedNewsItem,
} from "@/lib/providers/types";
import { NormalizedNewsItemSchema } from "@/lib/providers/types";
import {
  assertSafeOutboundUrl,
  DEFAULT_RSS_MAX_BYTES,
  fetchWithSizeLimit,
} from "@/lib/providers/rss/ssrf";

const COVERAGE =
  "Allowlisted RSS feed — secondary source; SSRF-guarded fetch.";

function isoNow(): string {
  return new Date().toISOString();
}

function parseFeedUrls(csv: string | undefined): string[] {
  if (!csv?.trim()) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type RssItem = {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
};

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) != null) {
    const body = match[1] ?? "";
    const pick = (tag: string): string | undefined => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(body);
      if (!m?.[1]) return undefined;
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
    };
    const link =
      pick("link") ??
      /<link[^>]+href=["']([^"']+)["']/i.exec(body)?.[1];
    items.push({
      title: pick("title"),
      link,
      description: pick("description") ?? pick("content:encoded"),
      pubDate: pick("pubDate") ?? pick("dc:date"),
      guid: pick("guid"),
    });
  }

  // Atom fallback
  if (items.length === 0) {
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRe.exec(xml)) != null) {
      const body = match[1] ?? "";
      const pick = (tag: string): string | undefined => {
        const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(
          body,
        );
        if (!m?.[1]) return undefined;
        return m[1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/<[^>]+>/g, "")
          .trim();
      };
      const link =
        /<link[^>]+href=["']([^"']+)["']/i.exec(body)?.[1] ?? pick("link");
      items.push({
        title: pick("title"),
        link,
        description: pick("summary") ?? pick("content"),
        pubDate: pick("updated") ?? pick("published"),
        guid: pick("id"),
      });
    }
  }

  return items;
}

export function normalizeRssItem(
  item: RssItem,
  feedUrl: string,
  retrievalTimestamp = isoNow(),
): NormalizedNewsItem | null {
  const title = item.title?.trim();
  const url = item.link?.trim();
  if (!title || !url) return null;
  const safeLink = assertSafeOutboundUrl(url);
  // Article links may be https public hosts; if blocked, still keep title with feed URL as fallback
  const finalUrl = safeLink.ok ? safeLink.url.toString() : feedUrl;
  const summary = item.description?.trim();
  const publishedAt = item.pubDate
    ? new Date(item.pubDate).toISOString()
    : retrievalTimestamp;
  const idBase = item.guid ?? `${title}:${finalUrl}`;

  const normalized: NormalizedNewsItem = {
    id: `rss-${hashContent(idBase).slice(0, 16)}`,
    title,
    summary,
    url: finalUrl,
    canonicalUrl: canonicalizeUrl(finalUrl),
    contentHash: hashContent(`${title}\n${summary ?? ""}`),
    publisher: new URL(feedUrl).hostname,
    publishedAt: Number.isNaN(Date.parse(publishedAt))
      ? retrievalTimestamp
      : publishedAt,
    retrievedAt: retrievalTimestamp,
    tickers: [],
    sourceClass: "secondary",
    providerName: "rss",
    sourceQuality: "secondary",
    coverageNotes: COVERAGE,
    excerpt: summary?.slice(0, 400),
  };
  return NormalizedNewsItemSchema.parse(normalized);
}

export type RssNewsOptions = {
  feedUrls: string[];
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

/**
 * Fetches only allowlisted feed URLs with SSRF guards.
 */
export class RssNewsProvider implements NewsProvider {
  private readonly feedUrls: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;

  constructor(options: RssNewsOptions) {
    this.feedUrls = [];
    for (const raw of options.feedUrls) {
      const check = assertSafeOutboundUrl(raw);
      if (!check.ok) {
        throw new Error(`RSS feed rejected (${raw}): ${check.reason}`);
      }
      this.feedUrls.push(check.url.toString());
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxBytes = options.maxBytes ?? DEFAULT_RSS_MAX_BYTES;
  }

  static fromCsv(
    csv: string | undefined,
    options: Omit<RssNewsOptions, "feedUrls"> = {},
  ): RssNewsProvider {
    return new RssNewsProvider({
      ...options,
      feedUrls: parseFeedUrls(csv),
    });
  }

  async search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    const retrieval = isoNow();
    const limit = request.limit ?? 50;
    const out: NormalizedNewsItem[] = [];

    for (const feedUrl of this.feedUrls) {
      try {
        const res = await fetchWithSizeLimit(feedUrl, {
          fetchImpl: this.fetchImpl,
          maxBytes: this.maxBytes,
          headers: {
            accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            "user-agent":
              "MarketDataFNIP/1.0 (research-desk; +https://localhost)",
          },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        for (const item of parseRssItems(xml)) {
          const n = normalizeRssItem(item, feedUrl, retrieval);
          if (n) out.push(n);
        }
      } catch {
        /* one dead feed must not empty the desk */
      }
    }

    let items = out;
    if (request.query) {
      const q = request.query.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.summary?.toLowerCase().includes(q) ?? false),
      );
    }
    if (request.tickers?.length) {
      const tickers = request.tickers.map((t) => t.toUpperCase());
      items = items.filter(
        (item) =>
          item.tickers.some((t) => tickers.includes(t)) ||
          tickers.some((t) => item.title.toUpperCase().includes(t)),
      );
    }

    return items.slice(0, limit);
  }
}
