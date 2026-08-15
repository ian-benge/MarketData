/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaterialMoversPanel } from "@/components/dashboard/MaterialMoversPanel";
import type { JoinedMover } from "@/lib/market-data/overview-movers";

const movers: JoinedMover[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    last: 131.4,
    changePercent: 1.94,
    volume: 210_000_000,
    relativeVolume: null,
    direction: "up",
    causalStatus: "reported",
    attribution: "likely_catalyst",
    confidence: "probable",
    evidenceNature: "inference",
    headlineTitle: "Chipmakers advance as AI spending outlook firms",
    headlineId: "news-1",
    coverageNotes: "DEMO movers — synthetic fixtures; not live IEX/SIP tape.",
  },
];

describe("MaterialMoversPanel", () => {
  it("renders snapshot movers with catalyst join", () => {
    render(
      <MaterialMoversPanel
        movers={movers}
        coverageNotes="DEMO movers — synthetic fixtures; not live IEX/SIP tape."
      />,
    );
    expect(screen.getByTestId("material-movers")).toBeTruthy();
    expect(screen.getByText("NVDA")).toBeTruthy();
    expect(screen.getByText(/Chipmakers advance/)).toBeTruthy();
    expect(screen.getByText(/DEMO movers/)).toBeTruthy();
  });
});
