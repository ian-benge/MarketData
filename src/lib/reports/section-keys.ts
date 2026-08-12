/**
 * Required report section keys (stable IDs for DB + PDF).
 */
import {
  EDITION_CONTENT_NOTES,
  type ReportEdition,
} from "@/lib/reports/editions";

export const REQUIRED_SECTION_KEYS = [
  "executive_summary",
  "market_snapshot",
  "what_is_moving",
  "material_movers",
  "watchlist",
  "macro_rates",
  "news_catalysts",
  "sources",
  "methodology",
] as const;

export type RequiredSectionKey = (typeof REQUIRED_SECTION_KEYS)[number];

export const EDITION_SECTION_KEYS = {
  midday: ["changes_since_previous"] as const,
  close_postmarket: [
    "regular_session_recap",
    "changes_since_previous",
    "after_hours_developments",
    "trade_book_status",
    "next_session_setup",
  ] as const,
  premarket: [] as const,
} as const;

export const EXTRA_SECTION_KEYS = [
  "pm_playbook",
  "ai_infrastructure",
  "scenarios_and_variants",
  "options_desk",
  "earnings_calendar",
] as const;

export const SECTION_TITLES: Record<string, string> = {
  executive_summary: "Executive Summary",
  market_snapshot: "Cross-Asset Tape",
  what_is_moving: "Transmission & Causality",
  material_movers: "Material Movers",
  watchlist: "Watchlist Highlights",
  macro_rates: "Macro, Rates, Credit & Vol",
  news_catalysts: "News & Catalysts",
  sources: "Sources & Citations",
  methodology: "Methodology & Disclaimers",
  changes_since_previous: "What Changed Since the Last Report",
  regular_session_recap: "Regular-Session Recap",
  after_hours_developments: "First-Hour After-Hours Developments",
  trade_book_status: "Final Trade-Book Status",
  next_session_setup: "Overnight and Next-Session Setup",
  pm_playbook: "PM Playbook",
  ai_infrastructure: "AI Infrastructure Map",
  scenarios_and_variants: "Scenarios & Variant Perception",
  options_desk: "Options Desk",
  earnings_calendar: "Earnings, Estimates & Guidance",
};

export { EDITION_CONTENT_NOTES };

export function requiredSectionKeysFor(
  edition: ReportEdition,
): readonly string[] {
  return [
    ...REQUIRED_SECTION_KEYS,
    ...EDITION_SECTION_KEYS[edition],
    ...EXTRA_SECTION_KEYS,
  ];
}
