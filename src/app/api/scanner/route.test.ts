import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/session";

const scanner = vi.hoisted(() => ({
  getPayload: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    email: "member@example.com",
    displayName: null,
    role: "member",
    firmId: "firm-1",
    isDemo: false,
  })),
}));

vi.mock("@/lib/scanner/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scanner/service")>();
  return {
    ...actual,
    getScannerPayload: scanner.getPayload,
  };
});

import { GET, POST } from "@/app/api/scanner/route";
import { requirePermission } from "@/lib/auth/authorize";

describe("/api/scanner", () => {
  beforeEach(() => {
    scanner.getPayload.mockReset();
    vi.mocked(requirePermission).mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      displayName: null,
      role: "member",
      firmId: "firm-1",
      isDemo: false,
    });
  });

  it("requires viewDashboard and returns a snapshot payload", async () => {
    scanner.getPayload.mockResolvedValue({
      snapshot: {
        asOf: "2026-08-17T14:42:00.000Z",
        session: "regular",
        lists: { five_pillars: [] },
        alerts: [],
        features: {},
        coverage: { cadenceSeconds: 20, freshness: "mock", coverageNotes: [] },
        mocked: true,
      },
      user: { pins: [], mutes: [], settings: { audioEnabled: true }, presets: [] },
      strategies: [],
    });
    const response = await GET(new Request("http://localhost/api/scanner?system=momentum"));
    const body = (await response.json()) as {
      catalog: Array<{ id: string }>;
      pollSeconds: number;
    };
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("viewDashboard");
    expect(body.pollSeconds).toBe(20);
    expect(body.catalog.some((item) => item.id === "five_pillars")).toBe(true);
  });

  it("rejects unauthenticated callers", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthError("Sign in required", 401));
    const response = await GET(new Request("http://localhost/api/scanner"));
    expect(response.status).toBe(401);
    expect(scanner.getPayload).not.toHaveBeenCalled();
  });

  it("does not accept POST snapshots from the browser", async () => {
    const response = await POST(new Request("http://localhost/api/scanner", { method: "POST" }));
    expect(response.status).toBe(405);
  });
});
