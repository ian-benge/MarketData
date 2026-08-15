/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/components/news/EventCard";
import type { IntelligenceEvent } from "@/lib/intelligence/types";

const event: IntelligenceEvent = {
  id: "evt-1",
  clusterId: "evt-1",
  title: "NVIDIA raises AI data center outlook",
  summary: "Company 8-K and follow-on wires.",
  eventType: "guidance",
  eventTypeLabel: "Guidance",
  publishedAt: "2026-08-15T14:00:00.000Z",
  novelty: "new",
  materialityScore: 82,
  sentiment: "positive",
  sentimentNote: "Keyword tone only.",
  confidence: "probable",
  tickers: [
    {
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      role: "primary",
      confidence: "high",
      method: "provider",
    },
  ],
  themes: ["semiconductors"],
  sectors: [],
  secondOrder: [
    {
      ticker: "AVGO",
      name: "Broadcom",
      role: "second_order",
      confidence: "low",
      method: "theme_peer",
    },
  ],
  sources: [
    {
      id: "src-1",
      title: "NVIDIA raises AI data center outlook",
      url: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
      publishedAt: "2026-08-15T14:00:00.000Z",
      sourceClass: "primary",
      providerName: "edgar",
      sourceQuality: "primary",
    },
    {
      id: "src-2",
      title: "NVIDIA outlook raised, chip peers bid",
      url: "https://example.com/wire",
      publishedAt: "2026-08-15T14:10:00.000Z",
      sourceClass: "wire",
      providerName: "finnhub",
      sourceQuality: "secondary",
    },
  ],
  representative: {
    id: "src-1",
    title: "NVIDIA raises AI data center outlook",
    url: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
    publishedAt: "2026-08-15T14:00:00.000Z",
    sourceClass: "primary",
    providerName: "edgar",
    sourceQuality: "primary",
  },
  memberCount: 2,
  coverageNotes: "Verify primary sources.",
  marketReaction: [{ ticker: "NVDA", changePercent: 3.4, relativeVolume: 2.1 }],
};

describe("EventCard", () => {
  it("links the original source and expands related headlines", () => {
    render(
      <EventCard event={event} coverageTickers={new Set(["NVDA"])} />,
    );
    const headline = screen.getByRole("link", {
      name: /NVIDIA raises AI data center outlook/i,
    });
    expect(headline.getAttribute("href")).toBe(
      "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
    );
    expect(screen.getByText("2 sources")).toBeTruthy();
    expect(screen.getByText("On coverage")).toBeTruthy();
    expect(screen.getByText("M82")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show related headlines" }));
    expect(screen.getByText(/NVIDIA outlook raised/)).toBeTruthy();
    expect(screen.getByText(/2nd AVGO/)).toBeTruthy();
  });
});
