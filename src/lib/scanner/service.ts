import type { SessionUser } from "@/lib/auth/session";
import { fixturesEnabled } from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import { evaluateScan } from "./evaluate";
import {
  emptySnapshot,
  getScannerMemory,
  runScannerTick,
  scannerFirmId,
  sliceSnapshot,
} from "./engine";
import { applyLayoutFilters } from "./filters";
import { builtinPresets } from "./presets";
import { parseScannerFilters } from "./query";
import {
  loadAlertSettings,
  loadPersistedSnapshot,
  loadPinsAndMutes,
  loadReplayFeatures,
  listUserPresets,
} from "./store";
import type {
  ScannerAlertSettings,
  ScannerCenterSnapshot,
  ScannerFilters,
  ScannerPreset,
  ScannerSystem,
  ScannerUserState,
} from "./types";
import { DEFAULT_ALERT_SETTINGS, DEFAULT_SCANNER_FILTERS } from "./types";

export type ScannerPayload = {
  snapshot: ScannerCenterSnapshot;
  user: ScannerUserState;
  strategies: ReturnType<typeof builtinPresets>;
};

export async function getScannerPayload(input: {
  user: SessionUser;
  system: ScannerSystem;
  filters?: ScannerFilters;
  strategyIds?: string[];
  refresh?: boolean;
}): Promise<ScannerPayload> {
  const env = getEnv();
  const now = new Date();
  let snapshot =
    getScannerMemory() ??
    (fixturesEnabled() ? (await runScannerTick({ now })).snapshot : null);

  if (!snapshot && input.user.firmId) {
    snapshot = await loadPersistedSnapshot(input.user.firmId);
  }
  if (!snapshot || input.refresh) {
    const tick = await runScannerTick({ env, force: input.refresh, now });
    snapshot = tick.snapshot;
  }
  if (!snapshot) snapshot = emptySnapshot(now, env);

  snapshot = sliceSnapshot(snapshot, input.system);
  const filters = input.filters ?? DEFAULT_SCANNER_FILTERS;
  const userState = await loadUserState(input.user);
  const muted = new Set<string>();
  for (const mute of userState.mutes) {
    if (mute.mutedUntil && Date.parse(mute.mutedUntil) < Date.now()) continue;
    muted.add(mute.ticker);
    muted.add(`${mute.ticker}:${mute.strategyId}`);
  }
  const filtered = applyLayoutFilters(
    snapshot.lists,
    snapshot.alerts,
    filters,
    muted,
    input.strategyIds,
  );
  snapshot = { ...snapshot, lists: filtered.lists, alerts: filtered.alerts };

  return {
    snapshot,
    user: userState,
    strategies: builtinPresets(input.system),
  };
}

async function loadUserState(user: SessionUser): Promise<ScannerUserState> {
  if (!user.firmId) {
    return {
      pins: [],
      mutes: [],
      settings: DEFAULT_ALERT_SETTINGS,
      presets: [],
    };
  }
  const [pins, settings, presets] = await Promise.all([
    loadPinsAndMutes(user.id, user.firmId),
    loadAlertSettings(user.id, user.firmId),
    listUserPresets(user.id, user.firmId),
  ]);
  return {
    pins: pins.pins,
    mutes: pins.mutes,
    settings,
    presets,
  };
}

export async function replayScannerAt(input: {
  user: SessionUser;
  at: string;
  system: ScannerSystem;
}): Promise<ScannerCenterSnapshot | null> {
  const firmId = input.user.firmId ?? scannerFirmId();
  const features = await loadReplayFeatures(firmId, input.at);
  if (!features.length) return null;
  const at = new Date(input.at);
  const evaluated = evaluateScan({
    features,
    now: at,
    sessionDate: features[0]!.sessionDate,
  });
  const base = emptySnapshot(at);
  return sliceSnapshot(
    {
      ...base,
      asOf: input.at,
      session: features[0]!.session,
      sessionDate: features[0]!.sessionDate,
      lists: evaluated.lists,
      alerts: evaluated.alerts,
      features: Object.fromEntries(features.map((row) => [row.ticker, row])),
      coverage: {
        ...base.coverage,
        freshness: "delayed",
        lastUpdate: input.at,
        symbolsReceived: features.length,
        symbolsRequested: features.length,
        coverageNotes: ["Historical replay from persisted feature snapshots."],
      },
    },
    input.system,
  );
}

export { parseScannerFilters };
export type { ScannerAlertSettings, ScannerPreset };
