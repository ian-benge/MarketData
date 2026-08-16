/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialMoversPanel } from "@/components/dashboard/MaterialMoversPanel";
import type { JoinedMover } from "@/lib/market-data/overview-movers";

const movers: JoinedMover[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    last: 131.4,
    changePercent: 1.94,
    volume: 210_000_000,
    relativeVolume: 2.4,
    direction: "up",
    causalStatus: "reported",
    attribution: "confirmed_company",
    confidence: "confirmed",
    evidenceNature: "fact",
    headlineTitle: "NVIDIA 8-K on data-center outlook",
    headlineId: "news-5",
    coverageNotes: "Tracked-universe movers only.",
  },
  {
    ticker: "AMD",
    name: "AMD",
    last: 162.7,
    changePercent: 2.84,
    volume: 55_000_000,
    relativeVolume: 1.8,
    direction: "up",
    causalStatus: "unclear",
    attribution: "unknown",
    confidence: "unknown",
    evidenceNature: "fact",
    headlineTitle: null,
    headlineId: null,
    coverageNotes: "Tracked-universe movers only.",
  },
];

afterEach(() => {
  cleanup();
});

describe("MaterialMoversPanel", () => {
  it("renders sortable movers and selects a ticker", () => {
    const onSelect = vi.fn();
    render(
      <MaterialMoversPanel
        movers={movers}
        selectedSymbol="SPY"
        onSelectSymbol={onSelect}
      />,
    );
    expect(screen.getByRole("region", { name: "Material movers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select NVDA" })).toBeTruthy();
    expect(screen.getByText(/NVIDIA 8-K/)).toBeTruthy();
    expect(screen.getByText("No matching headline")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select NVDA" }));
    expect(onSelect).toHaveBeenCalledWith("NVDA");
  });
});
