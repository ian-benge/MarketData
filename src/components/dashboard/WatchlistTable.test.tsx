/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      visibility: "shared",
    },
    {
      id: "wl-desk",
      name: "My desk",
      isDefault: false,
      symbolCount: 1,
      visibility: "personal",
    },
  ],
  asOf: "2026-08-14T18:00:00.000Z",
  stale: false,
  usingFixtures: true,
  error: null,
};

afterEach(() => {
  cleanup();
});

describe("WatchlistTable", () => {
  it("links Manage lists to the selected watchlist on Watchlists", () => {
    render(<WatchlistTable data={snapshot} />);
    const link = screen.getByRole("link", { name: "Manage lists" });
    expect(link.getAttribute("href")).toBe("/watchlists?listId=wl-core");
    expect(screen.getByRole("combobox", { name: "Watchlist or sector" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Market Tape" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "My desk · personal" })).toBeTruthy();
  });

  it("lists shared sectors and themes in the picker", () => {
    render(
      <WatchlistTable
        data={snapshot}
        deskSectors={[
          {
            id: "sec-chips",
            name: "Semiconductors",
            kind: "theme",
            navGroup: "ai_compute",
            vsSpy1dPercent: 2.1,
            avg1dPercent: 1.4,
            breadth: 0.8,
            unusualCount: 1,
            leaders: ["NVDA"],
            benchmarkSymbol: "SMH",
            displayTicker: "SMH",
            symbolCount: 4,
            quotedCount: 4,
          },
        ]}
      />,
    );
    expect(screen.getByRole("option", { name: "Semiconductors" })).toBeTruthy();
  });

  it("keeps the picker on the chosen collection and reports the change", () => {
    const onSelectCollection = vi.fn();
    render(
      <WatchlistTable
        data={snapshot}
        selectedCollection={{ type: "sector", id: "sec-chips" }}
        onSelectCollection={onSelectCollection}
        deskSectors={[
          {
            id: "sec-chips",
            name: "Semiconductors",
            kind: "theme",
            navGroup: "ai_compute",
            vsSpy1dPercent: 2.1,
            avg1dPercent: 1.4,
            breadth: 0.8,
            unusualCount: 1,
            leaders: ["NVDA"],
            benchmarkSymbol: "SMH",
            displayTicker: "SMH",
            symbolCount: 4,
            quotedCount: 4,
          },
        ]}
      />,
    );
    const picker = screen.getByRole("combobox", { name: "Watchlist or sector" });
    expect((picker as HTMLSelectElement).value).toBe("sector:sec-chips");
    fireEvent.change(picker, { target: { value: "watchlist:wl-desk" } });
    expect(onSelectCollection).toHaveBeenCalledWith({
      type: "watchlist",
      id: "wl-desk",
    });
  });

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
  });
});
