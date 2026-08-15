import { describe, expect, it } from "vitest";
import { shouldAttachRequestedSymbol } from "./news";

describe("Finnhub company-news ticker tagging", () => {
  it("attaches the requested symbol when related is empty and the title names the issuer", () => {
    expect(
      shouldAttachRequestedSymbol(
        {
          title: "Iris Energy announces additional power capacity",
          summary: "IR offtake.",
          tickers: [],
        },
        "IREN",
      ),
    ).toBe(true);
  });

  it("does not inherit the queried symbol for an unrelated company-news row", () => {
    expect(
      shouldAttachRequestedSymbol(
        {
          title: "Apple supplier update lifts mega-cap tech",
          summary: "AAPL supply chain.",
          tickers: [],
        },
        "IREN",
      ),
    ).toBe(false);
  });

  it("does not overwrite a different provider-tagged issuer", () => {
    expect(
      shouldAttachRequestedSymbol(
        {
          title: "Broadcom reports quarterly results",
          tickers: ["AVGO"],
        },
        "NVDA",
      ),
    ).toBe(false);
  });
});
