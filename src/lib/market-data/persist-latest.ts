import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
import {
  effectiveLatencyClass,
  type ExtendedMarketSession,
  type NormalizedQuoteObservation,
} from "@/lib/market-data/schemas";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";

export type PersistLatestResult = {
  persisted: number;
  skipped: number;
};

function resolvePersistFirmId(): string {
  return getEnv().FIRM_ID ?? DEFAULT_FIRM_UUID;
}

/**
 * Write last quotes to market_observations_latest so a cold serverless
 * instance still has a durable tape. Missing catalog symbols are skipped.
 * Never throws to the refresh caller — persist is best-effort.
 */
export async function persistLatestQuoteObservations(
  quotes: NormalizedQuoteObservation[],
  session: ExtendedMarketSession,
  client?: SupabaseClient,
): Promise<PersistLatestResult> {
  if (quotes.length === 0) return { persisted: 0, skipped: 0 };
  if (!client && getEnv().NODE_ENV === "test") {
    return { persisted: 0, skipped: quotes.length };
  }
  const admin =
    client ?? (canCreateAdminClient() ? createAdminClient() : null);
  if (!admin) return { persisted: 0, skipped: quotes.length };

  const firmId = resolvePersistFirmId();
  const tickers = [...new Set(quotes.map((quote) => quote.ticker.toUpperCase()))];
  const { data, error } = await admin
    .from("instruments")
    .select("id, symbol")
    .in("symbol", tickers);
  if (error) throw new Error(error.message);

  const idBySymbol = new Map(
    ((data ?? []) as Array<{ id: string; symbol: string }>).map((row) => [
      row.symbol.toUpperCase(),
      row.id,
    ]),
  );

  const now = new Date().toISOString();
  const rows = [];
  let skipped = 0;
  for (const quote of quotes) {
    const instrumentId = idBySymbol.get(quote.ticker.toUpperCase());
    if (!instrumentId) {
      skipped += 1;
      continue;
    }
    rows.push({
      firm_id: firmId,
      instrument_id: instrumentId,
      provider_name: quote.providerName,
      feed_coverage: quote.feedCoverage,
      latency_class: effectiveLatencyClass(quote.latencyClass, session),
      license_scope_id: quote.licenseScopeId,
      permitted_surfaces: quote.permittedSurfaces,
      value_kind: quote.valueKind,
      market_session: session,
      last: quote.last,
      bid: quote.bid ?? null,
      ask: quote.ask ?? null,
      open: quote.open ?? null,
      high: quote.high ?? null,
      low: quote.low ?? null,
      prior_close: quote.priorClose ?? null,
      volume: quote.volume ?? null,
      change_absolute: quote.changeAbsolute ?? null,
      change_percent: quote.changePercent ?? null,
      currency: quote.currency ?? "USD",
      provider_timestamp: quote.providerTimestamp,
      retrieval_timestamp: quote.retrievalTimestamp,
      persisted_at: now,
      coverage_notes: quote.coverageNotes ?? null,
      raw: { ticker: quote.ticker, instrumentId: quote.instrumentId },
    });
  }

  if (rows.length === 0) return { persisted: 0, skipped };

  const { error: upsertError } = await admin
    .from("market_observations_latest")
    .upsert(rows, {
      onConflict: "firm_id,instrument_id,provider_name,feed_coverage",
    });
  if (upsertError) throw new Error(upsertError.message);
  return { persisted: rows.length, skipped };
}

export async function persistLatestQuoteObservationsSafe(
  quotes: NormalizedQuoteObservation[],
  session: ExtendedMarketSession,
): Promise<PersistLatestResult> {
  try {
    return await persistLatestQuoteObservations(quotes, session);
  } catch {
    return { persisted: 0, skipped: quotes.length };
  }
}
