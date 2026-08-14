import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({
  authorized: true,
  fixtures: false,
  snaptrade: true,
  sessionOpen: true,
  sync: vi.fn(async (_options?: { refresh?: boolean }) => ({
    users: 1,
    imported: 0,
    updated: 0,
    closed: 0,
    errors: [] as string[],
  })),
}));

vi.mock("@/lib/brokerage/cron-auth", () => ({
  authorizeBrokerageCron: async () => state.authorized,
}));

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...actual,
    fixturesEnabled: () => state.fixtures,
  };
});

vi.mock("@/lib/brokerage/client", () => ({
  isSnapTradeConfigured: () => state.snaptrade,
}));

vi.mock("@/lib/scheduling/chicago-schedule", () => ({
  isUsEquityMonitorWindow: () => state.sessionOpen,
}));

vi.mock("@/lib/brokerage/jobs", () => ({
  syncAllLinkedBrokerageHoldings: (options?: { refresh?: boolean }) =>
    state.sync(options),
}));

import { POST } from "./route";

describe("brokerage cron", () => {
  beforeEach(() => {
    state.authorized = true;
    state.fixtures = false;
    state.snaptrade = true;
    state.sessionOpen = true;
    state.sync.mockClear();
  });

  it("is invoked by the Supabase pg_cron job, not a sub-daily Vercel cron", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons.some((row) => row.path === "/api/cron/brokerage")).toBe(
      false,
    );
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260814183023_brokerage_cron_10s.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("brokerage-holdings-sync");
    expect(sql).toContain("10 seconds");
    expect(sql).toContain("/api/cron/brokerage");
    const authSql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260814182241_brokerage_cron_auth.sql",
      ),
      "utf8",
    );
    expect(authSql).toContain("verify_brokerage_cron_secret");
  });

  it("refreshes every linked account during the equity monitor window", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/brokerage", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(state.sync).toHaveBeenCalledWith({ refresh: true });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      users: 1,
    });
  });

  it("does not sync when the session is closed", async () => {
    state.sessionOpen = false;
    const response = await POST(
      new Request("http://localhost/api/cron/brokerage", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(state.sync).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      skipped: "session-closed",
    });
  });
});
