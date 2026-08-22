import { describe, expect, it } from "vitest";
import { buildOverviewTickerGroups, sortGainerToLoser } from "@/lib/dashboard/overview-ticker";

describe("sortGainerToLoser", () => {
  it("ranks quoted names from largest gainer to largest loser and parks missing prints last", () => {
    expect(
      sortGainerToLoser([
        { label: "A", changePercent: -0.4 },
        { label: "B", changePercent: 1.2 },
        { label: "C", changePercent: null },
        { label: "D", changePercent: 0.3 },
        { label: "E", changePercent: -1.8 },
      ]).map((row) => row.label),
    ).toEqual(["B", "D", "A", "E", "C"]);
  });
});

describe("buildOverviewTickerGroups", () => {
  it("keeps watchlists, themes, and tape as separate groups sorted gainer to loser", () => {
    const groups = buildOverviewTickerGroups({
      watchlistRows: [
        { ticker: "AAPL", name: "Apple", last: 220, change1dPercent: -0.5 },
        { ticker: "NVDA", name: "NVIDIA", last: 131, change1dPercent: 2.1 },
        { ticker: "BLANK", name: null, last: null, change1dPercent: null },
      ],
      deskSectors: [
        {
          id: "sec-power",
          name: "Power",
          kind: "theme",
          quotedCount: 4,
          avg1dPercent: 0.8,
          displayTicker: "VST",
          benchmarkSymbol: "XLU",
          leaders: ["VST"],
        },
        {
          id: "sec-optics",
          name: "Photonics",
          kind: "theme",
          quotedCount: 3,
          avg1dPercent: 2.4,
          displayTicker: "AAOI",
          benchmarkSymbol: "SMH",
          leaders: ["AAOI"],
        },
        {
          id: "sec-semis",
          name: "Semis",
          kind: "sector",
          quotedCount: 8,
          avg1dPercent: 3.1,
          displayTicker: "SMH",
          benchmarkSymbol: "SMH",
          leaders: ["NVDA"],
        },
        {
          id: "sec-empty",
          name: "Empty theme",
          kind: "theme",
          quotedCount: 0,
          avg1dPercent: null,
          displayTicker: null,
          benchmarkSymbol: null,
          leaders: [],
        },
      ],
      tape: [
        { ticker: "TLT", last: 93.4, changePercent: -0.74, title: "TLT · Rates" },
        { ticker: "IWM", last: 221.3, changePercent: 0.68, title: "IWM · Small cap" },
        { ticker: "SPY", last: 562.4, changePercent: 0.41, title: "SPY · Broad risk" },
      ],
    });

    expect(groups.map((group) => group.id)).toEqual(["watchlists", "themes", "tape"]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["NVDA", "AAPL"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Photonics", "Power"]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(["IWM", "SPY", "TLT"]);
  });

  it("omits a group when that book has no quoted names", () => {
    expect(
      buildOverviewTickerGroups({
        watchlistRows: [],
        deskSectors: [],
        tape: [{ ticker: "SPY", last: 500, changePercent: 0.2 }],
      }).map((group) => group.id),
    ).toEqual(["tape"]);
  });
});
