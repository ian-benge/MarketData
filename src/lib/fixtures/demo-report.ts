/**
 * DEMO report document fixtures for all three editions.
 */
import type { ReportEdition } from "@/lib/providers/types";
import { demoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { demoNewsItems } from "@/lib/fixtures/demo-news";
import { priorEditionsFor } from "@/lib/reports/editions";
import {
  buildReportDocument,
  type ReportDocumentModel,
} from "@/lib/reports/content-builder";

export const DEMO_REPORT_NOTE =
  "IB Market Data DEMO report — assembled from demo market/news fixtures only.";

export function demoReportDocument(
  edition: ReportEdition,
  tradingDate = "2026-08-10",
): ReportDocumentModel {
  const market = demoMarketSnapshot(edition, tradingDate);
  const news = demoNewsItems(edition);
  const priorDocuments = priorEditionsFor(edition).map((prior) =>
    demoReportDocument(prior, tradingDate),
  );
  const ahNews = news.filter((item) =>
    /after-hours|after hours|postmarket/i.test(item.title),
  );
  return buildReportDocument({
    edition,
    tradingDate,
    firmName: "IB Market Data (DEMO)",
    market,
    news,
    isDemo: true,
    priorDocuments,
    afterHoursNews: ahNews,
    afterHoursMovers:
      edition === "close_postmarket"
        ? market.movers.filter((m) => m.ticker === "NVDA")
        : [],
  });
}

export const DEMO_REPORT_BY_EDITION: Record<
  ReportEdition,
  ReportDocumentModel
> = {
  premarket: demoReportDocument("premarket"),
  midday: demoReportDocument("midday"),
  close_postmarket: demoReportDocument("close_postmarket"),
};
