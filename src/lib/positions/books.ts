import type { PositionBook, PositionRecord } from "./types";

export const DEFAULT_BOOK_TITLE = "Main";

export class PositionBookError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PositionBookError";
    this.status = status;
  }
}

export function normalizeBookTitle(title: string): string {
  const next = title.trim().replace(/\s+/g, " ");
  if (next.length < 1 || next.length > 80) {
    throw new PositionBookError(
      "Book title must be between 1 and 80 characters.",
      400,
    );
  }
  return next;
}

export function positionsForBook(
  positions: PositionRecord[],
  bookId: string,
): PositionRecord[] {
  if (!bookId) {
    return positions.filter((position) => !position.bookId);
  }
  return positions.filter((position) => position.bookId === bookId);
}

export function booksForOwner<T extends { ownerId: string }>(
  books: T[],
  ownerId: string,
): T[] {
  return books.filter((book) => book.ownerId === ownerId);
}

export function decorateBooks(
  books: Array<{
    id: string;
    ownerId: string;
    title: string;
    accountValue: number | null;
    openCount?: number;
    positionCount?: number;
    source?: "manual" | "snaptrade";
    brokerageName?: string | null;
    fees?: number;
    sortOrder?: number;
  }>,
  positions: PositionRecord[],
): PositionBook[] {
  return books.map((book, index) => ({
    id: book.id,
    ownerId: book.ownerId,
    title: book.title,
    accountValue: book.accountValue,
    source: book.source ?? "manual",
    brokerageName: book.brokerageName ?? null,
    fees: book.fees ?? 0,
    sortOrder: book.sortOrder ?? index,
    openCount: positions.filter(
      (row) => row.bookId === book.id && row.status === "open",
    ).length,
    positionCount: positions.filter((row) => row.bookId === book.id).length,
  }));
}

export function moveBookInList<T extends { id: string }>(
  books: T[],
  fromId: string,
  toId: string,
): T[] {
  const fromIndex = books.findIndex((book) => book.id === fromId);
  const toIndex = books.findIndex((book) => book.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return books;
  const next = [...books];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return books;
  next.splice(toIndex, 0, moved);
  return next;
}

export function resolveBookId(
  requested: string | null | undefined,
  books: PositionBook[],
): string {
  if (requested && books.some((book) => book.id === requested)) {
    return requested;
  }
  const main = books.find((book) => book.title === DEFAULT_BOOK_TITLE);
  return main?.id ?? books[0]?.id ?? "";
}

export function overlayBookPositions(
  allPositions: PositionRecord[],
  bookId: string | undefined,
  overlay: PositionRecord[] | undefined,
): PositionRecord[] {
  if (!overlay || !bookId) return allPositions;
  return [
    ...allPositions.filter((row) => row.bookId !== bookId),
    ...overlay,
  ];
}
