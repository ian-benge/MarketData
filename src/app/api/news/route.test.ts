import { beforeEach, describe, expect, it, vi } from "vitest";

const searchIntelligence = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  getEnv: () => ({}),
}));

vi.mock("@/lib/auth/authorize", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    email: "member@example.com",
    role: "member",
    firmId: "firm-1",
  })),
}));

vi.mock("@/lib/intelligence/service", () => ({
  coverageFromCollections: () => [],
  quotesFromMarketCache: () => [],
  searchIntelligence,
}));

vi.mock("@/lib/watchlists/store", () => ({
  listStoredWatchlists: vi.fn(async () => ({ lists: [], persistence: "unavailable" })),
  listStoredSectors: vi.fn(async () => ({ sectors: [], persistence: "unavailable" })),
}));

import { GET } from "@/app/api/news/route";

describe("GET /api/news", () => {
  beforeEach(() => {
    searchIntelligence.mockReset();
    searchIntelligence.mockResolvedValue({
      parsed: {
        raw: "",
        intent: "search",
        textTerms: [],
        tickers: [],
        eventTypes: [],
        themes: [],
        sources: [],
        timeRange: null,
        materialOnly: false,
        whyTicker: null,
      },
      events: [],
      moves: [],
      bundle: {
        events: [],
        headlines: [],
        moves: [],
        gaps: [],
        sources: [],
        fetchedAt: "2026-08-15T18:00:00.000Z",
        stale: false,
      },
    });
  });

  it("ingests on a live Material News search", async () => {
    const response = await GET(new Request("http://localhost/api/news?q=NVDA"));
    expect(response.status).toBe(200);
    expect(searchIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      "NVDA",
      expect.objectContaining({ query: "NVDA" }),
      expect.objectContaining({ ingest: true, quotes: [] }),
    );
  });

  it("does not ingest for command-palette cached searches", async () => {
    const response = await GET(
      new Request("http://localhost/api/news?q=NVDA&limit=6&freshness=cached"),
    );
    expect(response.status).toBe(200);
    expect(searchIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      "NVDA",
      expect.objectContaining({ query: "NVDA" }),
      expect.objectContaining({ ingest: false }),
    );
  });
});
