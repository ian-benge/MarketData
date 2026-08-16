/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterAndSortMaterialNews,
  HeadlineFeed,
} from "@/components/dashboard/HeadlineFeed";
import type { IntelligenceEvent } from "@/lib/intelligence/types";

function event(
  overrides: Partial<IntelligenceEvent> & Pick<IntelligenceEvent, "id" | "title">,
): IntelligenceEvent {
  const publishedAt = overrides.publishedAt ?? "2026-08-16T14:00:00.000Z";
  return {
    clusterId: overrides.id,
    summary: undefined,
    eventType: "other",
    eventTypeLabel: "Other",
    publishedAt,
    novelty: "new",
    materialityScore: 40,
    sentiment: "unscored",
    sentimentNote: null,
    confidence: "unknown",
    tickers: [],
    themes: [],
    sectors: [],
    secondOrder: [],
    sources: [
      {
        id: overrides.id,
        title: overrides.title,
        url: "https://example.com",
        publishedAt,
        sourceClass: "wire",
        providerName: "demo",
        sourceQuality: "secondary",
      },
    ],
    representative: {
      id: overrides.id,
      title: overrides.title,
      url: "https://example.com",
      publishedAt,
      sourceClass: "wire",
      providerName: "demo",
      sourceQuality: "secondary",
    },
    memberCount: 1,
    coverageNotes: null,
    marketReaction: [],
    ...overrides,
  };
}

describe("HeadlineFeed", () => {
  afterEach(() => {
    cleanup();
  });
  it("shows an empty state with a search link when no headlines exist", () => {
    render(<HeadlineFeed headlines={[]} events={[]} gaps={[]} />);
    expect(screen.getByText(/No material headlines are available/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Open headline search/i }).getAttribute("href"),
    ).toBe("/news");
  });

  it("surfaces coverage gaps instead of hiding missing sources", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        events={[]}
        gaps={[
          {
            code: "finnhub_unkeyed",
            message: "Finnhub is not keyed. Company-tagged headlines are limited.",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Finnhub is not keyed/)).toBeTruthy();
  });

  it("lists newer headlines above older ones by default", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        coverageTickers={["RSP"]}
        events={[
          event({
            id: "early",
            title: "Early-morning wrap",
            materialityScore: 69,
            publishedAt: "2026-08-16T09:15:00.000Z",
            tickers: [
              {
                ticker: "RSP",
                name: null,
                role: "primary",
                confidence: "high",
                method: "provider",
              },
            ],
          }),
          event({
            id: "later",
            title: "Later dividend note",
            materialityScore: 40,
            publishedAt: "2026-08-16T13:15:00.000Z",
          }),
        ]}
      />,
    );
    const articles = screen.getAllByRole("article");
    expect(articles[0]?.textContent).toMatch(/Later dividend note/);
    expect(articles[1]?.textContent).toMatch(/Early-morning wrap/);
  });

  it("can reverse to oldest first", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        events={[
          event({
            id: "early",
            title: "Early-morning wrap",
            publishedAt: "2026-08-16T09:15:00.000Z",
          }),
          event({
            id: "later",
            title: "Later dividend note",
            publishedAt: "2026-08-16T13:15:00.000Z",
          }),
        ]}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sort headlines" }), {
      target: { value: "oldest" },
    });
    const articles = screen.getAllByRole("article");
    expect(articles[0]?.textContent).toMatch(/Early-morning wrap/);
    expect(articles[1]?.textContent).toMatch(/Later dividend note/);
  });

  it("can rank by impact instead of recency", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        events={[
          event({
            id: "low",
            title: "Low-impact coverage note",
            materialityScore: 40,
            publishedAt: "2026-08-16T14:15:00.000Z",
          }),
          event({
            id: "high",
            title: "High-impact filing",
            materialityScore: 78,
            publishedAt: "2026-08-16T13:00:00.000Z",
          }),
        ]}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sort headlines" }), {
      target: { value: "impact" },
    });
    const articles = screen.getAllByRole("article");
    expect(articles[0]?.textContent).toMatch(/High-impact filing/);
    expect(articles[1]?.textContent).toMatch(/Low-impact coverage note/);
  });

  it("filters to high-impact headlines when requested", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        events={[
          event({ id: "high", title: "High-impact filing", materialityScore: 78 }),
          event({ id: "low", title: "Low-impact wrap", materialityScore: 40 }),
        ]}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by impact" }), {
      target: { value: "high" },
    });
    expect(screen.getByText("High-impact filing")).toBeTruthy();
    expect(screen.queryByText("Low-impact wrap")).toBeNull();
  });
});

describe("filterAndSortMaterialNews", () => {
  it("keeps last-hour items and drops older ones", () => {
    const now = new Date("2026-08-16T15:00:00.000Z");
    const rows = filterAndSortMaterialNews(
      [
        event({
          id: "fresh",
          title: "Fresh",
          publishedAt: "2026-08-16T14:20:00.000Z",
          materialityScore: 50,
        }),
        event({
          id: "old",
          title: "Old",
          publishedAt: "2026-08-16T10:00:00.000Z",
          materialityScore: 90,
        }),
      ],
      new Set(),
      "last hour",
      "all",
      "newest",
      now,
    );
    expect(rows.map((row) => row.id)).toEqual(["fresh"]);
  });

  it("orders by published time, newest or oldest, independent of impact", () => {
    const rows = [
      event({
        id: "early",
        title: "Early",
        publishedAt: "2026-08-16T09:15:00.000Z",
        materialityScore: 90,
      }),
      event({
        id: "later",
        title: "Later",
        publishedAt: "2026-08-16T13:15:00.000Z",
        materialityScore: 40,
      }),
    ];
    expect(
      filterAndSortMaterialNews(rows, new Set(), "", "all", "newest").map((row) => row.id),
    ).toEqual(["later", "early"]);
    expect(
      filterAndSortMaterialNews(rows, new Set(), "", "all", "oldest").map((row) => row.id),
    ).toEqual(["early", "later"]);
    expect(
      filterAndSortMaterialNews(rows, new Set(), "", "all", "impact").map((row) => row.id),
    ).toEqual(["early", "later"]);
  });
});
