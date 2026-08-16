/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SectorHeatmap,
  deskSectorForHeatmapTicker,
  partitionDeskHeatmap,
  sortDeskSectorsByGain,
} from "@/components/dashboard/SectorHeatmap";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";

type FirmSector = DashboardCoverageDigest["deskSectors"][number];

afterEach(() => {
  cleanup();
});

function sector(
  overrides: Partial<FirmSector> & Pick<FirmSector, "id" | "name" | "kind">,
): FirmSector {
  return {
    navGroup: "tactical",
    vsSpy1dPercent: null,
    avg1dPercent: null,
    breadth: null,
    unusualCount: 0,
    leaders: [],
    benchmarkSymbol: null,
    displayTicker: null,
    symbolCount: 1,
    quotedCount: 0,
    ...overrides,
  };
}

describe("shared heatmap ranking", () => {
  it("splits official sectors from themes and sorts by 1D vs SPY", () => {
    const rows = [
      sector({
        id: "sec-soft",
        name: "Software",
        kind: "sector",
        vsSpy1dPercent: 1.2,
        displayTicker: "XLK",
      }),
      sector({
        id: "thm-q",
        name: "Quantum",
        kind: "theme",
        vsSpy1dPercent: 6.1,
        displayTicker: "LAES",
      }),
      sector({
        id: "sec-energy",
        name: "Energy",
        kind: "sector",
        vsSpy1dPercent: 4.4,
        displayTicker: "XLE",
      }),
      sector({
        id: "thm-blank",
        name: "Blank theme",
        kind: "theme",
        displayTicker: "URA",
      }),
    ];
    const split = partitionDeskHeatmap(rows);
    expect(sortDeskSectorsByGain(split.sectors).map((row) => row.name)).toEqual([
      "Energy",
      "Software",
    ]);
    expect(sortDeskSectorsByGain(split.themes).map((row) => row.name)).toEqual([
      "Quantum",
      "Blank theme",
    ]);
  });

  it("renders sectors then themes, highest gain first", () => {
    render(
      <SectorHeatmap
        cells={[]}
        deskSectors={[
          sector({
            id: "sec-energy",
            name: "Energy",
            kind: "sector",
            vsSpy1dPercent: 1.1,
            displayTicker: "XLE",
          }),
          sector({
            id: "thm-q",
            name: "Quantum Computing",
            kind: "theme",
            vsSpy1dPercent: 6.1,
            displayTicker: "LAES",
          }),
          sector({
            id: "sec-tech",
            name: "Semiconductors",
            kind: "sector",
            vsSpy1dPercent: 4.2,
            displayTicker: "SMH",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Shared sectors" }));
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Themes" })).toBeTruthy();
    const sectorTiles = screen.getByRole("list", { name: "Sectors heatmap" });
    expect(sectorTiles.textContent).toMatch(/Semiconductors.*Energy|SMH.*XLE/);
    expect(sectorTiles.textContent?.indexOf("SMH")).toBeLessThan(
      sectorTiles.textContent?.indexOf("XLE") ?? 0,
    );
  });

  it("prefers an official sector when several baskets share a benchmark", () => {
    const rows = [
      sector({
        id: "thm-optics",
        name: "Photonics",
        kind: "theme",
        benchmarkSymbol: "SMH",
        displayTicker: "SMH",
        symbolCount: 8,
      }),
      sector({
        id: "sec-chips",
        name: "Semiconductors",
        kind: "industry",
        benchmarkSymbol: "SMH",
        displayTicker: "SMH",
        symbolCount: 4,
      }),
    ];
    expect(deskSectorForHeatmapTicker(rows, "smh")?.id).toBe("sec-chips");
  });

  it("loads the shared basket into the watchlist when a sector tile is clicked", () => {
    const onSelectSector = vi.fn();
    const onSelectSymbol = vi.fn();
    render(
      <SectorHeatmap
        cells={[]}
        selectedSectorId="sec-tech"
        onSelectSector={onSelectSector}
        onSelectSymbol={onSelectSymbol}
        deskSectors={[
          sector({
            id: "sec-tech",
            name: "Semiconductors",
            kind: "industry",
            vsSpy1dPercent: 4.2,
            displayTicker: "SMH",
            benchmarkSymbol: "SMH",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Shared sectors" }));
    const tile = screen.getByRole("button", {
      name: "Show Semiconductors in watchlist",
    });
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tile);
    expect(onSelectSector).toHaveBeenCalledWith("sec-tech");
    expect(onSelectSymbol).toHaveBeenCalledWith("SMH");
  });

  it("maps a market ETF tile onto the matching shared sector", () => {
    const onSelectSector = vi.fn();
    const onSelectSymbol = vi.fn();
    render(
      <SectorHeatmap
        cells={[
          {
            key: "SMH",
            label: "VanEck Semiconductor ETF",
            changePercent: 1.4,
            available: true,
          },
        ]}
        onSelectSector={onSelectSector}
        onSelectSymbol={onSelectSymbol}
        deskSectors={[
          sector({
            id: "sec-chips",
            name: "Semiconductors",
            kind: "industry",
            displayTicker: "SMH",
            benchmarkSymbol: "SMH",
          }),
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show Semiconductors in watchlist" }),
    );
    expect(onSelectSector).toHaveBeenCalledWith("sec-chips");
    expect(onSelectSymbol).toHaveBeenCalledWith("SMH");
    expect(screen.getByRole("button", { name: "Shared sectors" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
