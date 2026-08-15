import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/desk-intel/rate-limit";

const getSessionBrief = vi.hoisted(() => vi.fn());
const askDesk = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", DESK_INTEL_ENABLED: true }),
}));

vi.mock("@/lib/auth/authorize", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    email: "member@example.com",
    role: "member",
    firmId: "a0000000-0000-4000-8000-000000000001",
  })),
}));

vi.mock("@/lib/desk-intel/service", () => ({
  getSessionBrief,
  askDesk,
  rulesOnlyFromRequest: (request: Request) =>
    new URL(request.url).searchParams.get("rules") === "1",
}));

import { GET } from "@/app/api/intel/session/route";
import { POST as POST_ASK } from "@/app/api/intel/ask/route";

const envelope = {
  kind: "session_brief",
  subject: "session",
  method: "rules",
  model: null,
  providerName: null,
  promptVersion: "session_brief@v1",
  evidenceHash: "abc",
  generatedAt: "2026-08-15T18:00:00.000Z",
  cached: false,
  warnings: [],
  sources: [],
  data: {
    headline: "IREN files 8-K · 2 significant tape names",
    sessionRead: "1 significant name lacks a verified catalyst.",
    materialNow: [],
    unexplainedTape: [],
    bookFlags: [],
    themes: [],
    watchItems: [],
    gaps: [],
    unresolvedQuestions: [],
  },
};

describe("desk intel API", () => {
  beforeEach(() => {
    resetRateLimits();
    getSessionBrief.mockReset();
    askDesk.mockReset();
    getSessionBrief.mockResolvedValue(envelope);
    askDesk.mockResolvedValue({
      ...envelope,
      kind: "grounded_ask",
      data: {
        answer: "IREN filed an 8-K.",
        nature: "fact",
        claims: [],
        sourceIds: ["src-iren-8k"],
        followUps: [],
      },
    });
  });

  it("ingests headlines when the session brief is force-refreshed", async () => {
    const response = await GET(
      new Request("http://localhost/api/intel/session?refresh=1"),
    );
    expect(response.status).toBe(200);
    expect(getSessionBrief).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forceRefresh: true, ingest: true }),
    );
  });

  it("returns a session brief", async () => {
    const response = await GET(new Request("http://localhost/api/intel/session"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { headline?: string; data?: { headline: string } };
    expect(body.data?.headline ?? body.headline).toMatch(/IREN/);
    expect(getSessionBrief).toHaveBeenCalled();
  });

  it("asks the desk from the current evidence pack", async () => {
    const response = await POST_ASK(
      new Request("http://localhost/api/intel/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Why is IREN moving today?" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(askDesk).toHaveBeenCalled();
  });

  it("rejects a too-short question", async () => {
    const response = await POST_ASK(
      new Request("http://localhost/api/intel/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "hi" }),
      }),
    );
    expect(response.status).not.toBe(200);
    expect(askDesk).not.toHaveBeenCalled();
  });
});
