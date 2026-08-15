import { describe, expect, it } from "vitest";
import {
  isCatalogTicker,
  isProseCapToken,
  resolveAlias,
  resolveEntities,
  resolveQueryTickers,
  tickerMentionedInText,
} from "./entity-resolve";

describe("entity resolution", () => {
  it("keeps provider-tagged tickers with high confidence", () => {
    const entities = resolveEntities({
      title: "Chipmakers advance as AI spending outlook firms",
      tickers: ["NVDA", "AMD"],
    });
    expect(entities.map((row) => row.ticker)).toEqual(["AMD", "NVDA"]);
    expect(entities.every((row) => row.method === "provider")).toBe(true);
    expect(entities.every((row) => row.confidence === "high")).toBe(true);
  });

  it("resolves company names and aliases without inventing extra names", () => {
    const nvidia = resolveEntities({
      title: "NVIDIA raises data-center outlook",
      tickers: [],
    });
    expect(nvidia.some((row) => row.ticker === "NVDA")).toBe(true);
    expect(nvidia.find((row) => row.ticker === "NVDA")?.method).toBe("company_name");

    const iren = resolveEntities({
      title: "Iris Energy signs new AI power contract",
      tickers: [],
    });
    expect(iren.some((row) => row.ticker === "IREN")).toBe(true);
  });

  it("does not treat common English as tickers", () => {
    const entities = resolveEntities({
      title: "The Fed can see all of the data now",
      tickers: [],
    });
    expect(entities.map((row) => row.ticker)).not.toContain("NOW");
    expect(entities.map((row) => row.ticker)).not.toContain("ALL");
    expect(entities.map((row) => row.ticker)).not.toContain("CAN");
  });

  it("resolves query tickers from aliases", () => {
    expect(resolveQueryTickers("NVDA")).toContain("NVDA");
    expect(resolveQueryTickers("why is IREN down today")).toContain("IREN");
    expect(resolveQueryTickers("Taiwan Semiconductor export controls")).toContain("TSM");
    expect(resolveQueryTickers("Iris Energy")).toContain("IREN");
    expect(resolveQueryTickers("meta")).toContain("META");
  });

  it("drops provider overtags that are not in the catalog or the headline", () => {
    const entities = resolveEntities({
      title:
        "Elon Musk Says SpaceX Has a Massive Competitive Advantage in AI That Amazon, Google, and Microsoft Can't Touch",
      tickers: ["AMZN", "GOOG", "GOOGL", "GOOGM", "GOOGN", "MSFT", "SPCX"],
    });
    const tickers = entities.map((row) => row.ticker);
    expect(tickers).toEqual(expect.arrayContaining(["AMZN", "GOOGL", "MSFT"]));
    expect(tickers).not.toContain("GOOGM");
    expect(tickers).not.toContain("GOOGN");
    expect(tickers).not.toContain("SPCX");
  });

  it("keeps catalog ETFs like SPCX but still drops them when they are not mentioned", () => {
    expect(isCatalogTicker("NVDA")).toBe(true);
    expect(isCatalogTicker("SPCX")).toBe(true);
    expect(isCatalogTicker("GOOGM")).toBe(false);
    expect(isProseCapToken("AI")).toBe(true);
    expect(isProseCapToken("SPCX")).toBe(false);
    expect(tickerMentionedInText("SPCX", "SpaceX versus Amazon and Microsoft")).toBe(
      false,
    );
    expect(tickerMentionedInText("AMZN", "SpaceX versus Amazon and Microsoft")).toBe(
      true,
    );
  });

  it("does not map SK Hynix aliases to the invented SKHY ticker", () => {
    expect(resolveAlias("sk hynix")).not.toBe("SKHY");
    expect(resolveAlias("skhynix")).not.toBe("SKHY");
  });
});
