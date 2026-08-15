import { describe, expect, it } from "vitest";
import { normalizeMassiveNewsItem } from "./news";

describe("Massive news normalize", () => {
  it("keeps original article URLs and provider tickers", () => {
    const item = normalizeMassiveNewsItem(
      {
        id: "poly-1",
        title: "IREN signs additional AI power contract",
        description: "Utility offtake added.",
        article_url: "https://www.example.com/iren-ppa?utm_source=tw",
        published_utc: "2026-08-15T13:00:00.000Z",
        tickers: ["iren"],
        publisher: { name: "Example Wire" },
      },
      "2026-08-15T13:01:00.000Z",
    );
    expect(item?.url).toBe("https://www.example.com/iren-ppa?utm_source=tw");
    expect(item?.canonicalUrl).toBe("https://www.example.com/iren-ppa");
    expect(item?.tickers).toEqual(["IREN"]);
    expect(item?.providerName).toBe("massive");
    expect(item?.sourceQuality).toBe("secondary");
  });

  it("drops rows without a title or source URL", () => {
    expect(normalizeMassiveNewsItem({ id: "x", title: "No url" })).toBeNull();
  });
});
