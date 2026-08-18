import type { AttributionKind } from "@/lib/intelligence/types";
import type {
  CatalystKind,
  LinkedEvidence,
  ScannerFeatureSnapshot,
  ScannerMoverExplanation,
} from "./types";

export function catalystKindFromAttribution(
  kind: AttributionKind | null | undefined,
  technical: boolean,
): CatalystKind {
  if (kind === "confirmed_company") return "confirmed_company";
  if (kind === "likely_catalyst") return "likely_catalyst";
  if (kind === "sympathy") return "sector_sympathy";
  if (kind === "multiple") return "likely_catalyst";
  if (technical) return "technical";
  return "unexplained";
}

export function buildExplanation(input: {
  feature: Pick<
    ScannerFeatureSnapshot,
    | "ticker"
    | "changeFromClosePct"
    | "relativeVolume"
    | "inWatchlist"
    | "inPosition"
    | "themes"
    | "sectors"
    | "haltStatus"
    | "formerRunner"
    | "newsFreshness"
    | "unusualOptions"
  >;
  attributionKind?: AttributionKind | null;
  attributionHeadline?: string | null;
  attributionDetail?: string | null;
  evidence?: LinkedEvidence[];
  relatedTickers?: string[];
  technicalReason?: string | null;
}): ScannerMoverExplanation {
  const technical = Boolean(input.technicalReason) && !input.attributionKind;
  const catalystKind = catalystKindFromAttribution(input.attributionKind, technical);
  const move = input.feature.changeFromClosePct;
  const moveText =
    move == null
      ? `${input.feature.ticker} is flagged by the scanner`
      : `${input.feature.ticker} is ${move >= 0 ? "up" : "down"} ${Math.abs(move).toFixed(1)}%`;
  const competing: string[] = [];
  let unresolved = catalystKind === "unexplained";

  if (catalystKind === "unexplained" && input.feature.themes.length) {
    competing.push(`Sector tape in ${input.feature.themes[0]} may be driving sympathy`);
  }
  if (catalystKind === "unexplained" && input.technicalReason) {
    competing.push(input.technicalReason);
  }
  if (catalystKind === "unexplained" && input.feature.formerRunner) {
    competing.push("Former runner with a history of extreme intraday movement");
  }
  if (input.attributionKind === "multiple") {
    competing.push("Multiple overlapping headlines; more than one interpretation remains open");
    unresolved = true;
  }

  const headline =
    input.attributionHeadline?.trim() ||
    (technical && input.technicalReason
      ? `${moveText} on a technical setup — ${input.technicalReason}`
      : `${moveText} with no verified catalyst in the news window`);

  const detail =
    input.attributionDetail?.trim() ||
    (catalystKind === "unexplained"
      ? "No company-specific filing or ticker-matched headline was found in the news window. This is not a claim that no catalyst exists."
      : headline);

  const whyNow =
    input.feature.newsFreshness === "0_2h"
      ? "A qualifying headline arrived in the last two hours."
      : input.feature.relativeVolume != null && input.feature.relativeVolume >= 3
        ? "Volume is abnormally elevated versus the recent average, which is why the name is surfacing now."
        : input.feature.haltStatus === "resumed"
          ? "The name recently resumed from a halt."
          : "The scanner is reacting to the current price/volume print, not a newly confirmed headline.";

  const confirmationParts = [
    input.feature.relativeVolume != null
      ? `RVOL ${input.feature.relativeVolume.toFixed(2)}×`
      : "volume confirmation incomplete",
    input.feature.unusualOptions
      ? "unusual options activity present"
      : "no options confirmation",
  ];

  const invalidation = [
    "A halt, offering, or failed breakout would invalidate a continuation read.",
    input.feature.haltStatus === "halted" ? "Trading is currently halted." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    headline,
    detail,
    catalystKind,
    attribution: catalystKind,
    confidence:
      catalystKind === "confirmed_company"
        ? "confirmed"
        : catalystKind === "likely_catalyst"
          ? "probable"
          : catalystKind === "unexplained"
            ? "unknown"
            : "speculative",
    competing,
    unresolved,
    whyNow,
    relatedTickers: input.relatedTickers ?? [],
    confirmation: confirmationParts.join("; "),
    invalidation,
    evidence: input.evidence ?? [],
  };
}
