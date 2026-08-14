/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewStatusChrome } from "@/components/dashboard/OverviewStatusChrome";
import type { AttentionItem } from "@/lib/market-data/overview-attention";

const items: AttentionItem[] = [
  {
    id: "driver-tlt",
    kind: "driver",
    kicker: "Pulse driver",
    print: "TLT −0.62%",
    ticker: "TLT",
  },
];

const strip = {
  session: "afterhours",
  asOf: "2026-08-14T21:40:02.000Z",
  coverageLabel: "REAL-TIME - IEX",
  latencyClass: "realtime",
  providerCount: 12,
  unhealthyCount: 0,
  licenseWarning: null as string | null,
};

describe("OverviewStatusChrome", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the mobile session chrome collapsed until expanded", () => {
    const { container } = render(
      <OverviewStatusChrome {...strip} items={items} />,
    );

    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(screen.getAllByText(/afterhours session/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("TLT −0.62%").length).toBeGreaterThan(0);

    fireEvent.click(container.querySelector("summary")!);
    expect(details?.open).toBe(true);
    expect(
      screen.getAllByLabelText("Market session and data trust").length,
    ).toBeGreaterThan(0);
  });

  it("always renders the full trust strip for large screens", () => {
    render(<OverviewStatusChrome {...strip} items={items} />);

    expect(
      screen.getAllByLabelText("Market session and data trust"),
    ).toHaveLength(2);
    expect(screen.getAllByLabelText("Attention")).toHaveLength(2);
  });
});
