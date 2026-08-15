import { beforeEach, describe, expect, it } from "vitest";
import { resetEntityCatalogCache } from "./entity-resolve";
import {
  normalizeTickerInput,
  parseTickerList,
  queryIsTickerOnly,
  suggestTickers,
} from "./ticker-suggest";

beforeEach(() => {
  resetEntityCatalogCache();
});

describe("ticker suggest", () => {
  it("normalizes tickers, aliases, and rejects English stopwords", () => {
    expect(normalizeTickerInput("nvda")).toBe("NVDA");
    expect(normalizeTickerInput("$IREN")).toBe("IREN");
    expect(normalizeTickerInput("nvidia")).toBe("NVDA");
    expect(normalizeTickerInput("meta")).toBe("META");
    expect(normalizeTickerInput("Iris Energy")).toBe("IREN");
    expect(normalizeTickerInput("NOW")).toBeNull();
    expect(normalizeTickerInput("the")).toBeNull();
  });

  it("parses comma and space lists and detects ticker-only queries", () => {
    expect(parseTickerList("nvda, meta")).toEqual(["NVDA", "META"]);
    expect(parseTickerList("$IREN NVDA")).toEqual(["IREN", "NVDA"]);
    expect(queryIsTickerOnly("NVDA")).toBe(true);
    expect(queryIsTickerOnly("nvda, meta")).toBe(true);
    expect(queryIsTickerOnly("why is IREN down today")).toBe(false);
  });

  it("suggests catalog tickers from prefixes and company names", () => {
    const nvidia = suggestTickers("nvd");
    expect(nvidia.some((row) => row.ticker === "NVDA")).toBe(true);

    const iris = suggestTickers("iris");
    expect(iris.some((row) => row.ticker === "IREN")).toBe(true);

    const meta = suggestTickers("meta");
    expect(meta[0]?.ticker).toBe("META");
  });
});
