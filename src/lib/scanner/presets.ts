import type {
  ScannerFilters,
  ScannerLayout,
  ScannerSessionPreset,
  ScannerSystem,
} from "./types";
import { DEFAULT_SCANNER_FILTERS } from "./types";

export const DEFAULT_COLUMNS = [
  "ticker",
  "last",
  "changeClose",
  "changeOpen",
  "velocity",
  "rvol",
  "dollarVolume",
  "float",
  "hod",
  "news",
  "catalyst",
  "opportunity",
  "risk",
] as const;

export const MOMENTUM_PRESET_STRATEGIES: Record<ScannerSessionPreset, string[]> = {
  premarket: [
    "five_pillars",
    "premarket_gappers",
    "low_float_gainers",
    "top_rvol",
    "hod_momentum_small",
    "recent_ipo",
    "halts",
  ],
  open: [
    "five_pillars",
    "regular_gappers",
    "change_since_open",
    "hod_momentum_small",
    "running_up",
    "up_5_in_5",
    "halts",
  ],
  midday: [
    "five_pillars",
    "top_gainers",
    "top_rvol",
    "hod_momentum_small",
    "hod_momentum_large",
    "top_of_trend",
    "reversal",
  ],
  power_hour: [
    "five_pillars",
    "hod_momentum_small",
    "running_up",
    "top_of_trend",
    "change_since_open",
    "former_runners",
  ],
  after_hours: [
    "after_hours_movers",
    "five_pillars",
    "top_gainers",
    "halts",
    "recent_ipo",
  ],
};

export const DESK_PRESET_STRATEGIES: Record<ScannerSessionPreset, string[]> = {
  premarket: [
    "desk_gaps",
    "desk_high_conviction",
    "desk_earnings",
    "desk_news_before_price",
    "desk_watchlist_unexplained",
    "desk_thematic",
  ],
  open: [
    "desk_abnormal_price",
    "desk_high_conviction",
    "desk_earnings",
    "desk_price_before_news",
    "desk_watchlist_unexplained",
    "desk_thematic",
  ],
  midday: [
    "desk_high_conviction",
    "desk_sector_relative",
    "desk_abnormal_volume",
    "desk_filings",
    "desk_exhaustion",
    "desk_thematic",
  ],
  power_hour: [
    "desk_high_conviction",
    "desk_abnormal_price",
    "desk_exhaustion",
    "desk_watchlist_unexplained",
    "desk_thematic",
  ],
  after_hours: [
    "desk_abnormal_price",
    "desk_watchlist_unexplained",
    "desk_thematic",
    "desk_news_before_price",
    "desk_high_conviction",
    "desk_gaps",
  ],
};

export const SESSION_PRESET_LABELS: Record<ScannerSessionPreset, string> = {
  premarket: "Premarket",
  open: "Open",
  midday: "Midday",
  power_hour: "Power Hour",
  after_hours: "After Hours",
};

export function builtinLayout(
  system: ScannerSystem,
  sessionPreset: ScannerSessionPreset,
  filters: Partial<ScannerFilters> = {},
): ScannerLayout {
  const strategies =
    system === "momentum"
      ? MOMENTUM_PRESET_STRATEGIES[sessionPreset]
      : DESK_PRESET_STRATEGIES[sessionPreset];
  return {
    sessionPreset,
    strategies: [...strategies],
    columns: [...DEFAULT_COLUMNS],
    filters: { ...DEFAULT_SCANNER_FILTERS, ...filters },
    sort: { key: "rank", dir: "asc" },
  };
}

export function builtinPresets(system: ScannerSystem) {
  return (Object.keys(SESSION_PRESET_LABELS) as ScannerSessionPreset[]).map(
    (preset) => ({
      id: `builtin:${system}:${preset}`,
      name: SESSION_PRESET_LABELS[preset],
      system,
      layout: builtinLayout(system, preset),
      isDefault: preset === "open",
    }),
  );
}
