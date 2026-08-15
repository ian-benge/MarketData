import { describe, expect, it } from "vitest";
import { clusterNewsItems } from "@/lib/domain/news-cluster";
import { rankEvent } from "./rank";
import type { NormalizedNewsItem } from "@/lib/providers/types";

function item(
  partial: Partial<NormalizedNewsItem> & Pick<NormalizedNewsItem, "id" | "title" | "url">,
): NormalizedNewsItem {
  return {
    publishedAt: "2026-08-15T14:00:00.000Z",
    retrievedAt: "2026-08-15T14:01:00.000Z",
    tickers: ["NVDA"],
    sourceClass: "wire",
    providerName: "test",
    sourceQuality: "secondary",
    ...partial,
  };
}

describe("event ranking", () => {
  it("scores recency, novelty, coverage, and tape reaction without fabricating impact", () => {
    const cluster = clusterNewsItems([
      item({
        id: "a",
        title: "NVIDIA raises AI data center outlook",
        url: "https://a.example/1",
        sourceClass: "primary",
      }),
    ])[0]!;
    const tickers = [
      {
        ticker: "NVDA",
        name: "NVIDIA Corporation",
        role: "primary" as const,
        confidence: "high" as const,
        method: "provider" as const,
      },
    ];
    const covered = rankEvent({
      cluster,
      eventTypeScore: 90,
      novelty: "new",
      tickers,
      coverageTickers: new Set(["NVDA"]),
      quotes: new Map([
        [
          "NVDA",
          {
            ticker: "NVDA",
            changePercent: 4.2,
            relativeVolume: 2.1,
            flags: ["move"],
            session: "regular",
          },
        ],
      ]),
      now: Date.parse("2026-08-15T14:30:00.000Z"),
    });
    const recycled = rankEvent({
      cluster,
      eventTypeScore: 20,
      novelty: "recycled",
      tickers: [],
      coverageTickers: new Set(),
      quotes: new Map(),
      now: Date.parse("2026-08-18T14:30:00.000Z"),
    });
    expect(covered).toBeGreaterThan(recycled);
    expect(covered).toBeGreaterThanOrEqual(0);
    expect(covered).toBeLessThanOrEqual(100);
  });
});
