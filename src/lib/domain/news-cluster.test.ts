import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  clusterNewsItems,
  hashContent,
} from "@/lib/domain/news-cluster";
import type { NormalizedNewsItem } from "@/lib/providers/types";

function item(
  partial: Partial<NormalizedNewsItem> & Pick<NormalizedNewsItem, "id" | "title" | "url">,
): NormalizedNewsItem {
  return {
    publishedAt: "2026-08-10T12:00:00Z",
    retrievedAt: "2026-08-10T12:01:00Z",
    tickers: [],
    sourceClass: "wire",
    providerName: "test",
    sourceQuality: "mock",
    ...partial,
  };
}

describe("news-cluster", () => {
  it("hashes content stably", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  it("canonicalizes urls by stripping tracking params", () => {
    const a = canonicalizeUrl(
      "https://Example.com/story/?utm_source=x&id=1#frag",
    );
    const b = canonicalizeUrl("https://example.com/story?id=1");
    expect(a).toBe(b);
  });

  it("dedupes identical canonical urls and content hashes", () => {
    const sharedHash = hashContent("same\n");
    const items = [
      item({
        id: "1",
        title: "Alpha rises on earnings",
        url: "https://news.example/a?utm_source=tw",
        summary: "same",
        contentHash: sharedHash,
      }),
      item({
        id: "2",
        title: "Alpha rises on earnings",
        url: "https://news.example/a",
        summary: "same",
        contentHash: sharedHash,
      }),
      item({
        id: "3",
        title: "Beta slips after guidance cut",
        url: "https://news.example/b",
        summary: "other",
      }),
    ];
    const clusters = clusterNewsItems(items);
    expect(clusters).toHaveLength(2);
  });

  it("clusters similar titles", () => {
    const items = [
      item({
        id: "1",
        title: "NVIDIA raises AI data center outlook",
        url: "https://a.example/1",
      }),
      item({
        id: "2",
        title: "NVIDIA raises AI data-center outlook sharply",
        url: "https://b.example/2",
      }),
      item({
        id: "3",
        title: "Oil inventory draw lifts crude prices",
        url: "https://c.example/3",
      }),
    ];
    const clusters = clusterNewsItems(items, {
      titleSimilarityThreshold: 0.4,
    });
    expect(clusters.length).toBeLessThan(items.length);
    const nvda = clusters.find((c) =>
      c.items.some((i) => i.title.includes("NVIDIA")),
    );
    expect(nvda?.items.length).toBeGreaterThanOrEqual(2);
  });
});
