import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Env } from "@/lib/env";
import { resetEnvCache } from "@/lib/env";
import type { EmailProvider } from "@/lib/providers/interfaces";
import type { DeliveryResult, ReportEmailRequest } from "@/lib/providers/types";
import { AiOrchestration } from "@/lib/ai/orchestration";
import {
  MockAiProvider,
  MockEmailProvider,
  MockMarketDataProvider,
  MockNewsProvider,
} from "@/lib/providers/mock";
import { MemoryReportJobStore } from "@/lib/reports/job-store";
import { ReportPipeline } from "@/lib/reports/pipeline";
import { PIPELINE_STAGES } from "@/lib/reports/stages";
import { REQUIRED_SECTION_KEYS } from "@/lib/reports/section-keys";
import { runQualityGate } from "@/lib/reports/quality-gate";
import {
  buildReportDocument,
  evidenceBundleFromMarket,
  extraNumbersFromDocument,
} from "@/lib/reports/content-builder";
import { demoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { demoNewsItems } from "@/lib/fixtures/demo-news";
import {
  DEMO_REPORT_NOTE,
  demoReportDocument,
} from "@/lib/fixtures/demo-report";

const testEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ALLOW_MOCK_PROVIDERS: true,
  DEMO_MODE: true,
  OPENAI_MODEL: "gpt-test",
  ANTHROPIC_MODEL: "claude-test",
  GEMINI_MODEL: "gemini-test",
  AI_DEFAULT_PROVIDER: "openai",
  STORAGE_BUCKET: "reports",
} as Env;

describe("ReportPipeline", () => {
  beforeEach(() => {
    resetEnvCache();
    process.env.ALLOW_MOCK_PROVIDERS = "true";
  });

  afterEach(() => {
    resetEnvCache();
  });

  it("runs the full happy path with fixtures and mocks", async () => {
    const store = new MemoryReportJobStore();
    const sendReport = vi.fn(
      async (request: ReportEmailRequest): Promise<DeliveryResult> => ({
        ok: true,
        providerName: "test-email",
        messageIds: [`test-${request.reportId}`],
        attempted: request.recipients.length,
        succeeded: request.recipients.length,
        failed: 0,
        errors: [],
      }),
    );
    const email: EmailProvider = {
      sendReport,
      sendTransactional: async () => ({
        ok: true,
        providerName: "test-email",
        messageIds: [],
        attempted: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      }),
    };
    const pipeline = new ReportPipeline({
      store,
      providers: {
        marketData: new MockMarketDataProvider(),
        news: new MockNewsProvider(),
        email,
        ai: new MockAiProvider(),
      },
      orchestration: new AiOrchestration({
        useMock: true,
        env: testEnv,
        providers: { mock: new MockAiProvider() },
      }),
      skipPdf: true,
      skipEmail: false,
    });

    const result = await pipeline.run({
      firmId: "firm-demo",
      edition: "close_postmarket",
      tradingDate: "2026-08-10",
      idempotencyKey: "test:2026-08-10:close_postmarket:firm-demo",
      useFixtures: true,
      firmName: "Custom Firm (TEST)",
    });

    expect(result.run.status).toBe("completed");
    expect(result.document).toBeDefined();
    expect(result.document?.firmName).toBe("Custom Firm (TEST)");
    expect(result.quality?.ok).toBe(true);
    expect(result.quality?.severity).not.toBe("blocking");

    for (const stage of PIPELINE_STAGES) {
      const record = result.run.stages.find((s) => s.stage === stage);
      expect(record?.status).toBe("completed");
    }

    const keys = new Set(result.document!.sections.map((s) => s.sectionKey));
    for (const required of REQUIRED_SECTION_KEYS) {
      expect(keys.has(required)).toBe(true);
    }

    expect(result.delivery).toBeDefined();
    expect(result.archivePath).toContain("2026-08-10/close_postmarket/");
    expect(result.archivePath).toContain("IB_Market_Data_2026-08-10_Close_Postmarket.pdf");
    expect(result.document?.watchlistTickers?.length).toBeGreaterThan(0);
    expect(result.document?.watchlistTickers).toEqual(
      expect.arrayContaining(["SPY", "QQQ", "TLT"]),
    );
    expect(sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `IB Market Data — ${result.document!.title}`,
      }),
    );
  });

  it("records archivePath without persist when skipPdf is set", async () => {
    const store = new MemoryReportJobStore();
    const pipeline = new ReportPipeline({
      store,
      providers: {
        marketData: new MockMarketDataProvider(),
        news: new MockNewsProvider(),
        email: new MockEmailProvider(),
        ai: new MockAiProvider(),
      },
      orchestration: new AiOrchestration({
        useMock: true,
        env: testEnv,
        providers: { mock: new MockAiProvider() },
      }),
      skipPdf: true,
      skipEmail: true,
    });

    const result = await pipeline.run({
      firmId: "firm-demo",
      edition: "midday",
      tradingDate: "2026-08-10",
      idempotencyKey: "test:skip-persist:midday",
      useFixtures: true,
    });

    expect(result.archivePath).toContain("2026-08-10/midday/");
    expect(result.reportId).toBeUndefined();
  });

  it("calls persistArchive and stores reportId on the archiving artifact", async () => {
    const store = new MemoryReportJobStore();
    const persistArchive = vi.fn(async () => ({
      reportId: "rpt-live-1",
      archivePath: "reports/custom/path.pdf",
    }));
    const pipeline = new ReportPipeline({
      store,
      providers: {
        marketData: new MockMarketDataProvider(),
        news: new MockNewsProvider(),
        email: new MockEmailProvider(),
        ai: new MockAiProvider(),
      },
      orchestration: new AiOrchestration({
        useMock: true,
        env: testEnv,
        providers: { mock: new MockAiProvider() },
      }),
      skipPdf: true,
      skipEmail: true,
      persistArchive,
    });

    const result = await pipeline.run({
      firmId: "firm-demo",
      edition: "midday",
      tradingDate: "2026-08-10",
      idempotencyKey: "test:persist:midday",
      useFixtures: true,
    });

    expect(persistArchive).toHaveBeenCalledTimes(1);
    expect(persistArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        firmId: "firm-demo",
        edition: "midday",
        tradingDate: "2026-08-10",
        status: "completed",
        archivePath: expect.stringContaining("IB_Market_Data_2026-08-10_Midday.pdf"),
      }),
    );
    expect(result.reportId).toBe("rpt-live-1");
    expect(result.archivePath).toBe("reports/custom/path.pdf");
    expect(
      (result.run.artifacts.archiving as { reportId?: string }).reportId,
    ).toBe("rpt-live-1");
  });

  it("is idempotent when stages are already completed", async () => {
    const store = new MemoryReportJobStore();
    const pipeline = new ReportPipeline({
      store,
      providers: {
        marketData: new MockMarketDataProvider(),
        news: new MockNewsProvider(),
        email: new MockEmailProvider(),
        ai: new MockAiProvider(),
      },
      orchestration: new AiOrchestration({
        useMock: true,
        env: testEnv,
        providers: { mock: new MockAiProvider() },
      }),
      skipPdf: true,
    });

    const input = {
      firmId: "firm-demo",
      edition: "midday" as const,
      tradingDate: "2026-08-10",
      idempotencyKey: "test:2026-08-10:midday:firm-demo",
      useFixtures: true,
    };

    const first = await pipeline.run(input);
    expect(first.run.status).toBe("completed");
    expect(first.document?.firmName).toBe("IB Market Data");

    const second = await pipeline.run(input);
    expect(second.run.id).toBe(first.run.id);
    expect(second.run.status).toBe("completed");
    for (const stage of PIPELINE_STAGES) {
      expect(
        second.run.stages.find((s) => s.stage === stage)?.status,
      ).toBe("completed");
    }
  });

  it("holds PDF and email until publishAfter", async () => {
    const store = new MemoryReportJobStore();
    const pipeline = new ReportPipeline({
      store,
      providers: {
        marketData: new MockMarketDataProvider(),
        news: new MockNewsProvider(),
        email: new MockEmailProvider(),
        ai: new MockAiProvider(),
      },
      orchestration: new AiOrchestration({
        useMock: true,
        env: testEnv,
        providers: { mock: new MockAiProvider() },
      }),
      skipPdf: true,
      skipEmail: true,
    });
    const result = await pipeline.run({
      firmId: "firm-demo",
      edition: "close_postmarket",
      tradingDate: "2026-08-10",
      idempotencyKey: "test:hold:close_postmarket",
      useFixtures: true,
      publishAfter: "2026-08-10T21:00:00.000Z",
      now: new Date("2026-08-10T20:00:00.000Z"),
    });
    expect(result.run.status).not.toBe("completed");
    expect(
      result.run.stages.find((s) => s.stage === "rendering_pdf")?.status,
    ).toBe("pending");
  });
});

describe("quality gate + content builder", () => {
  it("accepts a demo document with evidence-backed numbers", () => {
    const market = demoMarketSnapshot("premarket");
    const news = demoNewsItems("premarket");
    const document = buildReportDocument({
      edition: "premarket",
      tradingDate: "2026-08-10",
      market,
      news,
      isDemo: true,
    });
    const evidence = evidenceBundleFromMarket(market, news, {
      extraNumbers: extraNumbersFromDocument(document),
    });
    const quality = runQualityGate(
      {
        title: document.title,
        edition: document.edition,
        tradingDate: document.tradingDate,
        executiveSummary: document.executiveSummary,
        sections: document.sections,
        movers: document.movers,
        claims: document.claims,
        sources: document.sources,
        labels: document.labels,
        theses: document.theses,
        afterHours: document.afterHours,
      },
      evidence,
    );
    const blocking = quality.issues.filter((i) => i.severity === "blocking");
    expect(blocking).toEqual([]);
    expect(quality.ok).toBe(true);
    expect(quality.severity).not.toBe("blocking");
    expect(document.firmName).toBe("IB Market Data");
  });

  it("brands deterministic demo report fixtures", () => {
    expect(DEMO_REPORT_NOTE).toContain("IB Market Data");
    expect(demoReportDocument("close_postmarket").firmName).toBe("IB Market Data (DEMO)");
  });

  it("flags duplicate movers as blocking", () => {
    const market = demoMarketSnapshot("close_postmarket");
    const news = demoNewsItems("close_postmarket");
    const document = buildReportDocument({
      edition: "close_postmarket",
      tradingDate: "2026-08-10",
      market,
      news,
      isDemo: true,
    });
    const evidence = evidenceBundleFromMarket(market, news, {
      extraNumbers: extraNumbersFromDocument(document),
    });
    const quality = runQualityGate(
      {
        title: document.title,
        edition: document.edition,
        tradingDate: document.tradingDate,
        executiveSummary: document.executiveSummary,
        sections: document.sections,
        movers: [...document.movers, document.movers[0]!],
        claims: document.claims,
        sources: document.sources,
      },
      evidence,
    );
    expect(quality.ok).toBe(false);
    expect(quality.issues.some((i) => i.code === "duplicate_mover")).toBe(
      true,
    );
  });
});
