import { flagsFor } from "@/lib/watchlists/analytics";
import type { QuoteContext } from "./types";

export { newsWindowForSession } from "./windows";

export type DetectedMove = QuoteContext & {
  significant: boolean;
  direction: "up" | "down" | "flat";
  reasons: string[];
};

export function detectSignificantMove(quote: QuoteContext): DetectedMove {
  if (quote.session === "closed") {
    return {
      ...quote,
      flags: [],
      significant: false,
      direction:
        quote.changePercent == null || quote.changePercent === 0
          ? "flat"
          : quote.changePercent > 0
            ? "up"
            : "down",
      reasons: [],
    };
  }
  const flags = quote.flags.length
    ? quote.flags
    : flagsFor({
        change1dPercent: quote.changePercent,
        relativeVolume: quote.relativeVolume,
        vsGroup1dPercent: quote.vsGroupPercent ?? null,
        preMarketChangePercent: quote.preMarketChangePercent ?? null,
        afterHoursChangePercent: quote.afterHoursChangePercent ?? null,
      });
  const change = quote.changePercent;
  const direction: DetectedMove["direction"] =
    change == null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const reasons: string[] = [];
  if (flags.includes("move")) reasons.push("session move ≥ 3%");
  if (flags.includes("rvol")) reasons.push("relative volume ≥ 1.8×");
  if (flags.includes("extended")) reasons.push("premarket or after-hours move ≥ 1.5%");
  if (flags.includes("peer")) reasons.push("vs group ≥ 2.5%");
  if (change != null && Math.abs(change) >= 5) reasons.push("absolute move ≥ 5%");
  if ((quote.relativeVolume ?? 0) >= 3) reasons.push("relative volume ≥ 3×");

  return {
    ...quote,
    flags,
    significant: reasons.length > 0,
    direction,
    reasons,
  };
}
