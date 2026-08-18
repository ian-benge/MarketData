import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { canCreateServerClient, createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import type { EvaluateScanResult } from "./evaluate";
import { profileFromHistory, type HistoryDay, type TickerHistoryFlags } from "./history";
import type { ScannerSessionClock } from "./session";
import type {
  PriorAlertState,
  ScannerAlertEvent,
  ScannerAlertSettings,
  ScannerCenterSnapshot,
  ScannerFeatureSnapshot,
  ScannerPreset,
} from "./types";
import { DEFAULT_ALERT_SETTINGS } from "./types";

function adminOrNull() {
  if (getEnv().NODE_ENV === "test") return null;
  if (!canCreateAdminClient()) return null;
  return createAdminClient();
}

export async function persistScannerTick(input: {
  firmId: string;
  snapshot: ScannerCenterSnapshot;
  evaluated: EvaluateScanResult;
  clock: ScannerSessionClock;
  cadenceSeconds: number;
}): Promise<{ runId: string | null }> {
  const admin = adminOrNull();
  if (!admin) return { runId: null };

  const { data: run, error: runError } = await admin
    .from("scanner_runs")
    .insert({
      firm_id: input.firmId,
      started_at: input.snapshot.asOf,
      finished_at: new Date().toISOString(),
      session: input.clock.session,
      session_date: input.clock.sessionDate,
      status: "completed",
      cadence_seconds: input.cadenceSeconds,
      symbols_requested: input.snapshot.coverage.symbolsRequested,
      symbols_received: input.snapshot.coverage.symbolsReceived,
      alerts_emitted: input.evaluated.emitted,
      alerts_consolidated: input.evaluated.consolidated,
      provider_name: input.snapshot.coverage.providerName,
      feed_coverage: input.snapshot.coverage.feedCoverage,
      latency_class: input.snapshot.coverage.latencyClass,
      coverage_notes: input.snapshot.coverage.coverageNotes.join(" "),
      meta: { notes: input.snapshot.coverage.coverageNotes },
    })
    .select("id")
    .single();
  if (runError) {
    console.error("[scanner] persist run", runError.message);
    return { runId: null };
  }
  const runId = (run as { id: string }).id;

  const featureRows = Object.values(input.snapshot.features).map((feature) => ({
    firm_id: input.firmId,
    ticker: feature.ticker,
    captured_at: feature.asOf,
    session: feature.session,
    session_date: feature.sessionDate,
    features: feature,
    provider_name: feature.providerName,
    feed_coverage: feature.feedCoverage,
    latency_class: feature.latencyClass,
    stale: feature.stale,
  }));
  if (featureRows.length) {
    const { error } = await admin
      .from("scanner_feature_snapshots")
      .upsert(featureRows, { onConflict: "firm_id,ticker" });
    if (error) console.error("[scanner] persist features", error.message);
  }

  const historyTickers = new Set([
    ...input.evaluated.alerts.map((row) => row.ticker),
    ...Object.values(input.evaluated.lists).flatMap((rows) =>
      rows.map((row) => row.ticker),
    ),
  ]);
  const historyRows = Object.values(input.snapshot.features)
    .filter((feature) => historyTickers.has(feature.ticker))
    .map((feature) => ({
      firm_id: input.firmId,
      ticker: feature.ticker,
      captured_at: feature.asOf,
      session: feature.session,
      session_date: feature.sessionDate,
      run_id: runId,
      features: feature,
    }));
  if (historyRows.length) {
    const { error } = await admin.from("scanner_feature_history").insert(historyRows);
    if (error) console.error("[scanner] persist history", error.message);
  }

  const ranked = Object.entries(input.evaluated.lists).flatMap(([strategyId, rows]) =>
    rows.map((row) => ({
      firm_id: input.firmId,
      run_id: runId,
      system: row.system,
      strategy_id: strategyId,
      session: input.clock.session,
      session_date: input.clock.sessionDate,
      rank: row.rank,
      ticker: row.ticker,
      score: row.opportunity.total,
      row,
      captured_at: input.snapshot.asOf,
    })),
  );
  if (ranked.length) {
    const { error } = await admin
      .from("scanner_ranked_rows")
      .upsert(ranked, { onConflict: "firm_id,system,strategy_id,session_date,ticker" });
    if (error) console.error("[scanner] persist ranked", error.message);
  }

  for (const alert of input.evaluated.alerts) {
    if (alert.status === "consolidated") {
      const { error } = await admin
        .from("scanner_alert_events")
        .update({
          status: "consolidated",
          last_seen_at: alert.lastSeenAt,
          occurrence_count: alert.occurrenceCount,
          payload: alert,
        })
        .eq("id", alert.id)
        .eq("firm_id", input.firmId);
      if (error) console.error("[scanner] update alert", error.message);
      continue;
    }
    const { error } = await admin.from("scanner_alert_events").insert({
      id: alert.id,
      firm_id: input.firmId,
      run_id: runId,
      system: alert.system,
      strategy_id: alert.strategyId,
      ticker: alert.ticker,
      fired_at: alert.firedAt,
      session: alert.session,
      session_date: alert.sessionDate,
      status: alert.status,
      consolidation_id: alert.consolidationId,
      occurrence_count: alert.occurrenceCount,
      last_seen_at: alert.lastSeenAt,
      payload: alert,
    });
    if (error) console.error("[scanner] insert alert", error.message);
  }

  await refreshTickerProfiles(admin, input.firmId, Object.values(input.snapshot.features));
  return { runId };
}

export async function refreshTickerProfiles(
  admin: ReturnType<typeof createAdminClient>,
  firmId: string,
  features: ScannerFeatureSnapshot[],
) {
  if (!features.length) return;
  const tickers = [...new Set(features.map((row) => row.ticker))];
  const { data, error } = await admin
    .from("scanner_ticker_profiles")
    .select("ticker, stats")
    .eq("firm_id", firmId)
    .in("ticker", tickers);
  if (error) {
    console.error("[scanner] load profiles", error.message);
  }
  const existing = new Map<string, HistoryDay[]>();
  for (const row of data ?? []) {
    const stats = row.stats as { days?: HistoryDay[] } | null;
    existing.set(
      String(row.ticker).toUpperCase(),
      Array.isArray(stats?.days) ? stats.days : [],
    );
  }
  const upserts = features.map((feature) => {
    const today: HistoryDay = {
      sessionDate: feature.sessionDate,
      changeFromClosePct: feature.changeFromClosePct,
      gapPercent: feature.gapPercent,
      changeFromOpenPct: feature.changeFromOpenPct,
      halted: feature.haltStatus === "halted",
      offeringHeadline: feature.explanation.evidence.some((item) =>
        ["offering", "financing", "dilution"].includes(item.eventType ?? ""),
      ),
    };
    const priorDays = (existing.get(feature.ticker) ?? []).filter(
      (day) => day.sessionDate !== today.sessionDate,
    );
    const days = [...priorDays, today].slice(-90);
    const flags = profileFromHistory(days);
    return {
      firm_id: firmId,
      ticker: feature.ticker,
      updated_at: new Date().toISOString(),
      former_runner: flags.formerRunner,
      gap_and_fade: flags.gapAndFade,
      offering_risk: flags.offeringRisk,
      frequent_halt: flags.frequentHalt,
      halt_count_90d: flags.haltCount90d,
      extreme_move_days_90d: flags.extremeMoveDays90d,
      max_intraday_move_90d: flags.maxIntradayMove90d,
      stats: { days },
    };
  });
  const { error: upsertError } = await admin
    .from("scanner_ticker_profiles")
    .upsert(upserts, { onConflict: "firm_id,ticker" });
  if (upsertError) console.error("[scanner] persist profiles", upsertError.message);
}

export async function loadPriorAlertStates(
  firmId: string,
  sessionDate: string,
): Promise<PriorAlertState[]> {
  const admin = adminOrNull();
  if (!admin) return [];
  const { data, error } = await admin
    .from("scanner_alert_events")
    .select(
      "id, ticker, strategy_id, session_date, fired_at, last_seen_at, occurrence_count, status, payload",
    )
    .eq("firm_id", firmId)
    .eq("session_date", sessionDate)
    .in("status", ["active", "consolidated"])
    .order("last_seen_at", { ascending: false })
    .limit(2000);
  if (error || !data) return [];
  return data.map((row) => {
    const payload = row.payload as { last?: number | null } | null;
    return {
      id: row.id as string,
      ticker: row.ticker as string,
      strategyId: row.strategy_id as string,
      sessionDate: String(row.session_date),
      firedAt: row.fired_at as string,
      lastSeenAt: row.last_seen_at as string,
      last: payload?.last ?? null,
      occurrenceCount: Number(row.occurrence_count ?? 1),
      status: row.status as PriorAlertState["status"],
    };
  });
}

export async function loadTickerProfiles(
  firmId: string,
): Promise<Map<string, TickerHistoryFlags>> {
  const admin = adminOrNull();
  const map = new Map<string, TickerHistoryFlags>();
  if (!admin) return map;
  const { data, error } = await admin
    .from("scanner_ticker_profiles")
    .select(
      "ticker, former_runner, gap_and_fade, offering_risk, frequent_halt, halt_count_90d, extreme_move_days_90d, max_intraday_move_90d",
    )
    .eq("firm_id", firmId);
  if (error || !data) return map;
  for (const row of data) {
    map.set(String(row.ticker).toUpperCase(), {
      formerRunner: Boolean(row.former_runner),
      gapAndFade: Boolean(row.gap_and_fade),
      offeringRisk: Boolean(row.offering_risk),
      frequentHalt: Boolean(row.frequent_halt),
      haltCount90d: Number(row.halt_count_90d ?? 0),
      extremeMoveDays90d: Number(row.extreme_move_days_90d ?? 0),
      maxIntradayMove90d:
        row.max_intraday_move_90d == null ? null : Number(row.max_intraday_move_90d),
    });
  }
  return map;
}

export async function loadPersistedSnapshot(
  firmId: string,
): Promise<ScannerCenterSnapshot | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const { data: run } = await admin
    .from("scanner_runs")
    .select(
      "id, started_at, session, session_date, provider_name, feed_coverage, latency_class, coverage_notes, symbols_requested, symbols_received, cadence_seconds",
    )
    .eq("firm_id", firmId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;
  const sessionDate = String(run.session_date);
  const [{ data: ranked }, { data: alerts }, { data: features }] = await Promise.all([
    admin
      .from("scanner_ranked_rows")
      .select("strategy_id, row")
      .eq("firm_id", firmId)
      .eq("session_date", sessionDate),
    admin
      .from("scanner_alert_events")
      .select("payload")
      .eq("firm_id", firmId)
      .eq("session_date", sessionDate)
      .order("fired_at", { ascending: false })
      .limit(400),
    admin.from("scanner_feature_snapshots").select("ticker, features").eq("firm_id", firmId),
  ]);
  const lists: ScannerCenterSnapshot["lists"] = {};
  for (const row of ranked ?? []) {
    const strategyId = row.strategy_id as string;
    const item = row.row as ScannerCenterSnapshot["lists"][string][number];
    lists[strategyId] = [...(lists[strategyId] ?? []), item].sort((a, b) => a.rank - b.rank);
  }
  return {
    asOf: run.started_at as string,
    session: run.session as ScannerCenterSnapshot["session"],
    sessionDate,
    sessionPreset: "midday",
    system: "momentum",
    lists,
    alerts: (alerts ?? []).map((row) => row.payload as ScannerAlertEvent),
    selectedTicker: null,
    features: Object.fromEntries(
      (features ?? []).map((row) => [String(row.ticker), row.features]),
    ) as ScannerCenterSnapshot["features"],
    coverage: {
      freshness: "delayed",
      providerName: (run.provider_name as string | null) ?? null,
      feedCoverage: run.feed_coverage as ScannerCenterSnapshot["coverage"]["feedCoverage"],
      latencyClass: run.latency_class as ScannerCenterSnapshot["coverage"]["latencyClass"],
      cadenceSeconds: Number(run.cadence_seconds ?? 60),
      lastUpdate: run.started_at as string,
      nextUpdate: null,
      symbolsRequested: Number(run.symbols_requested ?? 0),
      symbolsReceived: Number(run.symbols_received ?? 0),
      universeLimited: true,
      coverageNotes: run.coverage_notes ? [String(run.coverage_notes)] : [],
      entitlements: {
        trades: false,
        quotes: true,
        float: true,
        news: true,
        halts: true,
        options: false,
        fullMarket: false,
      },
    },
    runId: run.id as string,
    mocked: false,
  };
}

export async function loadReplayFeatures(firmId: string, at: string) {
  const admin = adminOrNull();
  if (!admin) return [];
  const { data } = await admin
    .from("scanner_feature_history")
    .select("features, captured_at")
    .eq("firm_id", firmId)
    .lte("captured_at", at)
    .order("captured_at", { ascending: false })
    .limit(2000);
  const latest = new Map<string, ScannerCenterSnapshot["features"][string]>();
  for (const row of data ?? []) {
    const feature = row.features as ScannerCenterSnapshot["features"][string];
    if (!latest.has(feature.ticker)) latest.set(feature.ticker, feature);
  }
  return [...latest.values()];
}

export async function listUserPresets(userId: string, firmId: string): Promise<ScannerPreset[]> {
  if (!canCreateServerClient()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scanner_presets")
    .select("id, name, system, layout, is_default")
    .eq("user_id", userId)
    .eq("firm_id", firmId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    system: row.system as ScannerPreset["system"],
    layout: row.layout as ScannerPreset["layout"],
    isDefault: Boolean(row.is_default),
  }));
}

export async function saveUserPreset(input: {
  userId: string;
  firmId: string;
  name: string;
  system: ScannerPreset["system"];
  layout: ScannerPreset["layout"];
}): Promise<ScannerPreset | null> {
  if (!canCreateServerClient()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scanner_presets")
    .upsert(
      {
        user_id: input.userId,
        firm_id: input.firmId,
        name: input.name.trim().slice(0, 80),
        system: input.system,
        layout: input.layout,
      },
      { onConflict: "user_id,name" },
    )
    .select("id, name, system, layout, is_default")
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    system: data.system as ScannerPreset["system"],
    layout: data.layout as ScannerPreset["layout"],
    isDefault: Boolean(data.is_default),
  };
}

export async function deleteUserPreset(input: {
  id: string;
  userId: string;
  firmId: string;
}): Promise<boolean> {
  if (!canCreateServerClient()) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from("scanner_presets")
    .delete()
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .eq("firm_id", input.firmId);
  return !error;
}

export async function loadAlertSettings(
  userId: string,
  firmId: string,
): Promise<ScannerAlertSettings> {
  if (!canCreateServerClient()) return DEFAULT_ALERT_SETTINGS;
  const supabase = await createClient();
  const { data } = await supabase
    .from("scanner_alert_settings")
    .select("settings")
    .eq("user_id", userId)
    .eq("firm_id", firmId)
    .maybeSingle();
  return {
    ...DEFAULT_ALERT_SETTINGS,
    ...((data?.settings as Partial<ScannerAlertSettings> | undefined) ?? {}),
  };
}

export async function saveAlertSettings(input: {
  userId: string;
  firmId: string;
  settings: ScannerAlertSettings;
}): Promise<boolean> {
  if (!canCreateServerClient()) return false;
  const supabase = await createClient();
  const { error } = await supabase.from("scanner_alert_settings").upsert({
    user_id: input.userId,
    firm_id: input.firmId,
    settings: input.settings,
  });
  return !error;
}

export async function loadPinsAndMutes(userId: string, firmId: string) {
  if (!canCreateServerClient()) {
    return {
      pins: [] as string[],
      mutes: [] as Array<{ ticker: string; strategyId: string; mutedUntil: string | null }>,
    };
  }
  const supabase = await createClient();
  const [{ data: pins }, { data: mutes }] = await Promise.all([
    supabase.from("scanner_pins").select("ticker").eq("user_id", userId).eq("firm_id", firmId),
    supabase
      .from("scanner_mutes")
      .select("ticker, strategy_id, muted_until")
      .eq("user_id", userId)
      .eq("firm_id", firmId),
  ]);
  return {
    pins: (pins ?? []).map((row) => String(row.ticker).toUpperCase()),
    mutes: (mutes ?? []).map((row) => ({
      ticker: String(row.ticker).toUpperCase(),
      strategyId: String(row.strategy_id),
      mutedUntil: (row.muted_until as string | null) ?? null,
    })),
  };
}

export async function setPin(input: {
  userId: string;
  firmId: string;
  ticker: string;
  pinned: boolean;
}): Promise<boolean> {
  if (!canCreateServerClient()) return false;
  const supabase = await createClient();
  const ticker = input.ticker.toUpperCase();
  if (input.pinned) {
    const { error } = await supabase.from("scanner_pins").upsert({
      user_id: input.userId,
      firm_id: input.firmId,
      ticker,
    });
    return !error;
  }
  const { error } = await supabase
    .from("scanner_pins")
    .delete()
    .eq("user_id", input.userId)
    .eq("firm_id", input.firmId)
    .eq("ticker", ticker);
  return !error;
}

export async function setMute(input: {
  userId: string;
  firmId: string;
  ticker: string;
  strategyId?: string;
  muted: boolean;
  mutedUntil?: string | null;
}): Promise<boolean> {
  if (!canCreateServerClient()) return false;
  const supabase = await createClient();
  const ticker = input.ticker.toUpperCase();
  const strategyId = input.strategyId ?? "*";
  if (input.muted) {
    const { error } = await supabase.from("scanner_mutes").upsert({
      user_id: input.userId,
      firm_id: input.firmId,
      ticker,
      strategy_id: strategyId,
      muted_until: input.mutedUntil ?? null,
    });
    return !error;
  }
  const { error } = await supabase
    .from("scanner_mutes")
    .delete()
    .eq("user_id", input.userId)
    .eq("firm_id", input.firmId)
    .eq("ticker", ticker)
    .eq("strategy_id", strategyId);
  return !error;
}
