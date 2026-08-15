import { describe, expect, it } from "vitest";
import { clusterNewsItems } from "@/lib/domain/news-cluster";
import { detectNovelty } from "./novelty";
import type { NormalizedNewsItem } from "@/lib/providers/types";

function item(partial: Partial<NormalizedNewsItem> & Pick<NormalizedNewsItem, "id" | "title" | "url">): NormalizedNewsItem {
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

describe("novelty", () => {
  it("marks exact prior hashes as duplicate and old similar titles as recycled", () => {
    const current = clusterNewsItems([
      item({
        id: "now",
        title: "NVIDIA raises AI data center outlook",
        url: "https://example.com/now",
        publishedAt: "2026-08-15T15:00:00.000Z",
      }),
    ])[0]!;

    expect(
      detectNovelty(current, [
        {
          title: "NVIDIA raises AI data center outlook",
          publishedAt: "2026-08-15T12:00:00.000Z",
          contentHash: current.contentHash,
          tickers: ["NVDA"],
        },
      ]),
    ).toBe("duplicate");

    expect(
      detectNovelty(current, [
        {
          title: "NVIDIA raises AI data-center outlook sharply",
          publishedAt: "2026-08-10T12:00:00.000Z",
          tickers: ["NVDA"],
        },
      ]),
    ).toBe("recycled");
  });

  it("returns new when there is no prior similar coverage", () => {
    const current = clusterNewsItems([
      item({
        id: "fresh",
        title: "Powell signals patience on rate cuts",
        url: "https://example.com/fed",
        tickers: [],
      }),
    ])[0]!;
    expect(detectNovelty(current, [])).toBe("new");
  });
});
