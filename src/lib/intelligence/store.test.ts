import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const flags = vi.hoisted(() => ({ admin: true }));

vi.mock("@/lib/supabase/admin", () => ({
  canCreateAdminClient: () => flags.admin,
  createAdminClient: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => upsert(...args),
    }),
  }),
}));

import { persistNewsItems } from "./store";
import type { NormalizedNewsItem } from "@/lib/providers/types";

const item: NormalizedNewsItem = {
  id: "finnhub-news-1",
  title: "NVIDIA files 8-K",
  url: "https://example.com/n",
  publishedAt: "2026-08-15T14:00:00.000Z",
  retrievedAt: "2026-08-15T14:01:00.000Z",
  tickers: ["NVDA"],
  sourceClass: "wire",
  providerName: "finnhub",
  sourceQuality: "secondary",
};

describe("persistNewsItems", () => {
  beforeEach(() => {
    flags.admin = true;
    upsert.mockReset();
  });

  function mockUpsert(result: { data: unknown; error: { message: string } | null }) {
    upsert.mockReturnValue({
      select: () => Promise.resolve(result),
    });
  }

  it("surfaces PostgREST upsert errors instead of swallowing them", async () => {
    mockUpsert({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    });
    const result = await persistNewsItems([item]);
    expect(result.written).toBe(0);
    expect(result.error).toMatch(/duplicate key/i);
    expect(upsert).toHaveBeenCalled();
  });

  it("counts written rows on a successful upsert", async () => {
    mockUpsert({
      data: [{ external_id: item.id }],
      error: null,
    });
    const result = await persistNewsItems([item]);
    expect(result.attempted).toBe(1);
    expect(result.written).toBe(1);
    expect(result.error).toBeNull();
  });

  it("skips writes when the admin client is not configured", async () => {
    flags.admin = false;
    const result = await persistNewsItems([item]);
    expect(result.skipped).toBe("no_admin_client");
    expect(upsert).not.toHaveBeenCalled();
  });
});
