import { fixturesEnabled } from "@/lib/api/http";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { fetchYahooEquityQuotes } from "@/lib/market-data/earnings/yahoo";
import {
  classificationFromYahoo,
  classifyInstrument,
  isQuarantineSymbol,
  QUARANTINE_SYMBOLS,
  type InstrumentClassification,
} from "./instrument-catalog";
import type { InstrumentResolutionRow } from "./types";
import type { ResolutionStatus } from "./taxonomy";

export type InstrumentResolutionPlan = {
  classification: InstrumentClassification;
  resolutionStatus: ResolutionStatus;
  queue: boolean;
  reason: string | null;
};

export function planInstrumentResolution(input: {
  symbol: string;
  currentName?: string | null;
  yahoo: { name: string | null; quoteType: string | null } | null;
}): InstrumentResolutionPlan {
  const symbol = input.symbol.trim().toUpperCase();
  if (isQuarantineSymbol(symbol)) {
    return {
      classification:
        classifyInstrument(symbol) ?? {
          name: symbol,
          securityType: "unknown",
          assetClass: "equity",
        },
      resolutionStatus: "quarantined",
      queue: true,
      reason: "Unresolved after provider verification; do not guess a replacement.",
    };
  }

  if (input.yahoo?.name || input.yahoo?.quoteType) {
    const classification = classificationFromYahoo({
      symbol,
      name: input.yahoo.name,
      quoteType: input.yahoo.quoteType,
    });
    const named = classification.name !== symbol;
    const typed = classification.securityType !== "unknown";
    if (named || typed) {
      return {
        classification,
        resolutionStatus: "resolved",
        queue: false,
        reason: null,
      };
    }
  }

  const catalog = classifyInstrument(symbol);
  if (catalog && catalog.name !== symbol && catalog.securityType !== "unknown") {
    return {
      classification: catalog,
      resolutionStatus: "resolved",
      queue: false,
      reason: null,
    };
  }

  return {
    classification: catalog ?? {
      name: input.currentName && input.currentName !== symbol ? input.currentName : symbol,
      securityType: "unknown",
      assetClass: "equity",
    },
    resolutionStatus: "unverified",
    queue: true,
    reason: input.yahoo
      ? "Provider returned no usable identity."
      : "No provider quote for this symbol.",
  };
}

function mapQueueRow(row: {
  id: string;
  instrument_id: string;
  symbol: string;
  status: string;
  suggested_symbol: string | null;
  suggested_name: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}): InstrumentResolutionRow {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    symbol: row.symbol,
    status: row.status as InstrumentResolutionRow["status"],
    suggestedSymbol: row.suggested_symbol,
    suggestedName: row.suggested_name,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listInstrumentResolutionQueue(): Promise<{
  items: InstrumentResolutionRow[];
  fixtures: boolean;
}> {
  if (fixturesEnabled()) {
    const now = new Date().toISOString();
    return {
      fixtures: true,
      items: QUARANTINE_SYMBOLS.map((symbol) => ({
        id: `queue-${symbol}`,
        instrumentId: `inst-${symbol}`,
        symbol,
        status: "open" as const,
        suggestedSymbol: null,
        suggestedName: null,
        reason: "Unresolved after provider verification; do not guess a replacement.",
        createdAt: now,
        updatedAt: now,
      })),
    };
  }
  if (!canCreateAdminClient()) return { items: [], fixtures: false };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("instrument_resolution_queue")
    .select(
      "id, instrument_id, symbol, status, suggested_symbol, suggested_name, reason, created_at, updated_at",
    )
    .in("status", ["open", "suggested"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return {
    fixtures: false,
    items: ((data as Array<Parameters<typeof mapQueueRow>[0]> | null) ?? []).map(
      mapQueueRow,
    ),
  };
}

export async function updateInstrumentResolution(input: {
  id: string;
  action: "dismiss" | "resolve";
  userId?: string | null;
}): Promise<InstrumentResolutionRow | null> {
  if (fixturesEnabled()) {
    return {
      id: input.id,
      instrumentId: input.id,
      symbol: input.id.replace(/^queue-/, ""),
      status: input.action === "dismiss" ? "dismissed" : "resolved",
      suggestedSymbol: null,
      suggestedName: null,
      reason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  if (!canCreateAdminClient()) return null;
  const supabase = createAdminClient();
  const status = input.action === "dismiss" ? "dismissed" : "resolved";
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("instrument_resolution_queue")
    .update({
      status,
      updated_at: now,
      resolved_at: now,
      resolved_by: input.userId ?? null,
    })
    .eq("id", input.id)
    .select(
      "id, instrument_id, symbol, status, suggested_symbol, suggested_name, reason, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (status === "resolved" && data.instrument_id) {
    await supabase
      .from("instruments")
      .update({
        resolution_status: "resolved",
        last_verified_at: now,
      })
      .eq("id", data.instrument_id);
  }
  return mapQueueRow(data as Parameters<typeof mapQueueRow>[0]);
}

export async function resolveStaleInstruments(
  options: { limit?: number } = {},
): Promise<{ scanned: number; resolved: number; queued: number }> {
  if (!canCreateAdminClient() || fixturesEnabled()) {
    return { scanned: 0, resolved: 0, queued: 0 };
  }
  const supabase = createAdminClient();
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 120);
  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol, name, resolution_status")
    .in("resolution_status", ["unverified", "quarantined"])
    .order("symbol", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows =
    (data as Array<{
      id: string;
      symbol: string;
      name: string;
      resolution_status: string;
    }> | null) ?? [];
  if (!rows.length) return { scanned: 0, resolved: 0, queued: 0 };

  const needYahoo = rows.filter((row) => !isQuarantineSymbol(row.symbol));
  let yahoo = new Map<string, { name: string | null; quoteType: string | null }>();
  if (needYahoo.length) {
    const quotes = await fetchYahooEquityQuotes(needYahoo.map((row) => row.symbol));
    yahoo = new Map(
      [...quotes.entries()].map(([symbol, quote]) => [
        symbol.toUpperCase(),
        { name: quote.name, quoteType: quote.quoteType },
      ]),
    );
  }

  let resolved = 0;
  let queued = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const plan = planInstrumentResolution({
      symbol: row.symbol,
      currentName: row.name,
      yahoo: yahoo.get(row.symbol.toUpperCase()) ?? null,
    });
    const { error: updateError } = await supabase
      .from("instruments")
      .update({
        name: plan.classification.name,
        security_type: plan.classification.securityType,
        asset_class: plan.classification.assetClass,
        exchange: plan.classification.exchange ?? null,
        issuer: plan.classification.issuer ?? null,
        underlying_symbol: plan.classification.underlyingSymbol ?? null,
        leverage_multiple: plan.classification.leverageMultiple ?? 1,
        is_inverse: plan.classification.isInverse ?? false,
        is_otc: plan.classification.isOtc ?? false,
        country: plan.classification.country ?? null,
        quote_source: plan.classification.quoteSource ?? "yahoo",
        resolution_status: plan.resolutionStatus,
        last_verified_at: now,
      })
      .eq("id", row.id);
    if (updateError) continue;
    if (plan.queue) {
      const { error: queueError } = await supabase
        .from("instrument_resolution_queue")
        .upsert(
          {
            instrument_id: row.id,
            symbol: row.symbol.toUpperCase(),
            status: "open",
            reason: plan.reason,
            updated_at: now,
          },
          { onConflict: "instrument_id" },
        );
      if (!queueError) queued += 1;
    } else {
      resolved += 1;
      await supabase
        .from("instrument_resolution_queue")
        .update({ status: "resolved", resolved_at: now, updated_at: now })
        .eq("instrument_id", row.id)
        .in("status", ["open", "suggested"]);
    }
  }
  return { scanned: rows.length, resolved, queued };
}
