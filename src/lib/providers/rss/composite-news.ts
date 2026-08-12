import type { NewsProvider } from "@/lib/providers/interfaces";
import type {
  NewsSearchRequest,
  NormalizedNewsItem,
} from "@/lib/providers/types";

/**
 * Merges multiple news providers (e.g. Finnhub + RSS) with simple id/url dedupe.
 */
export class CompositeNewsProvider implements NewsProvider {
  constructor(private readonly providers: NewsProvider[]) {
    if (providers.length === 0) {
      throw new Error("CompositeNewsProvider requires at least one provider");
    }
  }

  async search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    const limit = request.limit ?? 50;
    const merged: NormalizedNewsItem[] = [];
    const seen = new Set<string>();

    for (const provider of this.providers) {
      let items: NormalizedNewsItem[] = [];
      try {
        items = await provider.search({
          ...request,
          limit,
        });
      } catch {
        continue;
      }
      for (const item of items) {
        const key = (item.canonicalUrl ?? item.url).toLowerCase();
        if (seen.has(key) || seen.has(item.id)) continue;
        seen.add(key);
        seen.add(item.id);
        merged.push(item);
      }
    }

    merged.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    return merged.slice(0, limit);
  }
}
