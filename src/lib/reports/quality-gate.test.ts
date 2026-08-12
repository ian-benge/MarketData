import { describe, expect, it } from "vitest";
import { extractNumbersFromText } from "@/lib/reports/quality-gate";

describe("extractNumbersFromText", () => {
  it("keeps comma-grouped prices intact", () => {
    expect(extractNumbersFromText("BTC-USD last 97,450.00")).toEqual([
      "97450.00",
    ]);
  });

  it("does not treat an entry range hyphen as a negative fragment", () => {
    expect(extractNumbersFromText("entry 97157.65-97742.35")).toEqual([
      "97157.65",
      "97742.35",
    ]);
  });

  it("does not split ungrouped large prices into 3-digit prefixes", () => {
    expect(extractNumbersFromText("last 97450.00")).toEqual(["97450.00"]);
  });

  it("still captures signed percents", () => {
    expect(extractNumbersFromText("TLT 93.40 (-0.74%)")).toEqual([
      "93.40",
      "-0.74",
    ]);
  });

  it("does not treat news/source identifiers as quantities", () => {
    expect(
      extractNumbersFromText(
        "• Semis bid [finnhub-news-8338114]\nfinnhub-news-8337701: Wire item — https://finnhub.io/news/8336747",
      ),
    ).toEqual([]);
  });

  it("still extracts comma-grouped volumes", () => {
    expect(extractNumbersFromText("SPY volume 8,338,114")).toEqual(["8338114"]);
  });
});
