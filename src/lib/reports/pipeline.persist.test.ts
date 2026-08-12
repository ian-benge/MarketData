import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";
import { resetEnvCache } from "@/lib/env";
import { AiOrchestration } from "@/lib/ai/orchestration";
import { demoReportDocument } from "@/lib/fixtures/demo-report";
import {
  MockAiProvider,
  MockEmailProvider,
  MockMarketDataProvider,
  MockNewsProvider,
} from "@/lib/providers/mock";
import { MemoryReportJobStore } from "@/lib/reports/job-store";
import { ReportPipeline } from "@/lib/reports/pipeline";
import { PIPELINE_STAGES } from "@/lib/reports/stages";

vi.mock("@/lib/reports/pdf/render-pdf", () => ({
  renderReportPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

import { renderReportPdf } from "@/lib/reports/pdf/render-pdf";

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

describe("ReportPipeline archive persist resume", () => {
  beforeEach(() => {
    resetEnvCache();
    process.env.ALLOW_MOCK_PROVIDERS = "true";
    vi.mocked(renderReportPdf).mockClear();
  });

  it("re-renders PDF bytes that were sanitized away before persist", async () => {
    const store = new MemoryReportJobStore();
    const input = {
      firmId: "firm-demo",
      edition: "midday" as const,
      tradingDate: "2026-08-10",
      idempotencyKey: "test:omitted-pdf:midday",
      useFixtures: true,
    };
    const created = await store.createRun(input);
    const document = demoReportDocument("midday", "2026-08-10");

    for (const stage of PIPELINE_STAGES) {
      if (stage === "archiving" || stage === "delivering_email") break;
      await store.claimStage(created.id, stage);
      if (stage === "analyzing_and_drafting") {
        await store.completeStage(created.id, stage, { document });
      } else if (stage === "validating_claims") {
        await store.completeStage(created.id, stage, {
          quality: { ok: true, severity: "ok", issues: [] },
        });
      } else if (stage === "rendering_pdf") {
        await store.completeStage(created.id, stage, {
          pdfBytes: { omitted: true, byteLength: 99 },
          skipped: false,
        });
      } else {
        await store.completeStage(created.id, stage, {});
      }
    }

    const persistArchive = vi.fn(
      async (_input: { pdfBytes?: Uint8Array; status: string }) => ({
        reportId: "rpt-resume-1",
      }),
    );
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
      skipPdf: false,
      skipEmail: true,
      persistArchive,
    });

    const result = await pipeline.run(input);

    expect(renderReportPdf).toHaveBeenCalledTimes(1);
    expect(persistArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfBytes: expect.any(Uint8Array),
        status: "completed",
      }),
    );
    const persistedBytes = persistArchive.mock.calls[0]?.[0]?.pdfBytes as
      | Uint8Array
      | undefined;
    expect(persistedBytes?.byteLength).toBe(4);
    expect(result.reportId).toBe("rpt-resume-1");
    expect(result.run.status).toBe("completed");
  });
});
