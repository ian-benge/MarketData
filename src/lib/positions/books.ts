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
  }>,
  positions: PositionRecord[],
): PositionBook[] {
  const decorated = books.map((book) => ({
    id: book.id,
    ownerId: book.ownerId,
    title: book.title,
    accountValue: book.accountValue,
    openCount: positions.filter(
      (row) => row.bookId === book.id && row.status === "open",
    ).length,
    positionCount: positions.filter((row) => row.bookId === book.id).length,
  }));
  decorated.sort((a, b) => {
    if (a.title === DEFAULT_BOOK_TITLE && b.title !== DEFAULT_BOOK_TITLE) {
      return -1;
    }
    if (b.title === DEFAULT_BOOK_TITLE && a.title !== DEFAULT_BOOK_TITLE) {
      return 1;
    }
    return a.title.localeCompare(b.title);
  });
  return decorated;
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
