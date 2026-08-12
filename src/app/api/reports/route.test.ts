import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({
  fixtures: false,
  admin: false,
}));

const runOnDemand = vi.hoisted(() => ({
  fn: vi.fn(),
}));

const liveReports = vi.hoisted(() => ({
  list: vi.fn(async () => [] as unknown[]),
  get: vi.fn(async () => null as unknown),
  job: vi.fn(async () => null as unknown),
  pdf: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...actual,
    fixturesEnabled: () => flags.fixtures,
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  requirePermission: vi.fn(async () => ({
    email: "member@example.com",
    role: "member",
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  canCreateAdminClient: () => flags.admin,
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/reports/run-on-demand", () => ({
  runOnDemandReport: runOnDemand.fn,
  resolveFirmId: () => "a0000000-0000-4000-8000-000000000001",
}));

vi.mock("@/lib/reports/live-reports", () => ({
  isLiveReportsAvailable: () => flags.admin,
  listLiveReports: liveReports.list,
  getLiveReport: liveReports.get,
  getLiveReportJob: liveReports.job,
  getLiveReportPdf: liveReports.pdf,
}));

import { GET as getReports, POST as createReport } from "@/app/api/reports/route";
import { GET as getReport } from "@/app/api/reports/[id]/route";

describe("POST /api/reports", () => {
  beforeEach(() => {
    flags.fixtures = false;
    flags.admin = false;
    runOnDemand.fn.mockReset();
    liveReports.list.mockReset();
    liveReports.get.mockReset();
  });

  it("keeps the fixture stub when demo fixtures are enabled", async () => {
    flags.fixtures = true;
    const response = await createReport(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edition: "midday" }),
      }),
    );
    const body = (await response.json()) as {
      id: string;
      demo: boolean;
      message: string;
    };
    expect(response.status).toBe(200);
    expect(body.id).toMatch(/^rpt-demo-ondemand-/);
    expect(body.demo).toBe(true);
    expect(body.message).toContain("fixture session only");
    expect(runOnDemand.fn).not.toHaveBeenCalled();
  });

  it("returns 503 when live mode has no admin client", async () => {
    flags.fixtures = false;
    flags.admin = false;
    const response = await createReport(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edition: "close_postmarket" }),
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("not connected"),
    });
    expect(runOnDemand.fn).not.toHaveBeenCalled();
  });

  it("runs the live pipeline and returns demo: false with an id", async () => {
    flags.fixtures = false;
    flags.admin = true;
    runOnDemand.fn.mockResolvedValue({
      id: "rpt-live-123",
      runId: "run-live-123",
      status: "completed",
      demo: false,
      archivePath: "reports/2026-08-12/midday/file.pdf",
      message: "Brief completed and archived.",
    });

    const response = await createReport(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edition: "midday" }),
      }),
    );
    const body = (await response.json()) as {
      id: string;
      demo: boolean;
      status: string;
    };
    expect(response.status).toBe(200);
    expect(body.id).toBe("rpt-live-123");
    expect(body.demo).toBe(false);
    expect(body.status).toBe("completed");
    expect(runOnDemand.fn).toHaveBeenCalledWith({ edition: "midday" });
  });

  it("returns an error payload with id when the pipeline fails", async () => {
    flags.fixtures = false;
    flags.admin = true;
    runOnDemand.fn.mockResolvedValue({
      id: "run-failed-1",
      runId: "run-failed-1",
      status: "failed",
      demo: false,
      message: "Quality gate blocking issues",
    });

    const response = await createReport(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edition: "premarket" }),
      }),
    );
    const body = (await response.json()) as {
      error: string;
      id: string;
      status: string;
      demo: boolean;
    };
    expect(response.status).toBe(500);
    expect(body.error).toContain("Quality gate");
    expect(body.id).toBe("run-failed-1");
    expect(body.status).toBe("failed");
    expect(body.demo).toBe(false);
  });
});

describe("GET /api/reports", () => {
  beforeEach(() => {
    flags.fixtures = false;
    flags.admin = false;
    liveReports.list.mockReset();
    liveReports.get.mockReset();
  });

  it("returns an empty collection when demo is off and the store is not connected", async () => {
    const response = await getReports(
      new Request("http://localhost/api/reports"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reports: [] });
    expect(liveReports.list).not.toHaveBeenCalled();
  });

  it("lists live reports when the admin client is available", async () => {
    flags.admin = true;
    liveReports.list.mockResolvedValue([
      {
        id: "rpt-live-1",
        edition: "midday",
        tradingDate: "2026-08-12",
        status: "completed",
        headlineSummary: "Live brief",
        completedAt: "2026-08-12T16:00:00.000Z",
        tickers: ["SPY"],
      },
    ]);
    const response = await getReports(
      new Request("http://localhost/api/reports?edition=midday"),
    );
    const body = (await response.json()) as { reports: Array<{ id: string }> };
    expect(response.status).toBe(200);
    expect(body.reports[0]?.id).toBe("rpt-live-1");
    expect(liveReports.list).toHaveBeenCalled();
  });
});

describe("GET /api/reports/[id]", () => {
  beforeEach(() => {
    flags.fixtures = false;
    flags.admin = false;
    liveReports.get.mockReset();
  });

  it("returns a live report when the store is connected", async () => {
    flags.admin = true;
    liveReports.get.mockResolvedValue({
      id: "rpt-live-1",
      edition: "midday",
      tradingDate: "2026-08-12",
      status: "completed",
      headlineSummary: "Live brief",
      completedAt: "2026-08-12T16:00:00.000Z",
      tickers: ["SPY"],
      htmlBody: "",
      pdfAvailable: true,
      sections: [{ title: "Overview", body: "Tape firmer." }],
      citations: [],
    });
    const response = await getReport(
      new Request("http://localhost/api/reports/rpt-live-1"),
      { params: Promise.resolve({ id: "rpt-live-1" }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "rpt-live-1",
      pdfAvailable: true,
    });
  });
});
