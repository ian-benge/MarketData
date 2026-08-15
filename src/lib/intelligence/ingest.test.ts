import { describe, expect, it } from "vitest";
import { filingToNews, materialForm } from "./ingest";
import type { NormalizedFiling } from "@/lib/providers/types";

describe("intelligence ingest helpers", () => {
  it("keeps material forms and drops routine 4 filings", () => {
    expect(materialForm("8-K")).toBe(true);
    expect(materialForm("10-Q")).toBe(true);
    expect(materialForm("SC 13D")).toBe(true);
    expect(materialForm("4")).toBe(false);
  });

  it("maps an EDGAR filing to a source-linked news item", () => {
    const filing: NormalizedFiling = {
      id: "edgar-1",
      formType: "8-K",
      filedAt: "2026-08-15T14:00:00.000Z",
      providerTimestamp: "2026-08-15T14:00:00.000Z",
      retrievalTimestamp: "2026-08-15T14:01:00.000Z",
      url: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
      title: "NVIDIA Corp - 8-K",
      companyName: "NVIDIA Corp",
      ticker: "NVDA",
      providerName: "edgar",
      sourceQuality: "primary",
      coverageNotes: "SEC EDGAR",
    };
    const item = filingToNews(filing);
    expect(item.url).toBe(filing.url);
    expect(item.tickers).toEqual(["NVDA"]);
    expect(item.sourceClass).toBe("primary");
    expect(item.providerName).toBe("edgar");
    expect(item.title).toContain("8-K");
  });
});
