/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WatchlistTable } from "@/components/dashboard/WatchlistTable";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";

const snapshot: DashboardWatchlistSnapshot = {
  listId: "wl-core",
  listName: "Market Tape",
  symbols: ["SPY"],
  rows: [
    {
      ticker: "SPY",
      name: "SPDR S&P 500",
      last: 560,
      change1dPercent: 0.4,
      changeFromOpenPercent: 0.2,
      change1wPercent: 1.1,
      relativeVolume: 1.2,
      marketCap: 1,
      volume: 1,
      missing: [],
    },
  ],
  lists: [
    {
      id: "wl-core",
      name: "Market Tape",
      isDefault: true,
      symbolCount: 1,
    },
  ],
  asOf: "2026-08-14T18:00:00.000Z",
  stale: false,
  usingFixtures: true,
  error: null,
};

describe("WatchlistTable", () => {
  it("links a Why-moving badge to headline search without inventing a cause", () => {
    render(
      <WatchlistTable
        data={snapshot}
        explanations={[
          {
            ticker: "SPY",
            significant: true,
            changePercent: 3.4,
            relativeVolume: 2.1,
            session: "regular",
            flags: ["move"],
            direction: "up",
            attribution: "unknown",
            confidence: "unknown",
            evidenceNature: "fact",
            causalStatus: "unclear",
            headline: "No verified catalyst found",
            detail: "No company-specific filing was found.",
            supportingEvents: [],
            relatedTickers: [],
            themes: [],
            window: {
              start: "2026-08-15T00:00:00.000Z",
              end: "2026-08-15T18:00:00.000Z",
              label: "Session news window",
            },
            coverageGap: "No headlines were available in the move window.",
          },
        ]}
      />,
    );
    expect(screen.getByText("Unknown")).toBeTruthy();
    const why = screen.getByRole("link", { name: /Unknown/i });
    expect(why.getAttribute("href")).toContain("/news?q=");
    expect(why.getAttribute("href")).toContain("SPY");
    expect(screen.queryByText(/because/i)).toBeNull();
  });
});
