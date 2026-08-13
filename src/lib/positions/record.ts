import { z } from "zod";
import {
  POSITION_ASSET_TYPES,
  POSITION_SIDES,
  POSITION_STATUSES,
  type PositionRecord,
} from "./types";
import { TICKER_PATTERN } from "./schemas";

export const PositionRecordSchema = z.object({
  id: z.string().min(1).max(64),
  firmId: z.string().min(1).max(64),
  ticker: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => TICKER_PATTERN.test(value), "Invalid ticker"),
  assetType: z.enum(POSITION_ASSET_TYPES),
  side: z.enum(POSITION_SIDES),
  quantity: z.number().finite().gt(0),
  multiplier: z.number().finite().gt(0),
  entryPrice: z.number().finite().gt(0),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().min(3).max(8).default("USD"),
  strategy: z.string().max(80).nullable(),
  notes: z.string().max(2000).nullable(),
  status: z.enum(POSITION_STATUSES),
  closePrice: z.number().finite().gt(0).nullable(),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  closedAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  bookId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function parsePositionRecords(raw: unknown[]): PositionRecord[] {
  const rows: PositionRecord[] = [];
  for (const item of raw) {
    const parsed = PositionRecordSchema.safeParse(item);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}
