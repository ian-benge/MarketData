import { describe, expect, it } from "vitest";
import {
  fixtureAccountValue,
  fixturePositions,
  FIXTURE_BOOK_MEMBER_IRA,
  FIXTURE_BOOK_MEMBER_MAIN,
} from "@/lib/fixtures/positions";
import {
  DEFAULT_BOOK_TITLE,
  decorateBooks,
  normalizeBookTitle,
  overlayBookPositions,
  positionsForBook,
  resolveBookId,
  moveBookInList,
} from "./books";
import type { PositionRecord } from "./types";

function position(
  bookId: string | null,
  status: "open" | "closed" = "open",
): PositionRecord {
  return {
    id: `pos-${bookId ?? "none"}-${status}`,
    firmId: "firm-1",
    ticker: "NVDA",
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate: "2026-07-01",
    currency: "USD",
    strategy: null,
    notes: null,
    status,
    closePrice: status === "closed" ? 110 : null,
    closeDate: status === "closed" ? "2026-08-01" : null,
    closedAt: status === "closed" ? "2026-08-01T20:00:00.000Z" : null,
    createdBy: "demo-member",
    bookId,
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
  };
}

describe("named position books", () => {
  it("filters lots to a single book and leaves untitled lots for an empty id", () => {
    const rows = [
      position("book-main"),
      position("book-ira"),
      position("book-ira", "closed"),
      position(null),
    ];
    expect(positionsForBook(rows, "book-ira").map((row) => row.id)).toEqual([
      "pos-book-ira-open",
      "pos-book-ira-closed",
    ]);
    expect(positionsForBook(rows, "").map((row) => row.bookId)).toEqual([null]);
  });

  it("preserves incoming book order and counts open lots per book", () => {
    const books = decorateBooks(
      [
        {
          id: "book-ira",
          ownerId: "demo-member",
          title: "IRA",
          accountValue: 60_000,
        },
        {
          id: "book-main",
          ownerId: "demo-member",
          title: DEFAULT_BOOK_TITLE,
          accountValue: 175_000,
        },
      ],
      [position("book-main"), position("book-main"), position("book-ira")],
    );
    expect(books.map((book) => book.title)).toEqual(["IRA", "Main"]);
    expect(books[0]?.openCount).toBe(1);
    expect(books[1]?.openCount).toBe(2);
    expect(books[0]?.positionCount).toBe(1);
  });

  it("moves a book to another tab's slot", () => {
    const books = [
      { id: "main" },
      { id: "roth" },
      { id: "schwab" },
    ];
    expect(moveBookInList(books, "schwab", "main").map((book) => book.id)).toEqual([
      "schwab",
      "main",
      "roth",
    ]);
    expect(moveBookInList(books, "main", "schwab").map((book) => book.id)).toEqual([
      "roth",
      "schwab",
      "main",
    ]);
    expect(moveBookInList(books, "missing", "main")).toEqual(books);
  });

  it("resolves the requested book, then Main, then the first book", () => {
    const books = decorateBooks(
      [
        {
          id: "book-ira",
          ownerId: "demo-member",
          title: "IRA",
          accountValue: null,
        },
        {
          id: "book-main",
          ownerId: "demo-member",
          title: DEFAULT_BOOK_TITLE,
          accountValue: null,
        },
      ],
      [],
    );
    expect(resolveBookId("book-ira", books)).toBe("book-ira");
    expect(resolveBookId("missing", books)).toBe("book-main");
    expect(resolveBookId(undefined, [])).toBe("");
  });

  it("normalizes titles and overlays session lots onto one book", () => {
    expect(normalizeBookTitle("  IRA   sleeve  ")).toBe("IRA sleeve");
    const base = [position("book-main"), position("book-ira")];
    const overlay = [position("book-ira"), position("book-ira")];
    overlay[0]!.id = "pos-ira-a";
    overlay[1]!.id = "pos-ira-b";
    const merged = overlayBookPositions(base, "book-ira", overlay);
    expect(merged.filter((row) => row.bookId === "book-ira")).toHaveLength(2);
    expect(merged.some((row) => row.bookId === "book-main")).toBe(true);
  });

  it("keeps demo member Main and IRA as separate books with their own NAV", () => {
    const memberLots = fixturePositions.filter(
      (row) => row.createdBy === "demo-member",
    );
    const main = positionsForBook(memberLots, FIXTURE_BOOK_MEMBER_MAIN);
    const ira = positionsForBook(memberLots, FIXTURE_BOOK_MEMBER_IRA);
    expect(main.map((row) => row.ticker)).toEqual(
      expect.arrayContaining(["AAPL", "SPY"]),
    );
    expect(ira.map((row) => row.ticker)).toEqual(
      expect.arrayContaining(["GLD", "IWM"]),
    );
    expect(main.some((row) => row.ticker === "GLD")).toBe(false);
    expect(fixtureAccountValue(FIXTURE_BOOK_MEMBER_MAIN)).toBe(175_000);
    expect(fixtureAccountValue(FIXTURE_BOOK_MEMBER_IRA)).toBe(60_000);
  });
});
