import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtureMode = vi.hoisted(() => ({ enabled: false }));
const dashboardCache = vi.hoisted(() => ({
  snapshot: null as null | Record<string, unknown>,
}));
const researchState = vi.hoisted(() => ({
  headlines: [] as unknown[],
  calendar: [] as unknown[],
}));

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...actual,
    fixturesEnabled: () => fixtureMode.enabled,
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  assertAdmin: vi.fn(async () => ({
    email: "admin@example.com",
    role: "admin",
  })),
  requirePermission: vi.fn(async () => ({
    email: "member@example.com",
    role: "member",
  })),
}));

vi.mock("@/lib/market-data/cache", () => ({
  getMarketDataCache: () => ({
    getDashboardSnapshot: () => dashboardCache.snapshot,
    getMeta: () => ({
      lastSuccessfulRefreshAt:
        typeof dashboardCache.snapshot?.asOf === "string"
          ? dashboardCache.snapshot.asOf
          : null,
    }),
  }),
}));

vi.mock("@/lib/dashboard/research-context", () => ({
  getDashboardResearch: vi.fn(async () => ({
    headlines: researchState.headlines,
    calendar: researchState.calendar,
    fetchedAt: "2026-08-11T15:00:00.000Z",
  })),
}));

vi.mock("@/lib/market-data/refresh-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/market-data/refresh-service")>();
  return {
    ...actual,
    runMarketDataRefresh: vi.fn(async () => ({
      status: "skipped",
      skippedReason: "fixture-safety-test",
    })),
  };
});

vi.mock("@/lib/providers/registry", () => ({
  createProviders: () => ({ registry: { list: () => [] } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  canCreateAdminClient: () => false,
  createAdminClient: vi.fn(),
}));

import {
  GET as getInvitations,
  POST as createInvitation,
} from "@/app/api/admin/invitations/route";
import { POST as createUser } from "@/app/api/admin/users/route";
import { POST as resendDelivery } from "@/app/api/admin/deliveries/[id]/resend/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import {
  GET as getProposals,
  POST as createProposal,
} from "@/app/api/proposals/route";
import {
  GET as getReports,
  POST as createReport,
} from "@/app/api/reports/route";
import { GET as getSectors } from "@/app/api/sectors/route";
import { GET as getReport } from "@/app/api/reports/[id]/route";
import { GET as getReportJob } from "@/app/api/reports/[id]/jobs/route";
import { GET as getReportPdf } from "@/app/api/reports/[id]/pdf/route";
import {
  GET as getWatchlists,
  POST as createWatchlist,
} from "@/app/api/watchlists/route";
import {
  GET as getPositions,
  POST as createPosition,
} from "@/app/api/positions/route";
import { POST as snapshotPositions } from "@/app/api/positions/snapshot/route";

const request = (path: string, method = "GET") =>
  new Request(`http://localhost${path}`, { method });

describe("fixture-backed API safety", () => {
  beforeEach(() => {
    fixtureMode.enabled = false;
    dashboardCache.snapshot = null;
    researchState.headlines = [];
    researchState.calendar = [];
  });

  it("returns an empty unavailable dashboard instead of relabelled fixtures", async () => {
    const response = await getDashboard();
    const body = (await response.json()) as {
      tape: unknown[];
      movers: unknown[];
      headlines: unknown[];
      calendar: unknown[];
      providers: unknown[];
      latestReport: unknown;
      latencyClass: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      tape: [],
      movers: [],
      headlines: [],
      calendar: [],
      providers: [],
      latestReport: null,
      latencyClass: "unavailable",
    });
  });

  it("does not inject fixture research fields into a cached live dashboard", async () => {
    dashboardCache.snapshot = {
      asOf: "2026-08-10T20:00:00.000Z",
      dataCutoff: "2026-08-10T20:00:00.000Z",
      stale: false,
      tape: [],
      movers: [],
      latencyCoverageLabel: "Unavailable",
      feedCoverage: "unknown",
      latencyClass: "unavailable",
      marketSession: null,
      breadth: { supported: false, explanation: "Not configured" },
    };

    const response = await getDashboard();
    const body = (await response.json()) as {
      headlines: unknown[];
      calendar: unknown[];
      latestReport: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.headlines).toEqual([]);
    expect(body.calendar).toEqual([]);
    expect(body.latestReport).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Chipmakers advance");
  });

  it("passes live research through without substituting fixture copy", async () => {
    dashboardCache.snapshot = {
      asOf: "2026-08-11T14:00:00.000Z",
      dataCutoff: "2026-08-11T14:00:00.000Z",
      stale: false,
      tape: [],
      movers: [],
      latencyCoverageLabel: "IEX realtime",
      feedCoverage: "iex",
      latencyClass: "realtime",
      marketSession: "regular",
      breadth: { supported: false, explanation: "IEX" },
    };
    researchState.headlines = [
      {
        id: "rss-fed-1",
        title: "Federal Reserve issues FOMC statement",
        url: "https://www.federalreserve.gov/newsevents/pressreleases/1.htm",
        publishedAt: "2026-08-11T14:00:00.000Z",
        retrievedAt: "2026-08-11T14:05:00.000Z",
        tickers: [],
        sourceClass: "primary",
        providerName: "rss",
        sourceQuality: "secondary",
      },
    ];
    researchState.calendar = [
      {
        id: "nyse-holiday-2026-09-07",
        title: "NYSE closed — Labor Day",
        category: "other",
        scheduledAt: "2026-09-07T13:30:00.000Z",
        timeZone: "America/Chicago",
        providerName: "nyse-calendar",
        providerTimestamp: "2026-08-11T14:00:00.000Z",
        retrievalTimestamp: "2026-08-11T14:00:00.000Z",
        sourceQuality: "primary",
      },
    ];

    const response = await getDashboard();
    const body = (await response.json()) as {
      headlines: Array<{ title: string; sourceQuality: string }>;
      calendar: Array<{ title: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.headlines[0]?.title).toContain("FOMC");
    expect(body.headlines[0]?.sourceQuality).not.toBe("mock");
    expect(body.calendar[0]?.title).toContain("Labor Day");
    expect(JSON.stringify(body)).not.toContain("Chipmakers advance");
  });

  it("returns empty fixture collections when demo mode is disabled", async () => {
    const watchlists = await getWatchlists();
    const proposals = await getProposals();
    const reports = await getReports(request("/api/reports"));
    const sectors = await getSectors();
    const invitations = await getInvitations();

    await expect(watchlists.json()).resolves.toEqual({ watchlists: [] });
    await expect(proposals.json()).resolves.toEqual({ proposals: [] });
    await expect(reports.json()).resolves.toEqual({ reports: [] });
    await expect(sectors.json()).resolves.toEqual({ sectors: [] });
    await expect(invitations.json()).resolves.toEqual({ invitations: [] });

    const positions = await getPositions(request("/api/positions"));
    const positionsBody = (await positions.json()) as {
      usingFixtures: boolean;
      positions: unknown[];
      persistence: string;
    };
    expect(positions.status).toBe(200);
    expect(positionsBody.usingFixtures).toBe(false);
    expect(positionsBody.positions).toEqual([]);
    expect(positionsBody.persistence).toBe("unavailable");
    expect((positionsBody as { owners?: unknown[] }).owners).toEqual([]);
    expect(JSON.stringify(positionsBody)).not.toContain("pos-nvda-core");
  });

  it("refuses synthetic mutation success when demo mode is disabled", async () => {
    const responses = await Promise.all([
      createWatchlist(request("/api/watchlists", "POST")),
      createPosition(request("/api/positions", "POST")),
      snapshotPositions(request("/api/positions/snapshot", "POST")),
      createProposal(request("/api/proposals", "POST")),
      createReport(request("/api/reports", "POST")),
      createInvitation(request("/api/admin/invitations", "POST")),
      createUser(request("/api/admin/users", "POST")),
      resendDelivery(request("/api/admin/deliveries/del-1/resend", "POST"), {
        params: Promise.resolve({ id: "del-1" }),
      }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("not connected"),
      });
    }
  });

  it("refuses fixture report detail, job, and PDF reads outside demo mode", async () => {
    const context = { params: Promise.resolve({ id: "rpt-demo-001" }) };
    const responses = await Promise.all([
      getReport(request("/api/reports/rpt-demo-001"), context),
      getReportJob(request("/api/reports/rpt-demo-001/jobs"), context),
      getReportPdf(request("/api/reports/rpt-demo-001/pdf"), context),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("not connected"),
      });
    }
  });

  it("preserves explicitly marked fixture responses in demo mode", async () => {
    fixtureMode.enabled = true;

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
  });
});
