import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cronOk: false,
  canAdmin: true,
  rpc: vi.fn(async () => ({ data: false, error: null })),
}));

vi.mock("@/lib/api/http", () => ({
  verifyCronSecret: () => state.cronOk,
}));

vi.mock("@/lib/supabase/admin", () => ({
  canCreateAdminClient: () => state.canAdmin,
  createAdminClient: () => ({ rpc: state.rpc }),
}));

import { authorizeBrokerageCron } from "./cron-auth";

describe("authorizeBrokerageCron", () => {
  beforeEach(() => {
    state.cronOk = false;
    state.canAdmin = true;
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: false, error: null });
  });

  it("accepts the Vercel CRON_SECRET", async () => {
    state.cronOk = true;
    await expect(
      authorizeBrokerageCron(
        new Request("http://localhost/api/cron/brokerage"),
      ),
    ).resolves.toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("accepts the Vault token used by pg_cron", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    await expect(
      authorizeBrokerageCron(
        new Request("http://localhost/api/cron/brokerage", {
          headers: { authorization: "Bearer vault-token" },
        }),
      ),
    ).resolves.toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("verify_brokerage_cron_secret", {
      provided: "vault-token",
    });
  });

  it("rejects a missing token", async () => {
    await expect(
      authorizeBrokerageCron(
        new Request("http://localhost/api/cron/brokerage"),
      ),
    ).resolves.toBe(false);
  });
});
