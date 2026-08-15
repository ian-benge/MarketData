import type { SessionUser } from "@/lib/auth/session";
import { fixturesEnabled } from "@/lib/api/http";
import {
  fixtureSectorRecords,
  fixtureWatchlistRecords,
} from "@/lib/fixtures/watchlists";
import {
  canCreateServerClient,
  createClient,
} from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { seedInstrumentRow } from "./instrument-catalog";
import {
  asMembershipConfidence,
  asMembershipRole,
  asMembershipTier,
  asNavGroup,
  asResolutionStatus,
  asScreenKey,
  asSectorKind,
  asSecurityType,
  asWatchlistPurpose,
  defaultNavGroupForKind,
} from "./taxonomy";
import type {
  CoverageItem,
  CoverageSector,
  CoverageWatchlist,
  PersistenceMode,
  SectorPatch,
  SectorWrite,
  WatchlistPatch,
  WatchlistVisibility,
  WatchlistWrite,
} from "./types";
import {
  CoverageError,
  MAX_SECTORS,
  MAX_WATCHLISTS,
  assertSymbols,
  copyName,
  normalizeDescription,
  normalizeName,
  normalizeTags,
  slugify,
} from "./symbols";

type WatchlistRow = {
  id: string;
  firm_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  visibility: string | null;
  purpose: string | null;
  nav_group: string | null;
  owner_id: string | null;
  archived_at: string | null;
  sort_order: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type InstrumentEmbed = {
  id: string;
  symbol: string;
  name: string;
  security_type?: string | null;
  leverage_multiple?: number | null;
  is_inverse?: boolean | null;
  is_otc?: boolean | null;
  resolution_status?: string | null;
  underlying_symbol?: string | null;
  exchange?: string | null;
};

type ItemRow = {
  id: string;
  watchlist_id?: string;
  sector_id?: string;
  notes: string | null;
  tags: string[] | null;
  sort_order: number | null;
  role?: string | null;
  tier?: string | null;
  rationale?: string | null;
  source_url?: string | null;
  confidence?: string | null;
  review_by?: string | null;
  expires_at?: string | null;
  instruments: InstrumentEmbed | InstrumentEmbed[] | null;
};

type SectorRow = {
  id: string;
  firm_id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string | null;
  nav_group: string | null;
  parent_id: string | null;
  benchmark_symbol: string | null;
  last_reviewed_at: string | null;
  review_by: string | null;
  expires_at: string | null;
  source_url: string | null;
  screen_key: string | null;
  is_system: boolean | null;
  archived_at: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

const INSTRUMENT_EMBED =
  "id, symbol, name, security_type, leverage_multiple, is_inverse, is_otc, resolution_status, underlying_symbol, exchange";
const WATCHLIST_SELECT =
  "id, firm_id, name, description, is_default, visibility, purpose, nav_group, owner_id, archived_at, sort_order, created_by, created_at, updated_at";
const SECTOR_SELECT =
  "id, firm_id, slug, name, description, kind, nav_group, parent_id, benchmark_symbol, last_reviewed_at, review_by, expires_at, source_url, screen_key, is_system, archived_at, sort_order, created_at, updated_at";
const ITEM_SELECT = `id, notes, tags, sort_order, role, tier, rationale, source_url, confidence, review_by, expires_at, instruments ( ${INSTRUMENT_EMBED} )`;

function asVisibility(value: string | null | undefined): WatchlistVisibility {
  return value === "personal" ? "personal" : "shared";
}

function asInstrument(
  value: ItemRow["instruments"],
): InstrumentEmbed | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function itemsFromRows(rows: ItemRow[] | null | undefined): CoverageItem[] {
  const items = [...(rows ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const out: CoverageItem[] = [];
  for (const row of items) {
    const instrument = asInstrument(row.instruments);
    const ticker = instrument?.symbol?.toUpperCase();
    if (!ticker) continue;
    out.push({
      ticker,
      name: instrument?.name ?? null,
      notes: row.notes,
      tags: Array.isArray(row.tags) ? row.tags : [],
      sortOrder: row.sort_order ?? 0,
      role: asMembershipRole(row.role),
      tier: asMembershipTier(row.tier),
      rationale: row.rationale ?? null,
      sourceUrl: row.source_url ?? null,
      confidence: asMembershipConfidence(row.confidence),
      reviewBy: row.review_by ?? null,
      expiresAt: row.expires_at ?? null,
      securityType: asSecurityType(instrument?.security_type),
      leverageMultiple: instrument?.leverage_multiple ?? null,
      isInverse: Boolean(instrument?.is_inverse),
      isOtc: Boolean(instrument?.is_otc),
      resolutionStatus: asResolutionStatus(instrument?.resolution_status),
      underlyingSymbol: instrument?.underlying_symbol ?? null,
      exchange: instrument?.exchange ?? null,
    });
  }
  return out;
}

function mapWatchlist(row: WatchlistRow, items: CoverageItem[]): CoverageWatchlist {
  return {
    id: row.id,
    firmId: row.firm_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    visibility: asVisibility(row.visibility),
    purpose: asWatchlistPurpose(row.purpose),
    navGroup: asNavGroup(row.nav_group),
    ownerId: row.owner_id,
    archivedAt: row.archived_at,
    sortOrder: row.sort_order ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    symbols: items.map((item) => item.ticker),
    items,
  };
}

function mapSector(row: SectorRow, items: CoverageItem[]): CoverageSector {
  return {
    id: row.id,
    firmId: row.firm_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: asSectorKind(row.kind),
    navGroup: asNavGroup(row.nav_group),
    parentId: row.parent_id,
    benchmarkSymbol: row.benchmark_symbol,
    lastReviewedAt: row.last_reviewed_at,
    reviewBy: row.review_by,
    expiresAt: row.expires_at,
    sourceUrl: row.source_url,
    screenKey: asScreenKey(row.screen_key),
    isSystem: Boolean(row.is_system),
    archivedAt: row.archived_at,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    symbols: items.map((item) => item.ticker),
    items,
  };
}

export function resolvePersistenceMode(user: SessionUser): PersistenceMode {
  if (fixturesEnabled() || user.isDemo) return "fixtures";
  if (canCreateServerClient() && user.firmId) return "supabase";
  return "unavailable";
}

export function buildSessionWatchlist(
  user: SessionUser,
  input: WatchlistWrite & { id?: string },
  extras: Partial<CoverageWatchlist> = {},
): CoverageWatchlist {
  const name = normalizeName(input.name);
  const symbols = assertSymbols(input.symbols ?? [], { allowEmpty: true });
  const now = new Date().toISOString();
  const visibility = input.visibility ?? "shared";
  return {
    id: extras.id ?? input.id ?? `wl-${crypto.randomUUID()}`,
    firmId: user.firmId ?? "a0000000-0000-4000-8000-000000000001",
    name,
    description: normalizeDescription(input.description),
    isDefault: visibility === "personal" ? false : Boolean(input.isDefault),
    visibility,
    purpose: input.purpose ?? extras.purpose ?? "general",
    navGroup: input.navGroup ?? extras.navGroup ?? (input.purpose === "tape" ? "market_tape" : "tactical"),
    ownerId: visibility === "personal" ? user.id : null,
    archivedAt: extras.archivedAt ?? null,
    sortOrder: extras.sortOrder ?? 0,
    createdBy: user.id,
    createdAt: extras.createdAt ?? now,
    updatedAt: now,
    symbols,
    items: symbols.map((ticker, index) => ({
      ticker,
      name: null,
      notes: null,
      tags: [],
      sortOrder: (index + 1) * 10,
    })),
  };
}

export function buildSessionSector(
  user: SessionUser,
  input: SectorWrite & { id?: string; slug?: string },
  extras: Partial<CoverageSector> = {},
): CoverageSector {
  const name = normalizeName(input.name);
  const symbols = assertSymbols(input.symbols ?? [], { allowEmpty: true });
  const now = new Date().toISOString();
  return {
    id: extras.id ?? input.id ?? `sec-${crypto.randomUUID()}`,
    firmId: user.firmId ?? "a0000000-0000-4000-8000-000000000001",
    slug: extras.slug ?? input.slug ?? slugify(name),
    name,
    description: normalizeDescription(input.description),
    kind: input.kind ?? "custom",
    navGroup: input.navGroup ?? extras.navGroup ?? "tactical",
    parentId: extras.parentId ?? null,
    benchmarkSymbol: input.benchmarkSymbol ?? extras.benchmarkSymbol ?? null,
    lastReviewedAt: extras.lastReviewedAt ?? now,
    reviewBy: input.reviewBy ?? extras.reviewBy ?? null,
    expiresAt: input.expiresAt ?? extras.expiresAt ?? null,
    sourceUrl: input.sourceUrl ?? extras.sourceUrl ?? null,
    screenKey: extras.screenKey ?? null,
    isSystem: extras.isSystem ?? false,
    archivedAt: extras.archivedAt ?? null,
    sortOrder: extras.sortOrder ?? 0,
    createdAt: extras.createdAt ?? now,
    updatedAt: now,
    symbols,
    items: symbols.map((ticker, index) => ({
      ticker,
      name: null,
      notes: null,
      tags: [],
      sortOrder: (index + 1) * 10,
    })),
  };
}

function canMutateList(user: SessionUser, list: CoverageWatchlist) {
  if (list.visibility === "personal") return list.ownerId === user.id;
  return true;
}

function uniqueNameError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? "";
  if (error?.code === "23505" || /watchlists_shared_name|watchlists_personal_name|duplicate key/i.test(message)) {
    return new CoverageError("A coverage list with this name already exists.", 409);
  }
  if (/watchlists_one_default/i.test(message)) {
    return new CoverageError("Only one shared default watchlist is allowed.", 409);
  }
  return null;
}

function uniqueSectorError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? "";
  if (error?.code === "23505" || /sectors_firm_id_slug|duplicate key/i.test(message)) {
    return new CoverageError("A sector or theme with this name already exists.", 409);
  }
  return null;
}

export async function listStoredWatchlists(
  user: SessionUser,
  options: { includeArchived?: boolean } = {},
): Promise<{ lists: CoverageWatchlist[]; persistence: PersistenceMode }> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return { lists: fixtureWatchlistRecords(user.id), persistence };
  }
  if (persistence !== "supabase" || !user.firmId) {
    return { lists: [], persistence: "unavailable" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("watchlists")
      .select(WATCHLIST_SELECT)
      .eq("firm_id", user.firmId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!options.includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as WatchlistRow[] | null) ?? [];
    const ids = rows.map((row) => row.id);
    const itemsByList = new Map<string, CoverageItem[]>();
    if (ids.length) {
      const itemRows = await fetchAllRows(async (from, to) => {
        const { data: page, error: itemError } = await supabase
          .from("watchlist_items")
          .select(`id, watchlist_id, ${ITEM_SELECT}`)
          .in("watchlist_id", ids)
          .order("sort_order", { ascending: true })
          .range(from, to);
        if (itemError) throw itemError;
        return (page as ItemRow[] | null) ?? [];
      });
      for (const row of itemRows) {
        if (!row.watchlist_id) continue;
        const current = itemsByList.get(row.watchlist_id) ?? [];
        current.push(...itemsFromRows([row]));
        itemsByList.set(row.watchlist_id, current);
      }
    }
    return {
      lists: rows.map((row) => mapWatchlist(row, itemsByList.get(row.id) ?? [])),
      persistence,
    };
  } catch {
    return { lists: [], persistence: "unavailable" };
  }
}

export async function listStoredSectors(
  user: SessionUser,
  options: { includeArchived?: boolean } = {},
): Promise<{ sectors: CoverageSector[]; persistence: PersistenceMode }> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return { sectors: fixtureSectorRecords(), persistence };
  }
  if (persistence !== "supabase" || !user.firmId) {
    return { sectors: [], persistence: "unavailable" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("sectors")
      .select(SECTOR_SELECT)
      .eq("firm_id", user.firmId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as SectorRow[] | null) ?? [];
    const ids = rows.map((row) => row.id);
    const itemsBySector = new Map<string, CoverageItem[]>();
    if (ids.length) {
      const itemRows = await fetchAllRows(async (from, to) => {
        const { data: page, error: itemError } = await supabase
          .from("sector_instruments")
          .select(`id, sector_id, ${ITEM_SELECT}`)
          .in("sector_id", ids)
          .order("sort_order", { ascending: true })
          .range(from, to);
        if (itemError) throw itemError;
        return (page as ItemRow[] | null) ?? [];
      });
      for (const row of itemRows) {
        if (!row.sector_id) continue;
        const current = itemsBySector.get(row.sector_id) ?? [];
        current.push(...itemsFromRows([row]));
        itemsBySector.set(row.sector_id, current);
      }
    }
    return {
      sectors: rows.map((row) => mapSector(row, itemsBySector.get(row.id) ?? [])),
      persistence,
    };
  } catch {
    return { sectors: [], persistence: "unavailable" };
  }
}

async function ensureInstruments(
  symbols: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const map = new Map<string, { id: string; name: string }>();
  if (!unique.length) return map;
  const supabase = await createClient();
  const existing = await fetchAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from("instruments")
      .select("id, symbol, name")
      .in("symbol", unique)
      .range(from, to);
    if (error) throw error;
    return (data as Array<{ id: string; symbol: string; name: string }> | null) ?? [];
  });
  for (const row of existing) {
    map.set(row.symbol.toUpperCase(), { id: row.id, name: row.name });
  }
  const missing = unique.filter((symbol) => !map.has(symbol));
  if (missing.length) {
    const { error } = await supabase.from("instruments").upsert(
      missing.map((symbol) => {
        const seed = seedInstrumentRow(symbol);
        return {
          symbol: seed.symbol,
          name: seed.name,
          asset_class: seed.asset_class,
          security_type: seed.security_type,
          leverage_multiple: seed.leverage_multiple,
          is_inverse: seed.is_inverse,
          is_otc: seed.is_otc,
          underlying_symbol: seed.underlying_symbol,
          issuer: seed.issuer,
          exchange: seed.exchange,
          country: seed.country,
          resolution_status: seed.resolution_status,
          quote_source: seed.quote_source,
        };
      }),
      { onConflict: "symbol", ignoreDuplicates: true },
    );
    if (error) {
      throw new CoverageError(
        error.message || "Unable to add tickers to the instrument universe.",
        500,
      );
    }
    const created = await fetchAllRows(async (from, to) => {
      const { data, error: selectError } = await supabase
        .from("instruments")
        .select("id, symbol, name")
        .in("symbol", missing)
        .range(from, to);
      if (selectError) throw selectError;
      return (data as Array<{ id: string; symbol: string; name: string }> | null) ?? [];
    });
    for (const row of created) {
      map.set(row.symbol.toUpperCase(), { id: row.id, name: row.name });
    }
  }
  return map;
}

async function replaceWatchlistItems(
  watchlistId: string,
  symbols: string[],
  extras: Map<
    string,
    {
      notes?: string | null;
      tags?: string[];
      role?: CoverageItem["role"];
      tier?: CoverageItem["tier"];
      rationale?: string | null;
    }
  > = new Map(),
) {
  const supabase = await createClient();
  const instruments = await ensureInstruments(symbols);
  const { error: deleteError } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("watchlist_id", watchlistId);
  if (deleteError) throw new CoverageError(deleteError.message, 500);
  if (!symbols.length) return;
  const rows = symbols.map((ticker, index) => {
    const instrument = instruments.get(ticker);
    if (!instrument) {
      throw new CoverageError(`Unable to resolve ticker ${ticker}.`, 400);
    }
    const extra = extras.get(ticker);
    return {
      watchlist_id: watchlistId,
      instrument_id: instrument.id,
      sort_order: (index + 1) * 10,
      notes: extra?.notes ?? null,
      tags: extra?.tags ?? [],
      role: extra?.role ?? null,
      tier: extra?.tier ?? null,
      rationale: extra?.rationale ?? null,
    };
  });
  const { error } = await supabase.from("watchlist_items").insert(rows);
  if (error) throw new CoverageError(error.message, 500);
}

async function replaceSectorItems(
  sectorId: string,
  symbols: string[],
  extras: Map<
    string,
    {
      notes?: string | null;
      tags?: string[];
      role?: CoverageItem["role"];
      tier?: CoverageItem["tier"];
      rationale?: string | null;
    }
  > = new Map(),
) {
  const supabase = await createClient();
  const instruments = await ensureInstruments(symbols);
  const { error: deleteError } = await supabase
    .from("sector_instruments")
    .delete()
    .eq("sector_id", sectorId);
  if (deleteError) throw new CoverageError(deleteError.message, 500);
  if (!symbols.length) return;
  const rows = symbols.map((ticker, index) => {
    const instrument = instruments.get(ticker);
    if (!instrument) {
      throw new CoverageError(`Unable to resolve ticker ${ticker}.`, 400);
    }
    const extra = extras.get(ticker);
    return {
      sector_id: sectorId,
      instrument_id: instrument.id,
      sort_order: (index + 1) * 10,
      notes: extra?.notes ?? null,
      tags: extra?.tags ?? [],
      role: extra?.role ?? null,
      tier: extra?.tier ?? null,
      rationale: extra?.rationale ?? null,
    };
  });
  const { error } = await supabase.from("sector_instruments").insert(rows);
  if (error) throw new CoverageError(error.message, 500);
}

async function loadList(
  user: SessionUser,
  id: string,
  includeArchived = true,
): Promise<CoverageWatchlist> {
  const { lists, persistence } = await listStoredWatchlists(user, { includeArchived });
  const list = lists.find((row) => row.id === id);
  if (!list) {
    throw new CoverageError(
      persistence === "unavailable"
        ? "Watchlist persistence is not connected in this environment."
        : "Watchlist not found.",
      persistence === "unavailable" ? 503 : 404,
    );
  }
  return list;
}

async function loadSector(
  user: SessionUser,
  id: string,
  includeArchived = true,
): Promise<CoverageSector> {
  const { sectors, persistence } = await listStoredSectors(user, { includeArchived });
  const sector = sectors.find((row) => row.id === id);
  if (!sector) {
    throw new CoverageError(
      persistence === "unavailable"
        ? "Sector persistence is not connected in this environment."
        : "Sector not found.",
      persistence === "unavailable" ? 503 : 404,
    );
  }
  return sector;
}

async function clearDefault(firmId: string, exceptId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("watchlists")
    .update({ is_default: false })
    .eq("firm_id", firmId)
    .eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) throw new CoverageError(error.message, 500);
}

export async function createStoredWatchlist(
  user: SessionUser,
  input: WatchlistWrite,
): Promise<CoverageWatchlist> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const symbols = assertSymbols(input.symbols ?? [], { allowEmpty: true });
  const visibility = input.visibility ?? "shared";
  if (visibility === "personal" && input.isDefault) {
    throw new CoverageError("Personal lists cannot be the firm default.", 400);
  }
  const { lists } = await listStoredWatchlists(user, { includeArchived: true });
  if (lists.filter((list) => !list.archivedAt).length >= MAX_WATCHLISTS) {
    throw new CoverageError(`At most ${MAX_WATCHLISTS} watchlists are allowed.`, 400);
  }
  const supabase = await createClient();
  const nextSort =
    Math.max(0, ...lists.map((list) => list.sortOrder)) + 10;
  if (input.isDefault) await clearDefault(user.firmId);
  const { data, error } = await supabase
    .from("watchlists")
    .insert({
      firm_id: user.firmId,
      name,
      description,
      is_default: input.isDefault === true,
      visibility,
      purpose: input.purpose ?? "general",
      nav_group: input.navGroup ?? (input.purpose === "tape" ? "market_tape" : "tactical"),
      owner_id: visibility === "personal" ? user.id : null,
      created_by: user.id,
      sort_order: nextSort,
    })
    .select(WATCHLIST_SELECT)
    .single();
  if (error || !data) {
    throw uniqueNameError(error) ?? new CoverageError(error?.message ?? "Unable to create watchlist.", 500);
  }
  await replaceWatchlistItems(data.id, symbols);
  return loadList(user, data.id);
}

export async function updateStoredWatchlist(
  user: SessionUser,
  id: string,
  patch: WatchlistPatch,
): Promise<CoverageWatchlist> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const current = await loadList(user, id);
  if (!canMutateList(user, current)) {
    throw new CoverageError("You can only change your own personal watchlists.", 403);
  }
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates.name = normalizeName(patch.name);
  if (patch.description !== undefined) {
    updates.description = normalizeDescription(patch.description);
  }
  if (patch.purpose) updates.purpose = patch.purpose;
  if (patch.visibility) {
    if (patch.visibility === "personal") {
      updates.visibility = "personal";
      updates.owner_id = user.id;
      updates.is_default = false;
    } else {
      updates.visibility = "shared";
      updates.owner_id = null;
    }
  }
  if (patch.isDefault === true) {
    if ((patch.visibility ?? current.visibility) === "personal") {
      throw new CoverageError("Personal lists cannot be the firm default.", 400);
    }
    await clearDefault(user.firmId, id);
    updates.is_default = true;
  } else if (patch.isDefault === false) {
    updates.is_default = false;
  }
  if (patch.archived === true) updates.archived_at = new Date().toISOString();
  if (patch.archived === false) updates.archived_at = null;
  if (Object.keys(updates).length) {
    const { error } = await supabase.from("watchlists").update(updates).eq("id", id);
    if (error) {
      throw uniqueNameError(error) ?? new CoverageError(error.message, 500);
    }
  }
  if (patch.archived === true && current.isDefault) {
    const { lists } = await listStoredWatchlists(user);
    const nextDefault = lists.find(
      (list) => list.id !== id && list.visibility === "shared" && !list.archivedAt,
    );
    if (nextDefault) {
      await supabase.from("watchlists").update({ is_default: true }).eq("id", nextDefault.id);
    }
  }
  if (patch.symbols || patch.items) {
    const extras = new Map(
      current.items.map((item) => [
        item.ticker,
        {
          notes: item.notes,
          tags: item.tags,
          role: item.role,
          tier: item.tier,
          rationale: item.rationale,
        },
      ]),
    );
    if (patch.items) {
      for (const item of patch.items) {
        extras.set(item.ticker, {
          notes: item.notes ?? extras.get(item.ticker)?.notes ?? null,
          tags: item.tags
            ? normalizeTags(item.tags)
            : extras.get(item.ticker)?.tags ?? [],
          role: item.role ?? extras.get(item.ticker)?.role ?? null,
          tier: item.tier ?? extras.get(item.ticker)?.tier ?? null,
          rationale: item.rationale ?? extras.get(item.ticker)?.rationale ?? null,
        });
      }
    }
    const symbols = patch.symbols
      ? assertSymbols(patch.symbols, { allowEmpty: true })
      : current.symbols;
    await replaceWatchlistItems(id, symbols, extras);
  }
  return loadList(user, id);
}

export async function deleteStoredWatchlist(user: SessionUser, id: string) {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const current = await loadList(user, id);
  if (!canMutateList(user, current)) {
    throw new CoverageError("You can only delete your own personal watchlists.", 403);
  }
  const supabase = await createClient();
  if (current.isDefault) {
    const { lists } = await listStoredWatchlists(user);
    const nextDefault = lists.find(
      (list) => list.id !== id && list.visibility === "shared" && !list.archivedAt,
    );
    if (nextDefault) {
      await supabase.from("watchlists").update({ is_default: true }).eq("id", nextDefault.id);
    }
  }
  const { error } = await supabase.from("watchlists").delete().eq("id", id);
  if (error) throw new CoverageError(error.message, 500);
}

export async function convertStoredWatchlistToSector(
  user: SessionUser,
  id: string,
  input: Partial<Pick<SectorWrite, "name" | "description" | "kind" | "navGroup" | "symbols">>,
): Promise<CoverageSector> {
  const current = await loadList(user, id);
  if (!canMutateList(user, current)) {
    throw new CoverageError("You can only convert your own personal watchlists.", 403);
  }
  const sector = await createStoredSector(user, {
    name: input.name ?? current.name,
    description:
      input.description !== undefined ? input.description : current.description,
    kind: input.kind ?? "theme",
    navGroup: input.navGroup,
    symbols: input.symbols ?? current.symbols,
  });
  try {
    await deleteStoredWatchlist(user, id);
  } catch (error) {
    await deleteStoredSector(user, sector.id);
    throw error;
  }
  return sector;
}

export async function duplicateStoredWatchlist(
  user: SessionUser,
  id: string,
): Promise<CoverageWatchlist> {
  const current = await loadList(user, id);
  if (current.visibility === "personal" && current.ownerId !== user.id) {
    throw new CoverageError("You can only duplicate your own personal watchlists.", 403);
  }
  return createStoredWatchlist(user, {
    name: copyName(current.name),
    description: current.description,
    symbols: current.symbols,
    visibility: current.visibility,
    purpose: current.purpose,
    navGroup: current.navGroup,
    isDefault: false,
  });
}

export async function reorderStoredWatchlists(user: SessionUser, ids: string[]) {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const { lists } = await listStoredWatchlists(user, { includeArchived: true });
  const allowed = new Set(lists.filter((list) => canMutateList(user, list)).map((list) => list.id));
  const supabase = await createClient();
  await Promise.all(
    ids.map(async (id, index) => {
      if (!allowed.has(id)) return;
      const { error } = await supabase
        .from("watchlists")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id);
      if (error) throw new CoverageError(error.message, 500);
    }),
  );
}

export async function createStoredSector(
  user: SessionUser,
  input: SectorWrite,
): Promise<CoverageSector> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const symbols = assertSymbols(input.symbols ?? [], { allowEmpty: true });
  const kind = input.kind ?? "custom";
  if (kind === "catalyst" && !input.reviewBy && !input.expiresAt) {
    throw new CoverageError(
      "Catalyst collections need a review date or expiry.",
      400,
    );
  }
  const { sectors } = await listStoredSectors(user, { includeArchived: true });
  if (sectors.filter((sector) => !sector.archivedAt).length >= MAX_SECTORS) {
    throw new CoverageError(`At most ${MAX_SECTORS} sectors and themes are allowed.`, 400);
  }
  let slug = slugify(name);
  const used = new Set(sectors.map((sector) => sector.slug));
  if (used.has(slug)) {
    let suffix = 2;
    while (used.has(`${slug}-${suffix}`)) suffix += 1;
    slug = `${slug}-${suffix}`;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectors")
    .insert({
      firm_id: user.firmId,
      slug,
      name,
      description,
      kind,
      nav_group: input.navGroup ?? defaultNavGroupForKind(kind),
      benchmark_symbol: input.benchmarkSymbol ?? null,
      review_by: input.reviewBy ?? null,
      expires_at: input.expiresAt ?? null,
      source_url: input.sourceUrl ?? null,
      sort_order:
        (sectors.length ? Math.min(...sectors.map((sector) => sector.sortOrder)) : 10) - 10,
    })
    .select(SECTOR_SELECT)
    .single();
  if (error || !data) {
    throw uniqueSectorError(error) ?? new CoverageError(error?.message ?? "Unable to create sector.", 500);
  }
  await replaceSectorItems(data.id, symbols);
  return loadSector(user, data.id);
}

export async function updateStoredSector(
  user: SessionUser,
  id: string,
  patch: SectorPatch,
): Promise<CoverageSector> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const current = await loadSector(user, id);
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates.name = normalizeName(patch.name);
  if (patch.description !== undefined) {
    updates.description = normalizeDescription(patch.description);
  }
  if (patch.kind) updates.kind = patch.kind;
  if (patch.navGroup) updates.nav_group = patch.navGroup;
  if (patch.benchmarkSymbol !== undefined) {
    updates.benchmark_symbol = patch.benchmarkSymbol;
  }
  if (patch.reviewBy !== undefined) updates.review_by = patch.reviewBy;
  if (patch.expiresAt !== undefined) updates.expires_at = patch.expiresAt;
  if (patch.sourceUrl !== undefined) updates.source_url = patch.sourceUrl;
  const nextKind = patch.kind ?? current.kind;
  if (
    nextKind === "catalyst" &&
    !(patch.reviewBy ?? current.reviewBy) &&
    !(patch.expiresAt ?? current.expiresAt)
  ) {
    throw new CoverageError(
      "Catalyst collections need a review date or expiry.",
      400,
    );
  }
  if (patch.archived === true) updates.archived_at = new Date().toISOString();
  if (patch.archived === false) updates.archived_at = null;
  if (Object.keys(updates).length) {
    const { error } = await supabase.from("sectors").update(updates).eq("id", id);
    if (error) throw uniqueSectorError(error) ?? new CoverageError(error.message, 500);
  }
  if (patch.symbols) {
    const extras = new Map(
      current.items.map((item) => [
        item.ticker,
        {
          notes: item.notes,
          tags: item.tags,
          role: item.role,
          tier: item.tier,
          rationale: item.rationale,
        },
      ]),
    );
    await replaceSectorItems(id, assertSymbols(patch.symbols, { allowEmpty: true }), extras);
  }
  return loadSector(user, id);
}

export async function deleteStoredSector(user: SessionUser, id: string) {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  await loadSector(user, id);
  const supabase = await createClient();
  const { error } = await supabase.from("sectors").delete().eq("id", id);
  if (error) throw new CoverageError(error.message, 500);
}

export async function convertStoredSectorToWatchlist(
  user: SessionUser,
  id: string,
  input: Partial<Pick<WatchlistWrite, "name" | "description" | "visibility" | "isDefault" | "symbols">>,
): Promise<CoverageWatchlist> {
  const current = await loadSector(user, id);
  const watchlist = await createStoredWatchlist(user, {
    name: input.name ?? current.name,
    description:
      input.description !== undefined ? input.description : current.description,
    visibility: input.visibility ?? "shared",
    isDefault: input.isDefault === true,
    symbols: input.symbols ?? current.symbols,
  });
  try {
    await deleteStoredSector(user, id);
  } catch (error) {
    await deleteStoredWatchlist(user, watchlist.id);
    throw error;
  }
  return watchlist;
}

export async function reorderStoredSectors(user: SessionUser, ids: string[]) {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "unavailable" || !user.firmId) {
    throw new CoverageError(
      "Watchlist persistence is not connected in this environment.",
      503,
    );
  }
  const supabase = await createClient();
  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await supabase
        .from("sectors")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
        .eq("firm_id", user.firmId);
      if (error) throw new CoverageError(error.message, 500);
    }),
  );
}

export async function addSymbolsToWatchlist(
  user: SessionUser,
  id: string,
  symbols: string[],
): Promise<CoverageWatchlist> {
  const current = await loadList(user, id);
  if (!canMutateList(user, current)) {
    throw new CoverageError("You can only change your own personal watchlists.", 403);
  }
  const next = assertSymbols([...current.symbols, ...symbols], { allowEmpty: true });
  return updateStoredWatchlist(user, id, { symbols: next });
}

export async function addSymbolsToSector(
  user: SessionUser,
  id: string,
  symbols: string[],
): Promise<CoverageSector> {
  const current = await loadSector(user, id);
  const next = assertSymbols([...current.symbols, ...symbols], { allowEmpty: true });
  return updateStoredSector(user, id, { symbols: next });
}

export async function moveStoredSymbol(
  user: SessionUser,
  input: {
    ticker: string;
    fromId: string;
    toId: string;
    fromType: "watchlist" | "sector";
    toType: "watchlist" | "sector";
    mode: "move" | "copy";
  },
) {
  const ticker = assertSymbols([input.ticker])[0]!;
  if (input.fromType === "watchlist") {
    const from = await loadList(user, input.fromId);
    if (!canMutateList(user, from)) {
      throw new CoverageError("You can only change your own personal watchlists.", 403);
    }
    if (input.mode === "move") {
      await updateStoredWatchlist(user, from.id, {
        symbols: from.symbols.filter((symbol) => symbol !== ticker),
      });
    }
  } else {
    const from = await loadSector(user, input.fromId);
    if (input.mode === "move") {
      await updateStoredSector(user, from.id, {
        symbols: from.symbols.filter((symbol) => symbol !== ticker),
      });
    }
  }
  if (input.toType === "watchlist") {
    await addSymbolsToWatchlist(user, input.toId, [ticker]);
  } else {
    await addSymbolsToSector(user, input.toId, [ticker]);
  }
}
