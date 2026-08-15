import { z } from "zod";
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_TIERS,
  NAV_GROUPS,
  SECTOR_KINDS,
  WATCHLIST_PURPOSES,
} from "./taxonomy";
import { WATCHLIST_VISIBILITIES } from "./types";
import { DESCRIPTION_MAX_LEN, NAME_MAX_LEN, SYMBOL_PATTERN } from "./symbols";

const SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(15)
  .transform((value) => value.toUpperCase())
  .refine((value) => SYMBOL_PATTERN.test(value), "Invalid ticker");

const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .transform((value) => value.toLowerCase());

export const WatchlistWriteSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
  visibility: z.enum(WATCHLIST_VISIBILITIES).optional(),
  purpose: z.enum(WATCHLIST_PURPOSES).optional(),
  navGroup: z.enum(NAV_GROUPS).optional(),
  isDefault: z.boolean().optional(),
});

export const WatchlistPatchSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
  visibility: z.enum(WATCHLIST_VISIBILITIES).optional(),
  purpose: z.enum(WATCHLIST_PURPOSES).optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
  items: z
    .array(
      z.object({
        ticker: SymbolSchema,
        notes: z.string().trim().max(500).nullable().optional(),
        tags: z.array(TagSchema).max(8).optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
        role: z.enum(MEMBERSHIP_ROLES).nullable().optional(),
        tier: z.enum(MEMBERSHIP_TIERS).nullable().optional(),
        rationale: z.string().trim().max(400).nullable().optional(),
      }),
    )
    .max(120)
    .optional(),
});

export const WatchlistReorderSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(160),
});

export const SymbolMoveSchema = z.object({
  ticker: SymbolSchema,
  fromId: z.string().trim().min(1).max(64),
  toId: z.string().trim().min(1).max(64),
  fromType: z.enum(["watchlist", "sector"]).default("watchlist"),
  toType: z.enum(["watchlist", "sector"]).default("watchlist"),
  mode: z.enum(["move", "copy"]).default("move"),
});

export const AddSymbolsSchema = z.object({
  symbols: z.array(SymbolSchema).min(1).max(120),
});

export const SectorWriteSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  kind: z.enum(SECTOR_KINDS).optional(),
  navGroup: z.enum(NAV_GROUPS).optional(),
  benchmarkSymbol: SymbolSchema.nullable().optional(),
  reviewBy: z.string().trim().max(32).nullable().optional(),
  expiresAt: z.string().trim().max(32).nullable().optional(),
  sourceUrl: z.string().trim().max(500).nullable().optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
});

export const SectorPatchSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  kind: z.enum(SECTOR_KINDS).optional(),
  navGroup: z.enum(NAV_GROUPS).optional(),
  benchmarkSymbol: SymbolSchema.nullable().optional(),
  reviewBy: z.string().trim().max(32).nullable().optional(),
  expiresAt: z.string().trim().max(32).nullable().optional(),
  sourceUrl: z.string().trim().max(500).nullable().optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
  archived: z.boolean().optional(),
});

export const SectorReorderSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(160),
});

export const WatchlistConvertSchema = z.object({
  identity: z.literal("sector"),
  name: z.string().trim().min(1).max(NAME_MAX_LEN).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  kind: z.enum(SECTOR_KINDS).optional(),
  navGroup: z.enum(NAV_GROUPS).optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
});

export const SectorConvertSchema = z.object({
  identity: z.literal("watchlist"),
  name: z.string().trim().min(1).max(NAME_MAX_LEN).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LEN).nullable().optional(),
  visibility: z.enum(WATCHLIST_VISIBILITIES).optional(),
  isDefault: z.boolean().optional(),
  symbols: z.array(SymbolSchema).max(120).optional(),
});
