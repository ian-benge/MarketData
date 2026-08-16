import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistLatestQuoteObservations } from "@/lib/market-data/persist-latest";
import type { NormalizedQuoteObservation } from "@/lib/market-data/schemas";

function quote(ticker: string): NormalizedQuoteObservation {
  return {
    instrumentId: `alpaca:${ticker}`,
    ticker,
    last: 10,
    priorClose: 9,
    changeAbsolute: 1,
    changePercent: 11.11,
    marketSession: "closed",
    providerName: "alpaca",
    providerTimestamp: "2026-08-14T20:00:00.000Z",
    retrievalTimestamp: "2026-08-15T18:00:00.000Z",
    feedCoverage: "iex",
    latencyClass: "realtime",
    licenseScopeId: "alpaca:test",
    permittedSurfaces: ["dashboard_display"],
    valueKind: "normalized",
  };
}

describe("persistLatestQuoteObservations", () => {
  it("upserts catalog-matched quotes and skips unknown symbols", async () => {
    const upsert = vi.fn(async () => ({ data: null, error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "instruments") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "11111111-1111-4111-8111-111111111111", symbol: "SPY" }],
                error: null,
              }),
            }),
          };
        }
        return {
          upsert,
        };
      }),
    } as unknown as SupabaseClient;

    const result = await persistLatestQuoteObservations(
      [quote("SPY"), quote("ZZZZ")],
      "closed",
      client,
    );

    expect(result).toEqual({ persisted: 1, skipped: 1 });
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          instrument_id: "11111111-1111-4111-8111-111111111111",
          last: 10,
          latency_class: "eod",
          market_session: "closed",
        }),
      ],
      expect.objectContaining({
        onConflict: "firm_id,instrument_id,provider_name,feed_coverage",
      }),
    );
  });
});
