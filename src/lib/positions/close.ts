import type { CloseLotInput, PositionRecord } from "./types";

const QTY_EPS = 1e-8;

export class PositionCloseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PositionCloseError";
    this.status = status;
  }
}

export type CloseLotResult = {
  mode: "full" | "partial";
  remaining: PositionRecord | null;
  closed: PositionRecord;
  book: PositionRecord[];
};

export function roundQuantity(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function quantitiesEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= QTY_EPS;
}

function stampClosed(
  row: PositionRecord,
  input: {
    closePrice: number;
    closeDate: string;
    closedAt: string;
    notes?: string | null;
  },
): PositionRecord {
  return {
    ...row,
    status: "closed",
    closePrice: input.closePrice,
    closeDate: input.closeDate,
    closedAt: input.closedAt,
    notes: input.notes === undefined ? row.notes : input.notes,
    updatedAt: input.closedAt,
  };
}

export function applyCloseToBook(
  book: PositionRecord[],
  id: string,
  input: CloseLotInput & {
    closedAt?: string;
    closedLotId?: string;
    notes?: string | null;
  },
): CloseLotResult {
  const current = book.find((row) => row.id === id);
  if (!current) {
    throw new PositionCloseError("Position not found.", 404);
  }
  if (current.status !== "open") {
    throw new PositionCloseError("Position is already closed.", 409);
  }

  const closeQty = roundQuantity(input.quantity ?? current.quantity);
  if (!Number.isFinite(closeQty) || closeQty <= 0) {
    throw new PositionCloseError("Close quantity must be greater than zero.");
  }
  if (closeQty - current.quantity > QTY_EPS) {
    throw new PositionCloseError("Cannot close more than the open quantity.");
  }
  if (input.closeDate < current.entryDate) {
    throw new PositionCloseError("Close date cannot be before the entry date.");
  }

  const closedAt = input.closedAt ?? new Date().toISOString();
  const remainingQty = roundQuantity(current.quantity - closeQty);
  const full = remainingQty <= QTY_EPS;

  if (full) {
    const closed = stampClosed(current, {
      closePrice: input.closePrice,
      closeDate: input.closeDate,
      closedAt,
      notes: input.notes,
    });
    return {
      mode: "full",
      remaining: null,
      closed,
      book: book.map((row) => (row.id === id ? closed : row)),
    };
  }

  const remaining: PositionRecord = {
    ...current,
    quantity: remainingQty,
    updatedAt: closedAt,
  };
  const closed = stampClosed(
    {
      ...current,
      id: input.closedLotId ?? `pos-${crypto.randomUUID()}`,
      quantity: closeQty,
    },
    {
      closePrice: input.closePrice,
      closeDate: input.closeDate,
      closedAt,
      notes: input.notes,
    },
  );
  return {
    mode: "partial",
    remaining,
    closed,
    book: book.flatMap((row) => (row.id === id ? [remaining, closed] : [row])),
  };
}
