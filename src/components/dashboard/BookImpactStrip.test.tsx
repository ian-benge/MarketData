/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookImpactStrip } from "@/components/dashboard/BookImpactStrip";
import { emptyBookImpact, type DashboardBookImpact } from "@/lib/dashboard/book-impact";

afterEach(() => {
  cleanup();
});

const book: DashboardBookImpact = {
  asOf: "2026-08-16T14:30:00.000Z",
  openCount: 2,
  quotedCount: 2,
  ownerLocked: false,
  persistence: "supabase",
  dayPnl: 40,
  dayPercent: 1.2,
  largestWeight: 0.4,
  openTickers: ["NVDA", "AMD"],
  contributors: [
    {
      ticker: "NVDA",
      side: "long",
      dayPnl: 50,
      dayPercent: 4.76,
      unexplained: false,
    },
    {
      ticker: "AMD",
      side: "long",
      dayPnl: -12,
      dayPercent: -1.1,
      unexplained: true,
    },
  ],
  unexplainedTickers: ["AMD"],
  error: null,
  stale: false,
  usingFixtures: false,
};

describe("BookImpactStrip", () => {
  it("renders session P&L and selects a contributor", () => {
    const onSelect = vi.fn();
    render(<BookImpactStrip book={book} onSelectSymbol={onSelect} />);
    expect(screen.getByText("Book impact")).toBeTruthy();
    expect(screen.getByText(/1 unexplained/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select NVDA" }));
    expect(onSelect).toHaveBeenCalledWith("NVDA");
  });

  it("stays visible when the blotter is empty", () => {
    render(<BookImpactStrip book={emptyBookImpact(null, { persistence: "supabase" })} />);
    expect(screen.getByText("Book impact")).toBeTruthy();
    expect(screen.getByText("No open lots in the active book.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Positions" })).toBeTruthy();
  });

  it("surfaces unexplained names outside the contributor cap", () => {
    render(
      <BookImpactStrip
        book={{
          ...book,
          unexplainedTickers: ["AMD", "SMCI"],
        }}
      />,
    );
    expect(screen.getByText("SMCI")).toBeTruthy();
    expect(screen.getByText(/2 unexplained/)).toBeTruthy();
  });

  it("redacts P&L when the owner book is locked", () => {
    render(
      <BookImpactStrip
        book={{
          ...book,
          ownerLocked: true,
          dayPnl: null,
          dayPercent: null,
          contributors: book.contributors.map((row) => ({
            ...row,
            dayPnl: null,
            dayPercent: null,
          })),
        }}
      />,
    );
    expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
    expect(screen.queryByText("$40")).toBeNull();
  });
});
