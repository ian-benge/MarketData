import { demoReportDocument } from "@/lib/fixtures/demo-report";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";

export type FixtureReportSummary = {
  id: string;
  edition: "premarket" | "midday" | "close_postmarket";
  tradingDate: string;
  status: string;
  headlineSummary: string;
  completedAt: string | null;
  tickers: string[];
};

export type FixtureReportDetail = FixtureReportSummary & {
  htmlBody: string;
  pdfAvailable: boolean;
  sections: Array<{ title: string; body: string }>;
  citations: Array<{ id: string; label: string; url: string }>;
  job?: {
    id: string;
    status: string;
    stage: string;
    updatedAt: string;
  };
  document?: ReportDocumentModel;
};

export const fixtureReports: FixtureReportDetail[] = [
  {
    id: "rpt-demo-001",
    edition: "midday",
    tradingDate: "2026-08-10",
    status: "completed",
    headlineSummary:
      "Risk assets firmed with semis leading; duration recovered as yields eased into the inflation print.",
    completedAt: "2026-08-10T16:35:00.000Z",
    tickers: ["NVDA", "AMD", "TLT", "SPY"],
    pdfAvailable: true,
    htmlBody: "",
    sections: [
      {
        title: "Changes Since Premarket",
        body: "Morning AI-bid thesis: CONFIRMED in semiconductors. Duration recovery: PENDING into the inflation print. Energy inventory draw: still in force.",
      },
      {
        title: "Market overview",
        body: "Equities advanced with breadth constructive. Semiconductors outperformed on renewed AI capex conviction. Duration recovered as the front end priced a softer inflation path.",
      },
      {
        title: "Material movers",
        body: "NVDA and AMD led large-cap upside. TLT reversed early weakness as yields slipped. VIX proxies declined, consistent with a bid for risk.",
      },
      {
        title: "Catalysts ahead",
        body: "CPI and FOMC minutes remain the primary macro catalysts for the week. Positioning into CPI is two-sided in rates.",
      },
    ],
    citations: [
      {
        id: "c1",
        label: "Wire Desk — Chipmakers advance",
        url: "https://example.com/news/chips-ai",
      },
      {
        id: "c2",
        label: "Rates Brief — Treasury yields ease",
        url: "https://example.com/news/treasuries",
      },
    ],
    job: {
      id: "job-demo-001",
      status: "completed",
      stage: "completed",
      updatedAt: "2026-08-10T16:35:00.000Z",
    },
  },
  {
    id: "rpt-demo-002",
    edition: "premarket",
    tradingDate: "2026-08-10",
    status: "completed",
    headlineSummary:
      "Futures mixed; energy firmer on inventory draw while rates wait on CPI.",
    completedAt: "2026-08-10T12:40:00.000Z",
    tickers: ["USO", "XLE", "SPY"],
    pdfAvailable: true,
    htmlBody: "",
    sections: [
      {
        title: "Premarket tape",
        body: "Index futures were little changed. Energy proxies bid after a larger-than-expected crude inventory draw.",
      },
    ],
    citations: [
      {
        id: "c3",
        label: "Energy Wire — Crude climbs",
        url: "https://example.com/news/crude",
      },
    ],
    job: {
      id: "job-demo-002",
      status: "completed",
      stage: "completed",
      updatedAt: "2026-08-10T12:40:00.000Z",
    },
  },
  {
    id: "rpt-demo-003",
    edition: "close_postmarket",
    tradingDate: "2026-08-07",
    status: "partial",
    headlineSummary:
      "Session closed mixed; news coverage incomplete for several mid-cap names.",
    completedAt: "2026-08-07T20:45:00.000Z",
    tickers: ["IWM", "SPY"],
    pdfAvailable: true,
    htmlBody: "",
    sections: [
      {
        title: "Close / Postmarket summary",
        body: "Regular session mixed. First-hour after-hours: NVDA extended on follow-on AI commentary. Small caps lagged. Report marked partial due to incomplete secondary news coverage.",
      },
    ],
    citations: [],
    job: {
      id: "job-demo-003",
      status: "partial",
      stage: "completed",
      updatedAt: "2026-08-07T20:45:00.000Z",
    },
  },
];

export function listFixtureReports(filters?: {
  q?: string;
  edition?: string;
  from?: string;
  to?: string;
}): FixtureReportSummary[] {
  let rows: FixtureReportSummary[] = fixtureReports.map((row) => {
    const document = demoReportDocument(row.edition, row.tradingDate);
    return {
      id: row.id,
      edition: row.edition,
      tradingDate: row.tradingDate,
      status: row.status,
      headlineSummary: document.executiveSummary,
      completedAt: row.completedAt,
      tickers: [
        ...new Set([
          ...row.tickers,
          ...document.movers.map((m) => m.ticker),
        ]),
      ],
    };
  });
  if (filters?.edition) {
    rows = rows.filter((r) => r.edition === filters.edition);
  }
  if (filters?.from) {
    rows = rows.filter((r) => r.tradingDate >= filters.from!);
  }
  if (filters?.to) {
    rows = rows.filter((r) => r.tradingDate <= filters.to!);
  }
  if (filters?.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.headlineSummary.toLowerCase().includes(q) ||
        r.tickers.some((t) => t.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function getFixtureReport(id: string): FixtureReportDetail | null {
  const row = fixtureReports.find((r) => r.id === id);
  if (!row) return null;
  const document = demoReportDocument(row.edition, row.tradingDate);
  return {
    ...row,
    headlineSummary: document.executiveSummary,
    tickers: [
      ...new Set([
        ...row.tickers,
        ...document.movers.map((m) => m.ticker),
      ]),
    ],
    sections: document.sections.map((section) => ({
      title: section.title,
      body: section.body,
    })),
    citations: document.sources.map((source) => ({
      id: source.id,
      label: source.title,
      url: source.url,
    })),
    document,
  };
}
