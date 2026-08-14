import type { SessionUser } from "@/lib/auth/session";
import { fixturesEnabled } from "@/lib/api/http";
import { fixtureAdmin } from "@/lib/fixtures/admin";
import {
  DEFAULT_BOOK_TITLE,
  PositionBookError,
  normalizeBookTitle,
} from "./books";
import { fixtureBooks, fixturePositions } from "@/lib/fixtures/positions";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  canCreateServerClient,
  createClient,
} from "@/lib/supabase/server";
import { applyCloseToBook, PositionCloseError } from "./close";
import { isAssetType } from "./math";
import {
  UNASSIGNED_OWNER_ID,
  canEditPositionBook,
  ownerKey,
  type PositionTeamMember,
} from "./owners";
import { bookIsBrokerageLinked, loadPositionSource } from "@/lib/brokerage/store";
import { BrokerageError } from "@/lib/brokerage/errors";
import type {
  PositionAssetType,
  PositionRecord,
  PositionSide,
  PositionStatus,
} from "./types";

export type PositionWrite = {
  ticker: string;
  assetType: PositionAssetType;
  side: PositionSide;
  quantity: number;
  multiplier: number;
  entryPrice: number;
  entryDate: string;
  currency: string;
  strategy: string | null;
  notes: string | null;
};

type DbRow = {
  id: string;
  firm_id: string;
  ticker: string;
  asset_type: string;
  side: string;
  quantity: number | string;
  multiplier: number | string;
  entry_price: number | string;
  entry_date: string;
  currency: string | null;
  strategy: string | null;
  notes: string | null;
  status: string;
  close_price: number | string | null;
  close_date: string | null;
  closed_at: string | null;
  created_by: string | null;
  book_id: string | null;
  source?: string | null;
  brokerage_account_id?: string | null;
  external_id?: string | null;
  brokerage_name?: string | null;
  fees?: number | string | null;
  created_at: string;
  updated_at: string;
};

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asSide(value: string): PositionSide {
  return value === "short" ? "short" : "long";
}

function asStatus(value: string): PositionStatus {
  return value === "closed" ? "closed" : "open";
}

function asAssetType(value: string): PositionAssetType {
  return isAssetType(value) ? value : "other";
}

export function mapPositionRow(row: DbRow): PositionRecord {
  return {
    id: row.id,
    firmId: row.firm_id,
    ticker: row.ticker.toUpperCase(),
    assetType: asAssetType(row.asset_type),
    side: asSide(row.side),
    quantity: asNumber(row.quantity) ?? 0,
    multiplier: asNumber(row.multiplier) ?? 1,
    entryPrice: asNumber(row.entry_price) ?? 0,
    entryDate: row.entry_date.slice(0, 10),
    currency: row.currency ?? "USD",
    strategy: row.strategy,
    notes: row.notes,
    status: asStatus(row.status),
    closePrice: asNumber(row.close_price),
    closeDate: row.close_date ? row.close_date.slice(0, 10) : null,
    closedAt: row.closed_at,
    createdBy: row.created_by,
    bookId: row.book_id,
    source: row.source === "snaptrade" ? "snaptrade" : "manual",
    brokerageAccountId: row.brokerage_account_id ?? null,
    externalId: row.external_id ?? null,
    brokerageName: row.brokerage_name ?? null,
    fees: asNumber(row.fees) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildSessionPosition(
  user: SessionUser,
  input: PositionWrite,
  extras: Partial<PositionRecord> = {},
): PositionRecord {
  const now = extras.updatedAt ?? extras.createdAt ?? new Date().toISOString();
  return {
    id: extras.id ?? `pos-${crypto.randomUUID()}`,
    firmId: user.firmId ?? "a0000000-0000-4000-8000-000000000001",
    ticker: input.ticker,
    assetType: input.assetType,
    side: input.side,
    quantity: input.quantity,
    multiplier: input.multiplier,
    entryPrice: input.entryPrice,
    entryDate: input.entryDate,
    currency: input.currency,
    strategy: input.strategy,
    notes: input.notes,
    status: extras.status ?? "open",
    closePrice: extras.closePrice ?? null,
    closeDate: extras.closeDate ?? null,
    closedAt: extras.closedAt ?? null,
    createdBy: extras.createdBy ?? user.id,
    bookId: extras.bookId ?? null,
    source: extras.source ?? "manual",
    brokerageAccountId: extras.brokerageAccountId ?? null,
    externalId: extras.externalId ?? null,
    brokerageName: extras.brokerageName ?? null,
    fees: extras.fees ?? 0,
    createdAt: extras.createdAt ?? now,
    updatedAt: now,
  };
}

export type PersistenceMode = "supabase" | "fixtures" | "unavailable";

export function resolvePersistenceMode(user: SessionUser): PersistenceMode {
  if (fixturesEnabled() || user.isDemo) return "fixtures";
  if (canCreateServerClient() && user.firmId) return "supabase";
  return "unavailable";
}

export async function listStoredPositions(
  user: SessionUser,
): Promise<{ positions: PositionRecord[]; persistence: PersistenceMode }> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return { positions: fixturePositions.map((row) => ({ ...row })), persistence };
  }
  if (persistence !== "supabase" || !user.firmId) {
    return { positions: [], persistence: "unavailable" };
  }

  try {
    const supabase = await createClient();
    const data = await fetchAllRows(async (from, to) => {
      const { data: page, error } = await supabase
        .from("positions")
        .select(
          "id, firm_id, ticker, asset_type, side, quantity, multiplier, entry_price, entry_date, currency, strategy, notes, status, close_price, close_date, closed_at, created_by, book_id, source, brokerage_account_id, external_id, brokerage_name, fees, created_at, updated_at",
        )
        .eq("firm_id", user.firmId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (page as DbRow[] | null) ?? [];
    });
    return {
      positions: data.map(mapPositionRow),
      persistence,
    };
  } catch {
    return { positions: [], persistence: "unavailable" };
  }
}

export async function listPositionOwners(
  user: SessionUser,
): Promise<PositionTeamMember[]> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return fixtureAdmin.team
      .filter((member) => member.isActive)
      .map((member) => ({
        id: member.id,
        email: member.email,
        displayName: member.displayName,
        role: member.role,
      }));
  }
  if (persistence !== "supabase" || !user.firmId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("team_memberships")
      .select("user_id, role, is_active, profiles(email, display_name)")
      .eq("firm_id", user.firmId)
      .eq("is_active", true);
    if (error || !data) return [];
    const members: PositionTeamMember[] = [];
    for (const row of data as Array<{
      user_id: string;
      role: string;
      profiles:
        | { email?: string; display_name?: string | null }
        | Array<{ email?: string; display_name?: string | null }>
        | null;
    }>) {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      members.push({
        id: row.user_id,
        email: profile?.email ?? "",
        displayName: profile?.display_name ?? null,
        role: row.role === "admin" ? "admin" : "member",
      });
    }
    return members;
  } catch {
    return [];
  }
}

function createdByForInsert(ownerId: string): string | null {
  return ownerId === UNASSIGNED_OWNER_ID ? null : ownerId;
}

const POSITION_SELECT =
  "id, firm_id, ticker, asset_type, side, quantity, multiplier, entry_price, entry_date, currency, strategy, notes, status, close_price, close_date, closed_at, created_by, book_id, source, brokerage_account_id, external_id, brokerage_name, fees, created_at, updated_at";

const BOOK_SELECT =
  "id, firm_id, owner_id, title, account_value, source, fees, sort_order";

type BookDbRow = {
  id: string;
  firm_id: string;
  owner_id: string;
  title: string;
  account_value: number | string | null;
  source?: string | null;
  fees?: number | string | null;
  sort_order?: number | string | null;
};

export type StoredBook = {
  id: string;
  ownerId: string;
  title: string;
  accountValue: number | null;
  source: "manual" | "snaptrade";
  fees: number;
  sortOrder: number;
  brokerageName?: string | null;
};

function mapBookRow(row: BookDbRow): StoredBook {
  const value = asNumber(row.account_value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    accountValue: value != null && value > 0 ? value : null,
    source: row.source === "snaptrade" ? "snaptrade" : "manual",
    fees: asNumber(row.fees) ?? 0,
    sortOrder: Math.max(0, Math.trunc(asNumber(row.sort_order) ?? 0)),
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function listStoredBooks(
  user: SessionUser,
  ownerId?: string,
): Promise<StoredBook[]> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    const rows = ownerId
      ? fixtureBooks.filter((book) => book.ownerId === ownerId)
      : fixtureBooks;
    return rows
      .map((book, index) => ({
        id: book.id,
        ownerId: book.ownerId,
        title: book.title,
        accountValue: book.accountValue,
        source: book.source ?? "manual",
        fees: book.fees ?? 0,
        sortOrder: book.sortOrder ?? index,
        brokerageName: book.brokerageName ?? null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }
  if (persistence !== "supabase" || !user.firmId) return [];

  try {
    const supabase = await createClient();
    let query = supabase
      .from("position_books")
      .select(BOOK_SELECT)
      .eq("firm_id", user.firmId)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (ownerId && ownerId !== UNASSIGNED_OWNER_ID) {
      query = query.eq("owner_id", ownerId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data as BookDbRow[] | null)?.map(mapBookRow) ?? [];
  } catch {
    return [];
  }
}

function clientForOwnerRead() {
  return canCreateAdminClient() ? createAdminClient() : null;
}

/** Loads one owner's lots for a teammate view. Always scoped to firm_id. */
export async function listStoredPositionsForOwner(
  user: SessionUser,
  ownerId: string,
): Promise<PositionRecord[]> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return fixturePositions
      .filter((row) => ownerKey(row.createdBy) === ownerId)
      .map((row) => ({ ...row }));
  }
  if (
    persistence !== "supabase" ||
    !user.firmId ||
    ownerId === UNASSIGNED_OWNER_ID
  ) {
    return [];
  }

  try {
    if (!canCreateAdminClient() && user.role !== "admin") return [];
    const supabase = clientForOwnerRead() ?? (await createClient());
    const data = await fetchAllRows(async (from, to) => {
      const { data: page, error } = await supabase
        .from("positions")
        .select(POSITION_SELECT)
        .eq("firm_id", user.firmId)
        .eq("created_by", ownerId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (page as DbRow[] | null) ?? [];
    });
    return data.map(mapPositionRow);
  } catch {
    return [];
  }
}

export async function listStoredBooksForOwner(
  user: SessionUser,
  ownerId: string,
): Promise<StoredBook[]> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    return listStoredBooks(user, ownerId);
  }
  if (
    persistence !== "supabase" ||
    !user.firmId ||
    ownerId === UNASSIGNED_OWNER_ID
  ) {
    return [];
  }

  try {
    if (!canCreateAdminClient() && user.role !== "admin") return [];
    const supabase = clientForOwnerRead() ?? (await createClient());
    const { data, error } = await supabase
      .from("position_books")
      .select(BOOK_SELECT)
      .eq("firm_id", user.firmId)
      .eq("owner_id", ownerId)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw error;
    return (data as BookDbRow[] | null)?.map(mapBookRow) ?? [];
  } catch {
    return [];
  }
}

export async function ensureMainBook(
  user: SessionUser,
  ownerId: string,
): Promise<StoredBook | null> {
  if (ownerId === UNASSIGNED_OWNER_ID) return null;
  const existing = await listStoredBooks(user, ownerId);
  const main =
    existing.find((book) => book.title === DEFAULT_BOOK_TITLE) ?? existing[0];
  if (main) return main;
  if (resolvePersistenceMode(user) === "fixtures") {
    return {
      id: `book-${ownerId}-main`,
      ownerId,
      title: DEFAULT_BOOK_TITLE,
      accountValue: null,
      source: "manual",
      fees: 0,
      sortOrder: 0,
    };
  }
  if (!canEditPositionBook(user, ownerId)) return null;
  return insertStoredBook(user, ownerId, DEFAULT_BOOK_TITLE);
}

export async function insertStoredBook(
  user: SessionUser,
  ownerId: string,
  title: string,
): Promise<StoredBook> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  if (ownerId === UNASSIGNED_OWNER_ID) {
    throw new PositionBookError("Unassigned lots cannot have named books.", 400);
  }
  if (!canEditPositionBook(user, ownerId)) {
    throw new PositionBookError("You can only add books to your own account.", 403);
  }
  const normalized = normalizeBookTitle(title);
  const siblings = await listStoredBooks(user, ownerId);
  const sortOrder =
    siblings.reduce((max, book) => Math.max(max, book.sortOrder), -1) + 1;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_books")
    .insert({
      firm_id: user.firmId,
      owner_id: ownerId,
      title: normalized,
      sort_order: sortOrder,
    })
    .select(BOOK_SELECT)
    .single();
  if (isUniqueViolation(error)) {
    throw new PositionBookError("A book with that title already exists.", 409);
  }
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create the book.");
  }
  return mapBookRow(data as BookDbRow);
}

export async function renameStoredBook(
  user: SessionUser,
  bookId: string,
  title: string,
): Promise<StoredBook> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const current = await loadStoredBook(user, bookId);
  if (!canEditPositionBook(user, current.ownerId)) {
    throw new PositionBookError("You can only rename your own books.", 403);
  }
  const normalized = normalizeBookTitle(title);
  if (normalized === current.title) return current;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_books")
    .update({ title: normalized })
    .eq("id", bookId)
    .eq("firm_id", user.firmId)
    .select(BOOK_SELECT)
    .single();
  if (isUniqueViolation(error)) {
    throw new PositionBookError("A book with that title already exists.", 409);
  }
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to rename the book.");
  }
  return mapBookRow(data as BookDbRow);
}

export async function deleteStoredBook(
  user: SessionUser,
  bookId: string,
): Promise<{ ownerId: string; deletedLots: number }> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const current = await loadStoredBook(user, bookId);
  if (!canEditPositionBook(user, current.ownerId)) {
    throw new PositionBookError("You can only delete your own books.", 403);
  }
  const siblings = await listStoredBooks(user, current.ownerId);
  if (siblings.length <= 1) {
    throw new PositionBookError("The last book cannot be deleted.", 409);
  }
  if (await bookIsBrokerageLinked(user, bookId)) {
    throw new PositionBookError(
      "Disconnect the brokerage before deleting this book.",
      409,
    );
  }
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("positions")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", user.firmId)
    .eq("book_id", bookId);
  if (countError) {
    throw new Error(countError.message);
  }
  const { error: lotsError } = await supabase
    .from("positions")
    .delete()
    .eq("firm_id", user.firmId)
    .eq("book_id", bookId);
  if (lotsError) {
    throw new Error(lotsError.message);
  }
  const { error } = await supabase
    .from("position_books")
    .delete()
    .eq("id", bookId)
    .eq("firm_id", user.firmId);
  if (error) {
    throw new Error(error.message);
  }
  return { ownerId: current.ownerId, deletedLots: count ?? 0 };
}

export async function reorderStoredBooks(
  user: SessionUser,
  ownerId: string,
  orderedIds: string[],
): Promise<StoredBook[]> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  if (ownerId === UNASSIGNED_OWNER_ID) {
    throw new PositionBookError("Unassigned lots cannot have named books.", 400);
  }
  if (!canEditPositionBook(user, ownerId)) {
    throw new PositionBookError("You can only reorder your own books.", 403);
  }
  const existing = await listStoredBooks(user, ownerId);
  const existingIds = new Set(existing.map((book) => book.id));
  if (
    existing.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new PositionBookError("Book list does not match this owner.", 400);
  }
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("position_books")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("firm_id", user.firmId)
        .eq("owner_id", ownerId),
    ),
  );
  const failed = results.find((row) => row.error);
  if (failed?.error) {
    throw new Error(failed.error.message);
  }
  return listStoredBooks(user, ownerId);
}

async function loadStoredBook(
  user: SessionUser,
  bookId: string,
): Promise<StoredBook> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_books")
    .select(BOOK_SELECT)
    .eq("id", bookId)
    .eq("firm_id", user.firmId)
    .maybeSingle();
  if (error || !data) {
    throw new PositionBookError("Book not found.", 404);
  }
  return mapBookRow(data as BookDbRow);
}

export async function insertStoredPosition(
  user: SessionUser,
  input: PositionWrite,
  ownerId = user.id,
  bookId?: string | null,
  options?: { confirmManualOnBrokerageBook?: boolean },
): Promise<PositionRecord> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  if (!canEditPositionBook(user, ownerId)) {
    throw new Error("You can only add positions to your own book.");
  }
  const resolvedBook =
    bookId
      ? await loadStoredBook(user, bookId)
      : await ensureMainBook(user, ownerId);
  if (!resolvedBook) {
    throw new PositionBookError("Create a book before adding positions.", 400);
  }
  if (resolvedBook.ownerId !== ownerId) {
    throw new PositionBookError("That book does not belong to this owner.", 400);
  }
  if (resolvedBook.source === "snaptrade") {
    if (!options?.confirmManualOnBrokerageBook) {
      throw new PositionBookError(
        "Manual lots on a linked book are not updated by the broker. Add them to a manual book, or confirm to continue.",
        409,
      );
    }
    const supabasePeek = await createClient();
    const { data: synced } = await supabasePeek
      .from("positions")
      .select("ticker, side")
      .eq("firm_id", user.firmId)
      .eq("book_id", resolvedBook.id)
      .eq("source", "snaptrade")
      .eq("status", "open")
      .eq("ticker", input.ticker)
      .eq("side", input.side)
      .limit(1);
    if (synced?.length) {
      throw new PositionBookError(
        "That name is already synced from the brokerage on this book.",
        409,
      );
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .insert({
      firm_id: user.firmId,
      ticker: input.ticker,
      asset_type: input.assetType,
      side: input.side,
      quantity: input.quantity,
      multiplier: input.multiplier,
      entry_price: input.entryPrice,
      entry_date: input.entryDate,
      currency: input.currency,
      strategy: input.strategy,
      notes: input.notes,
      status: "open",
      created_by: createdByForInsert(ownerId),
      book_id: resolvedBook.id,
    })
    .select(POSITION_SELECT)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save the position.");
  }
  return mapPositionRow(data as DbRow);
}

export async function updateStoredPosition(
  user: SessionUser,
  id: string,
  patch: Partial<PositionWrite>,
): Promise<PositionRecord> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const source = await loadPositionSource(user, id);
  if (source === "snaptrade") {
    throw new BrokerageError(
      "Synced lots are updated from the brokerage. Disconnect or wait for the next sync.",
      409,
    );
  }
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (patch.ticker != null) payload.ticker = patch.ticker;
  if (patch.assetType != null) payload.asset_type = patch.assetType;
  if (patch.side != null) payload.side = patch.side;
  if (patch.quantity != null) payload.quantity = patch.quantity;
  if (patch.multiplier != null) payload.multiplier = patch.multiplier;
  if (patch.entryPrice != null) payload.entry_price = patch.entryPrice;
  if (patch.entryDate != null) payload.entry_date = patch.entryDate;
  if (patch.currency != null) payload.currency = patch.currency;
  if (patch.strategy !== undefined) payload.strategy = patch.strategy;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.assetType != null) payload.asset_type = patch.assetType;
  if (patch.side != null) payload.side = patch.side;
  if (patch.quantity != null) payload.quantity = patch.quantity;
  if (patch.multiplier != null) payload.multiplier = patch.multiplier;
  if (patch.entryPrice != null) payload.entry_price = patch.entryPrice;
  if (patch.entryDate != null) payload.entry_date = patch.entryDate;
  if (patch.currency != null) payload.currency = patch.currency;
  if (patch.strategy !== undefined) payload.strategy = patch.strategy;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const query = supabase
    .from("positions")
    .update(payload)
    .eq("id", id)
    .eq("firm_id", user.firmId);
  const { data, error } = await (
    user.role === "admin" ? query : query.eq("created_by", user.id)
  )
    .select(POSITION_SELECT)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update the position.");
  }
  return mapPositionRow(data as DbRow);
}

export async function closeStoredPosition(
  user: SessionUser,
  id: string,
  input: {
    closePrice: number;
    closeDate: string;
    quantity?: number | null;
    notes?: string | null;
  },
): Promise<{ remaining: PositionRecord | null; closed: PositionRecord }> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const supabase = await createClient();
  const selectQuery = supabase
    .from("positions")
    .select(POSITION_SELECT)
    .eq("id", id)
    .eq("firm_id", user.firmId)
    .eq("status", "open");
  const { data: currentRow, error: loadError } = await (
    user.role === "admin" ? selectQuery : selectQuery.eq("created_by", user.id)
  ).single();
  if (loadError || !currentRow) {
    throw new PositionCloseError("Position not found or already closed.", 404);
  }

  const current = mapPositionRow(currentRow as DbRow);
  if (current.source === "snaptrade") {
    throw new BrokerageError(
      "Synced lots close when they leave the brokerage. Use Disconnect to stop syncing.",
      409,
    );
  }
  const closedAt = new Date().toISOString();
  const result = applyCloseToBook([current], id, {
    closePrice: input.closePrice,
    closeDate: input.closeDate,
    quantity: input.quantity,
    notes: input.notes,
    closedAt,
  });

  if (result.mode === "full") {
    const payload: Record<string, unknown> = {
      status: "closed",
      close_price: input.closePrice,
      close_date: input.closeDate,
      closed_at: closedAt,
    };
    if (input.notes !== undefined) payload.notes = input.notes;
    const updateQuery = supabase
      .from("positions")
      .update(payload)
      .eq("id", id)
      .eq("firm_id", user.firmId)
      .eq("status", "open");
    const { data, error } = await (
      user.role === "admin" ? updateQuery : updateQuery.eq("created_by", user.id)
    )
      .select(POSITION_SELECT)
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Unable to close the position.");
    }
    return { remaining: null, closed: mapPositionRow(data as DbRow) };
  }

  const { data: closedRow, error: insertError } = await supabase
    .from("positions")
    .insert({
      firm_id: current.firmId,
      ticker: current.ticker,
      asset_type: current.assetType,
      side: current.side,
      quantity: result.closed.quantity,
      multiplier: current.multiplier,
      entry_price: current.entryPrice,
      entry_date: current.entryDate,
      currency: current.currency,
      strategy: current.strategy,
      notes: result.closed.notes,
      status: "closed",
      close_price: input.closePrice,
      close_date: input.closeDate,
      closed_at: closedAt,
      created_by: current.createdBy,
      book_id: current.bookId,
      created_at: current.createdAt,
    })
    .select(POSITION_SELECT)
    .single();
  if (insertError || !closedRow) {
    throw new Error(insertError?.message ?? "Unable to record the closed lot.");
  }

  try {
    const remainingQuery = supabase
      .from("positions")
      .update({ quantity: result.remaining!.quantity })
      .eq("id", id)
      .eq("firm_id", user.firmId)
      .eq("status", "open");
    const { data: remainingRow, error: remainingError } = await (
      user.role === "admin"
        ? remainingQuery
        : remainingQuery.eq("created_by", user.id)
    )
      .select(POSITION_SELECT)
      .single();
    if (remainingError || !remainingRow) {
      throw new Error(
        remainingError?.message ?? "Unable to reduce the remaining sleeve.",
      );
    }
    return {
      remaining: mapPositionRow(remainingRow as DbRow),
      closed: mapPositionRow(closedRow as DbRow),
    };
  } catch (error) {
    await supabase
      .from("positions")
      .delete()
      .eq("id", (closedRow as DbRow).id)
      .eq("firm_id", user.firmId);
    throw error;
  }
}

export async function loadOpenPositionTickers(): Promise<string[]> {
  if (fixturesEnabled()) {
    return [
      ...new Set(
        fixturePositions
          .filter((row) => row.status === "open")
          .map((row) => row.ticker),
      ),
    ];
  }
  if (!canCreateAdminClient()) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("positions")
      .select("ticker")
      .eq("status", "open");
    if (error || !data) return [];
    return [
      ...new Set(
        data
          .map((row) =>
            String((row as { ticker?: string }).ticker ?? "").toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

export async function getStoredAccountValue(
  user: SessionUser,
  bookId: string,
): Promise<number | null> {
  const persistence = resolvePersistenceMode(user);
  if (persistence === "fixtures") {
    const { fixtureAccountValue } = await import("@/lib/fixtures/positions");
    return fixtureAccountValue(bookId);
  }
  if (persistence !== "supabase" || !user.firmId) return null;
  if (!bookId) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("position_books")
      .select("account_value")
      .eq("firm_id", user.firmId)
      .eq("id", bookId)
      .maybeSingle();
    if (error || !data) return null;
    const value = asNumber(
      (data as { account_value: number | string | null }).account_value,
    );
    return value != null && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function upsertStoredAccountValue(
  user: SessionUser,
  bookId: string,
  accountValue: number | null,
): Promise<number | null> {
  if (!user.firmId) throw new Error("No firm is associated with this session.");
  const current = await loadStoredBook(user, bookId);
  if (!canEditPositionBook(user, current.ownerId)) {
    throw new Error("You can only edit account value on your own book.");
  }
  if (current.source === "snaptrade") {
    throw new BrokerageError(
      "Account value for this book comes from the brokerage.",
      400,
    );
  }
  const normalized =
    accountValue == null || !Number.isFinite(accountValue) || accountValue <= 0
      ? null
      : Math.round(accountValue * 100) / 100;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_books")
    .update({ account_value: normalized })
    .eq("id", bookId)
    .eq("firm_id", user.firmId)
    .select("account_value")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save account value.");
  }
  const value = asNumber(
    (data as { account_value: number | string | null }).account_value,
  );
  return value != null && value > 0 ? value : null;
}
