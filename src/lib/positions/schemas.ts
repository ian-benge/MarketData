import { z } from "zod";
import {
  POSITION_ASSET_TYPES,
  POSITION_SIDES,
  POSITION_STATUSES,
} from "./types";
import { defaultMultiplier } from "./math";

export const TICKER_PATTERN = /^[A-Z][A-Z0-9.=^-]{0,20}$/;

export const PositionWriteSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(21)
    .transform((value) => value.toUpperCase())
    .refine((value) => TICKER_PATTERN.test(value), "Invalid ticker"),
  assetType: z.enum(POSITION_ASSET_TYPES),
  side: z.enum(POSITION_SIDES),
  quantity: z.number().finite().gt(0).max(1_000_000_000),
  multiplier: z.number().finite().gt(0).max(1_000_000).optional(),
  entryPrice: z.number().finite().gt(0).max(10_000_000),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().trim().min(3).max(8).default("USD"),
  strategy: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  ownerId: z.string().trim().min(1).max(64).optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
  confirmManualOnBrokerageBook: z.boolean().optional(),
});

export const PositionPatchSchema = PositionWriteSchema.partial().extend({
  status: z.enum(POSITION_STATUSES).optional(),
});

export const PositionCloseSchema = z.object({
  closePrice: z.number().finite().gt(0).max(10_000_000),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantity: z.number().finite().gt(0).max(1_000_000_000).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const PositionSnapshotSchema = z.object({
  positions: z.array(z.unknown()).max(80),
  includeClosed: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  ownerId: z.string().trim().min(1).max(64).optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
  accountValue: z.number().finite().gt(0).max(1_000_000_000_000).nullable().optional(),
  books: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        ownerId: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(80),
        accountValue: z
          .number()
          .finite()
          .gt(0)
          .max(1_000_000_000_000)
          .nullable()
          .optional(),
        openCount: z.number().int().nonnegative().optional(),
        positionCount: z.number().int().nonnegative().optional(),
      }),
    )
    .max(40)
    .optional(),
});

export const PositionAccountValueSchema = z.object({
  accountValue: z.number().finite().gt(0).max(1_000_000_000_000).nullable(),
  ownerId: z.string().trim().min(1).max(64).optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
});

export const PositionBookWriteSchema = z.object({
  title: z.string().min(1).max(80),
  ownerId: z.string().trim().min(1).max(64).optional(),
});

export const PositionBookPatchSchema = z.object({
  title: z.string().min(1).max(80),
});

export const PositionTradeEmailsSchema = z.object({
  enabled: z.boolean(),
  ownerId: z.string().trim().min(1).max(64).optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
});

export const PositionBookReorderSchema = z.object({
  ownerId: z.string().trim().min(1).max(64).optional(),
  bookIds: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  bookId: z.string().trim().min(1).max(64).optional(),
});

export const OwnerUnlockSchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const OwnerUnlockResetSchema = z.object({
  scope: z.enum(["self", "desk"]),
});

export function resolveMultiplier(
  assetType: z.infer<typeof PositionWriteSchema>["assetType"],
  multiplier: number | undefined,
): number {
  return multiplier ?? defaultMultiplier(assetType);
}
