import type { CorporateEventsProvider } from "@/lib/providers/interfaces";
import type {
  DateRange,
  NormalizedEarningsEvent,
  NormalizedFiling,
} from "@/lib/providers/types";
import {
  assertMockProvidersAllowed,
  MOCK_COVERAGE_NOTE,
  mockNowIso,
} from "./assert-mock";

export class MockCorporateEventsProvider implements CorporateEventsProvider {
  constructor() {
    assertMockProvidersAllowed("MockCorporateEventsProvider");
  }

  async getEarnings(range: DateRange): Promise<NormalizedEarningsEvent[]> {
    const now = mockNowIso();
    return [
      {
        id: "mock-earn-nvda",
        instrumentId: "mock:NVDA",
        ticker: "NVDA",
        companyName: "NVIDIA Corp",
        reportDate: range.start,
        session: "amc",
        fiscalPeriod: "Q2",
        epsActual: 0.68,
        epsEstimate: 0.64,
        revenueActual: 30_400_000_000,
        revenueEstimate: 29_800_000_000,
        providerName: "mock-corporate",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
        url: "https://demo.ir.local/nvda/earnings",
      },
      {
        id: "mock-earn-msft",
        instrumentId: "mock:MSFT",
        ticker: "MSFT",
        companyName: "Microsoft Corp",
        reportDate: range.end,
        session: "amc",
        fiscalPeriod: "Q4",
        epsEstimate: 2.95,
        revenueEstimate: 64_500_000_000,
        providerName: "mock-corporate",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
        url: "https://demo.ir.local/msft/earnings",
      },
      {
        id: "mock-earn-amd",
        instrumentId: "mock:AMD",
        ticker: "AMD",
        companyName: "Advanced Micro Devices",
        reportDate: range.start,
        session: "amc",
        fiscalPeriod: "Q2",
        epsActual: 0.72,
        epsEstimate: 0.7,
        providerName: "mock-corporate",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
    ];
  }

  async getFilings(range: DateRange): Promise<NormalizedFiling[]> {
    const now = mockNowIso();
    return [
      {
        id: "mock-filing-aapl-8k",
        instrumentId: "mock:AAPL",
        ticker: "AAPL",
        companyName: "Apple Inc",
        formType: "8-K",
        filedAt: `${range.start}T16:05:00Z`,
        accessionNumber: "0000320193-26-000100",
        title: "DEMO 8-K — material agreement",
        url: "https://www.sec.gov/Archives/demo/aapl-8k.htm",
        providerName: "mock-corporate",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
      {
        id: "mock-filing-meta-10q",
        instrumentId: "mock:META",
        ticker: "META",
        companyName: "Meta Platforms",
        formType: "10-Q",
        filedAt: `${range.end}T20:00:00Z`,
        accessionNumber: "0001326801-26-000050",
        title: "DEMO 10-Q quarterly report",
        url: "https://www.sec.gov/Archives/demo/meta-10q.htm",
        providerName: "mock-corporate",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
    ];
  }
}
