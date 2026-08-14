import type { SessionUser } from "@/lib/auth/session";
import type { PositionRecord } from "@/lib/positions/types";
import { chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BrokerageError } from "./errors";
import {
  brokerageBookTitle,
  maskAccountNumber,
} from "./normalize";
import type {
  BrokerageConnectionStatus,
  BrokerageConnectionView,
  BrokerageSnapshot,
  SnapTradeUserCreds,
  SyncedPositionRow,
} from "./types";
import {
  HISTORY_EXTERNAL_PREFIX,
  type ImportedClosedLot,
} from "./history";

type SnaptradeUserRow = {
  user_id: string;
  firm_id: string;
  snaptrade_user_id: string;
  user_secret: string;
};

type ConnectionRow = {
  id: string;
  user_id: string;
  firm_id: string;
  snaptrade_authorization_id: string;
  brokerage_slug: string;
  brokerage_name: string;
  status: BrokerageConnectionStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

type AccountRow = {
  id: string;
  connection_id: string;
  user_id: string;
  firm_id: string;
  snaptrade_account_id: string;
  name: string;
  number_masked: string | null;
  account_type: string | null;
  book_id: string | null;
  sync_enabled: boolean;
  cash_balance: number | string | null;
  last_sync_at: string | null;
};

export type StoredBrokerageConnection = {
  id: string;
  userId: string;
  firmId: string;
  snaptradeAuthorizationId: string;
  brokerageSlug: string;
  brokerageName: string;
  status: BrokerageConnectionStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type StoredBrokerageAccount = {
  id: string;
  connectionId: string;
  userId: string;
  snaptradeAccountId: string;
  name: string;
  numberMasked: string | null;
  accountType: string | null;
  bookId: string | null;
  lastSyncAt: string | null;
};

const CONNECTION_SELECT =
  "id, user_id, firm_id, snaptrade_authorization_id, brokerage_slug, brokerage_name, status, last_sync_at, last_sync_error";

const ACCOUNT_SELECT =
  "id, connection_id, user_id, firm_id, snaptrade_account_id, name, number_masked, account_type, book_id, sync_enabled, cash_balance, last_sync_at";

const ALERT_POSITION_SELECT =
  "id, firm_id, ticker, asset_type, side, quantity, multiplier, entry_price, entry_date, currency, strategy, notes, status, close_price, close_date, closed_at, created_by, book_id, source, brokerage_account_id, external_id, brokerage_name, fees, created_at, updated_at";

async function brokerageDb() {
  if (canCreateAdminClient()) return createAdminClient();
  return createClient();
}

function asFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapAlertPosition(row: Record<string, unknown>): PositionRecord {
  return {
    id: String(row.id),
    firmId: String(row.firm_id),
    ticker: String(row.ticker ?? "").toUpperCase(),
    assetType:
      row.asset_type === "etf" ||
      row.asset_type === "option" ||
      row.asset_type === "future" ||
      row.asset_type === "crypto" ||
      row.asset_type === "other"
        ? row.asset_type
        : "equity",
    side: row.side === "short" ? "short" : "long",
    quantity: asFinite(row.quantity) ?? 0,
    multiplier: asFinite(row.multiplier) ?? 1,
    entryPrice: asFinite(row.entry_price) ?? 0,
    entryDate: String(row.entry_date ?? "").slice(0, 10),
    currency: String(row.currency ?? "USD"),
    strategy: row.strategy ? String(row.strategy) : null,
    notes: row.notes ? String(row.notes) : null,
    status: row.status === "closed" ? "closed" : "open",
    closePrice: asFinite(row.close_price),
    closeDate: row.close_date ? String(row.close_date).slice(0, 10) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    bookId: row.book_id ? String(row.book_id) : null,
    source: row.source === "snaptrade" ? "snaptrade" : "manual",
    brokerageAccountId: row.brokerage_account_id
      ? String(row.brokerage_account_id)
      : null,
    externalId: row.external_id ? String(row.external_id) : null,
    brokerageName: row.brokerage_name ? String(row.brokerage_name) : null,
    fees: asFinite(row.fees) ?? 0,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapConnection(row: ConnectionRow): StoredBrokerageConnection {
  return {
    id: row.id,
    userId: row.user_id,
    firmId: row.firm_id,
    snaptradeAuthorizationId: row.snaptrade_authorization_id,
    brokerageSlug: row.brokerage_slug,
    brokerageName: row.brokerage_name,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
  };
}

function mapAccount(row: AccountRow): StoredBrokerageAccount {
  return {
    id: row.id,
    connectionId: row.connection_id,
    userId: row.user_id,
    snaptradeAccountId: row.snaptrade_account_id,
    name: row.name,
    numberMasked: row.number_masked,
    accountType: row.account_type,
    bookId: row.book_id,
    lastSyncAt: row.last_sync_at,
  };
}

export async function loadSnapTradeCreds(
  user: SessionUser,
): Promise<SnapTradeUserCreds | null> {
  if (!user.firmId) return null;
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("snaptrade_users")
    .select("snaptrade_user_id, user_secret")
    .eq("user_id", user.id)
    .eq("firm_id", user.firmId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<SnaptradeUserRow, "snaptrade_user_id" | "user_secret">;
  return { userId: row.snaptrade_user_id, userSecret: row.user_secret };
}

export async function saveSnapTradeCreds(
  user: SessionUser,
  creds: SnapTradeUserCreds,
): Promise<void> {
  if (!user.firmId) throw new BrokerageError("No firm is associated with this session.", 400);
  const supabase = await brokerageDb();
  const { error } = await supabase.from("snaptrade_users").upsert({
    user_id: user.id,
    firm_id: user.firmId,
    snaptrade_user_id: creds.userId,
    user_secret: creds.userSecret,
  });
  if (error) {
    throw new BrokerageError("Unable to store the SnapTrade user mapping.", 500);
  }
}

export async function listStoredConnections(
  user: SessionUser,
  ownerId = user.id,
): Promise<StoredBrokerageConnection[]> {
  if (!user.firmId) return [];
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("brokerage_connections")
    .select(CONNECTION_SELECT)
    .eq("firm_id", user.firmId)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as ConnectionRow[]).map(mapConnection);
}

export async function listStoredAccounts(
  user: SessionUser,
  ownerId = user.id,
): Promise<StoredBrokerageAccount[]> {
  if (!user.firmId) return [];
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("brokerage_accounts")
    .select(ACCOUNT_SELECT)
    .eq("firm_id", user.firmId)
    .eq("user_id", ownerId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return (data as AccountRow[]).map(mapAccount);
}

export async function loadStoredConnection(
  user: SessionUser,
  id: string,
): Promise<StoredBrokerageConnection> {
  if (!user.firmId) throw new BrokerageError("No firm is associated with this session.", 400);
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("brokerage_connections")
    .select(CONNECTION_SELECT)
    .eq("id", id)
    .eq("firm_id", user.firmId)
    .maybeSingle();
  if (error || !data) {
    throw new BrokerageError("Brokerage connection not found.", 404);
  }
  return mapConnection(data as ConnectionRow);
}

export function toBrokerageSnapshot(
  configured: boolean,
  connectable: boolean,
  connections: StoredBrokerageConnection[],
  accounts: StoredBrokerageAccount[],
): BrokerageSnapshot {
  const byConnection = new Map<string, StoredBrokerageAccount[]>();
  for (const account of accounts) {
    const list = byConnection.get(account.connectionId) ?? [];
    list.push(account);
    byConnection.set(account.connectionId, list);
  }
  const views: BrokerageConnectionView[] = connections.map((connection) => ({
    id: connection.id,
    brokerageSlug: connection.brokerageSlug,
    brokerageName: connection.brokerageName,
    status: connection.status,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
    accounts: (byConnection.get(connection.id) ?? []).map((account) => ({
      id: account.id,
      name: account.name,
      numberMasked: account.numberMasked,
      bookId: account.bookId,
      lastSyncAt: account.lastSyncAt,
    })),
  }));
  return { configured, connectable, connections: views };
}

export async function upsertStoredConnection(
  user: SessionUser,
  input: {
    snaptradeAuthorizationId: string;
    brokerageSlug: string;
    brokerageName: string;
    status: BrokerageConnectionStatus;
  },
): Promise<StoredBrokerageConnection> {
  if (!user.firmId) throw new BrokerageError("No firm is associated with this session.", 400);
  const supabase = await brokerageDb();
  const { data: existing } = await supabase
    .from("brokerage_connections")
    .select(CONNECTION_SELECT)
    .eq("firm_id", user.firmId)
    .eq("snaptrade_authorization_id", input.snaptradeAuthorizationId)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("brokerage_connections")
      .update({
        brokerage_slug: input.brokerageSlug,
        brokerage_name: input.brokerageName,
        status: input.status,
      })
      .eq("id", (existing as ConnectionRow).id)
      .eq("user_id", user.id)
      .select(CONNECTION_SELECT)
      .single();
    if (error || !data) {
      throw new BrokerageError("Unable to update the brokerage connection.", 500);
    }
    return mapConnection(data as ConnectionRow);
  }
  const { data, error } = await supabase
    .from("brokerage_connections")
    .insert({
      user_id: user.id,
      firm_id: user.firmId,
      snaptrade_authorization_id: input.snaptradeAuthorizationId,
      brokerage_slug: input.brokerageSlug,
      brokerage_name: input.brokerageName,
      status: input.status,
    })
    .select(CONNECTION_SELECT)
    .single();
  if (error || !data) {
    throw new BrokerageError("Unable to save the brokerage connection.", 500);
  }
  return mapConnection(data as ConnectionRow);
}

export async function markConnectionSync(
  user: SessionUser,
  connectionId: string,
  input: {
    error?: string | null;
    status?: BrokerageConnectionStatus;
    pending?: boolean;
  },
): Promise<void> {
  const supabase = await brokerageDb();
  await supabase
    .from("brokerage_connections")
    .update({
      ...(input.pending
        ? {}
        : { last_sync_at: new Date().toISOString() }),
      last_sync_error: input.pending
        ? (input.error ?? "Holdings are still importing from the brokerage.")
        : (input.error ?? null),
      ...(input.status ? { status: input.status } : {}),
    })
    .eq("id", connectionId)
    .eq("user_id", user.id);
}

async function ensureBrokerageBook(
  user: SessionUser,
  title: string,
): Promise<string> {
  if (!user.firmId) throw new BrokerageError("No firm is associated with this session.", 400);
  const supabase = await brokerageDb();
  const { data: existing } = await supabase
    .from("position_books")
    .select("id, title, sort_order")
    .eq("firm_id", user.firmId)
    .eq("owner_id", user.id);
  const match = (existing ?? []).find(
    (row) => String(row.title).toLowerCase() === title.toLowerCase(),
  );
  if (match?.id) return match.id as string;

  const sortOrder =
    Math.max(
      -1,
      ...(existing ?? []).map((row) => Number(row.sort_order) || 0),
    ) + 1;
  const { data, error } = await supabase
    .from("position_books")
    .insert({
      firm_id: user.firmId,
      owner_id: user.id,
      title,
      source: "snaptrade",
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (!error && data?.id) return data.id as string;
  if (error?.code === "23505") {
    const { data: retry } = await supabase
      .from("position_books")
      .select("id")
      .eq("firm_id", user.firmId)
      .eq("owner_id", user.id)
      .ilike("title", title)
      .maybeSingle();
    if (retry?.id) return retry.id as string;
  }
  throw new BrokerageError("Unable to create a book for the brokerage account.", 500);
}

export async function upsertStoredAccount(
  user: SessionUser,
  connection: StoredBrokerageConnection,
  input: {
    snaptradeAccountId: string;
    name: string;
    number: string;
    accountType: string | null;
    totalValue: number | null;
  },
): Promise<StoredBrokerageAccount> {
  if (!user.firmId) throw new BrokerageError("No firm is associated with this session.", 400);
  const supabase = await brokerageDb();
  const masked = maskAccountNumber(input.number);
  const { data: existing } = await supabase
    .from("brokerage_accounts")
    .select(ACCOUNT_SELECT)
    .eq("firm_id", user.firmId)
    .eq("snaptrade_account_id", input.snaptradeAccountId)
    .maybeSingle();

  let bookId = existing ? (existing as AccountRow).book_id : null;
  if (!bookId) {
    bookId = await ensureBrokerageBook(
      user,
      brokerageBookTitle(connection.brokerageName, input.name, masked),
    );
  }
  await supabase
    .from("position_books")
    .update({
      source: "snaptrade",
      ...(input.totalValue != null ? { account_value: input.totalValue } : {}),
    })
    .eq("id", bookId)
    .eq("owner_id", user.id);

  const payload = {
    connection_id: connection.id,
    user_id: user.id,
    firm_id: user.firmId,
    snaptrade_account_id: input.snaptradeAccountId,
    name: input.name,
    number_masked: masked,
    account_type: input.accountType,
    book_id: bookId,
    last_sync_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("brokerage_accounts")
      .update(payload)
      .eq("id", (existing as AccountRow).id)
      .select(ACCOUNT_SELECT)
      .single();
    if (error || !data) {
      throw new BrokerageError("Unable to update the brokerage account.", 500);
    }
    return mapAccount(data as AccountRow);
  }

  const { data, error } = await supabase
    .from("brokerage_accounts")
    .insert(payload)
    .select(ACCOUNT_SELECT)
    .single();
  if (error || !data) {
    throw new BrokerageError("Unable to save the brokerage account.", 500);
  }
  return mapAccount(data as AccountRow);
}

export async function listOpenSyncedPositions(
  user: SessionUser,
  brokerageAccountId: string,
): Promise<SyncedPositionRow[]> {
  if (!user.firmId) return [];
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("positions")
    .select("id, ticker, quantity, entry_price, entry_date, status, external_id, brokerage_account_id")
    .eq("firm_id", user.firmId)
    .eq("brokerage_account_id", brokerageAccountId)
    .eq("source", "snaptrade")
    .eq("status", "open");
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    ticker: String(row.ticker),
    quantity: Number(row.quantity),
    entryPrice: Number(row.entry_price),
    entryDate: String(row.entry_date).slice(0, 10),
    status: "open",
    externalId: row.external_id ? String(row.external_id) : null,
    brokerageAccountId: String(row.brokerage_account_id),
  }));
}

export async function listManualOpenKeys(
  user: SessionUser,
  bookId: string,
): Promise<Set<string>> {
  if (!user.firmId) return new Set();
  const supabase = await brokerageDb();
  const { data } = await supabase
    .from("positions")
    .select("ticker, side")
    .eq("firm_id", user.firmId)
    .eq("book_id", bookId)
    .eq("source", "manual")
    .eq("status", "open");
  const keys = new Set<string>();
  for (const row of data ?? []) {
    keys.add(
      `${String((row as { ticker: string }).ticker).toUpperCase()}:${(row as { side: string }).side}`,
    );
  }
  return keys;
}

export type UpsertSyncedResult = {
  inserted: boolean;
  position: PositionRecord;
};

export async function upsertSyncedPosition(
  user: SessionUser,
  account: StoredBrokerageAccount,
  connection: StoredBrokerageConnection,
  holding: {
    externalId: string;
    ticker: string;
    assetType: string;
    side: string;
    quantity: number;
    multiplier: number;
    entryPrice: number;
    currency: string;
  },
  existingId?: string,
): Promise<UpsertSyncedResult | null> {
  if (!user.firmId || !account.bookId) return null;
  const supabase = await brokerageDb();
  const payload = {
    ticker: holding.ticker,
    asset_type: holding.assetType,
    side: holding.side,
    quantity: holding.quantity,
    multiplier: holding.multiplier,
    entry_price: holding.entryPrice,
    currency: holding.currency,
    source: "snaptrade",
    brokerage_account_id: account.id,
    external_id: holding.externalId,
    brokerage_name: connection.brokerageName,
    book_id: account.bookId,
    created_by: user.id,
    status: "open",
  };
  if (existingId) {
    const { data, error } = await supabase
      .from("positions")
      .update({
        ticker: payload.ticker,
        asset_type: payload.asset_type,
        side: payload.side,
        quantity: payload.quantity,
        multiplier: payload.multiplier,
        entry_price: payload.entry_price,
        currency: payload.currency,
        brokerage_name: payload.brokerage_name,
      })
      .eq("id", existingId)
      .eq("firm_id", user.firmId)
      .eq("status", "open")
      .select(ALERT_POSITION_SELECT)
      .maybeSingle();
    if (error) {
      throw new BrokerageError("Unable to update a synced position.", 500);
    }
    return data
      ? { inserted: false, position: mapAlertPosition(data as Record<string, unknown>) }
      : null;
  }
  const { data, error } = await supabase
    .from("positions")
    .insert({
      ...payload,
      firm_id: user.firmId,
      entry_date: chicagoDateString(new Date()),
    })
    .select(ALERT_POSITION_SELECT)
    .single();
  if (error || !data) {
    throw new BrokerageError("Unable to import a synced position.", 500);
  }
  return {
    inserted: true,
    position: mapAlertPosition(data as Record<string, unknown>),
  };
}

export async function loadSyncedPositionRecord(
  user: SessionUser,
  positionId: string,
): Promise<PositionRecord | null> {
  if (!user.firmId) return null;
  const supabase = await brokerageDb();
  const { data, error } = await supabase
    .from("positions")
    .select(ALERT_POSITION_SELECT)
    .eq("id", positionId)
    .eq("firm_id", user.firmId)
    .maybeSingle();
  if (error || !data) return null;
  return mapAlertPosition(data as Record<string, unknown>);
}

export async function listConnectedBrokerageUserIds(): Promise<string[]> {
  if (!canCreateAdminClient()) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("brokerage_connections")
    .select("user_id")
    .eq("status", "connected");
  if (error || !data) return [];
  return [
    ...new Set(
      data
        .map((row) => String((row as { user_id?: string }).user_id ?? ""))
        .filter(Boolean),
    ),
  ];
}

export async function listImportedHistoryIds(
  user: SessionUser,
  brokerageAccountId: string,
): Promise<Map<string, string>> {
  if (!user.firmId) return new Map();
  const supabase = await brokerageDb();
  const data = await fetchAllRows(async (from, to) => {
    const { data: page, error } = await supabase
      .from("positions")
      .select("id, external_id")
      .eq("firm_id", user.firmId)
      .eq("brokerage_account_id", brokerageAccountId)
      .eq("source", "snaptrade")
      .like("external_id", `${HISTORY_EXTERNAL_PREFIX}%`)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return page ?? [];
  }).catch(() => []);
  const ids = new Map<string, string>();
  for (const row of data) {
    const externalId = (row as { external_id?: string | null }).external_id;
    const id = (row as { id?: string }).id;
    if (externalId && id) ids.set(externalId, id);
  }
  return ids;
}

export async function insertImportedClosedLot(
  user: SessionUser,
  account: StoredBrokerageAccount,
  connection: StoredBrokerageConnection,
  lot: ImportedClosedLot,
  existingId?: string,
): Promise<boolean> {
  if (!user.firmId || !account.bookId) return false;
  const supabase = await brokerageDb();
  const payload = {
    ticker: lot.ticker,
    asset_type: lot.assetType,
    side: lot.side,
    quantity: lot.quantity,
    multiplier: lot.multiplier,
    entry_price: lot.entryPrice,
    entry_date: lot.entryDate,
    currency: lot.currency,
    notes: `Imported from ${connection.brokerageName} history`,
    source: "snaptrade",
    brokerage_account_id: account.id,
    external_id: lot.externalId,
    brokerage_name: connection.brokerageName,
    book_id: account.bookId,
    status: "closed",
    close_price: lot.closePrice,
    close_date: lot.closeDate,
    closed_at: lot.closedAt,
    fees: lot.fees,
  };
  if (existingId) {
    const { error } = await supabase
      .from("positions")
      .update({
        quantity: payload.quantity,
        entry_price: payload.entry_price,
        close_price: payload.close_price,
        fees: payload.fees,
      })
      .eq("id", existingId)
      .eq("firm_id", user.firmId);
    if (error) {
      throw new BrokerageError("Unable to update an imported past trade.", 500);
    }
    return false;
  }
  const { error } = await supabase.from("positions").insert({
    ...payload,
    firm_id: user.firmId,
    created_by: user.id,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new BrokerageError("Unable to import a past trade.", 500);
}

export async function updateBookImportedFees(
  user: SessionUser,
  bookId: string,
  fees: number,
): Promise<void> {
  if (!user.firmId || !bookId) return;
  const supabase = await brokerageDb();
  await supabase
    .from("position_books")
    .update({ fees: fees > 0 ? fees : 0 })
    .eq("id", bookId)
    .eq("owner_id", user.id);
}

export async function closeSyncedPosition(
  user: SessionUser,
  position: SyncedPositionRow,
  closePrice: number,
): Promise<void> {
  if (!user.firmId) return;
  const supabase = await brokerageDb();
  const closeDate = chicagoDateString(new Date());
  const price = closePrice > 0 ? closePrice : position.entryPrice;
  const { error } = await supabase
    .from("positions")
    .update({
      status: "closed",
      close_price: price,
      close_date: closeDate,
      closed_at: new Date().toISOString(),
    })
    .eq("id", position.id)
    .eq("firm_id", user.firmId)
    .eq("status", "open");
  if (error) {
    throw new BrokerageError("Unable to close a departed brokerage holding.", 500);
  }
}

export async function deleteSyncedPosition(
  user: SessionUser,
  position: SyncedPositionRow,
): Promise<void> {
  if (!user.firmId) return;
  const supabase = await brokerageDb();
  const { error } = await supabase
    .from("positions")
    .delete()
    .eq("id", position.id)
    .eq("firm_id", user.firmId)
    .eq("source", "snaptrade")
    .eq("status", "open");
  if (error) {
    throw new BrokerageError("Unable to remove a departed brokerage holding.", 500);
  }
}

const DELETE_CHUNK = 100;

/** Drop holdings-sourced closed lots (not `hist:` FIFO fills). Those rows are
 *  placeholders closed at average cost when a SnapTrade holding disappeared. */
export async function deleteHoldingsSourcedClosedLots(
  user: SessionUser,
  brokerageAccountId: string,
  filter: {
    tickers?: string[];
    excludeTickers?: Iterable<string>;
  } = {},
): Promise<number> {
  if (!user.firmId) return 0;
  const tickerAllow =
    filter.tickers != null
      ? new Set(filter.tickers.map((ticker) => ticker.toUpperCase()))
      : null;
  if (tickerAllow && tickerAllow.size === 0) return 0;
  const tickerDeny = new Set(
    [...(filter.excludeTickers ?? [])].map((ticker) => ticker.toUpperCase()),
  );

  const supabase = await brokerageDb();
  const rows = await fetchAllRows(async (from, to) => {
    const { data: page, error } = await supabase
      .from("positions")
      .select("id, ticker, external_id")
      .eq("firm_id", user.firmId)
      .eq("brokerage_account_id", brokerageAccountId)
      .eq("source", "snaptrade")
      .eq("status", "closed")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return page ?? [];
  }).catch(() => []);

  const ids: string[] = [];
  for (const row of rows) {
    const externalId = (row as { external_id?: string | null }).external_id;
    if (externalId?.startsWith(HISTORY_EXTERNAL_PREFIX)) continue;
    const ticker = String((row as { ticker?: string }).ticker ?? "").toUpperCase();
    if (tickerAllow && !tickerAllow.has(ticker)) continue;
    if (tickerDeny.has(ticker)) continue;
    const id = (row as { id?: string }).id;
    if (id) ids.push(id);
  }
  if (!ids.length) return 0;

  let removed = 0;
  for (let index = 0; index < ids.length; index += DELETE_CHUNK) {
    const chunk = ids.slice(index, index + DELETE_CHUNK);
    const { error, count } = await supabase
      .from("positions")
      .delete({ count: "exact" })
      .in("id", chunk)
      .eq("firm_id", user.firmId)
      .eq("source", "snaptrade")
      .eq("status", "closed");
    if (error) {
      throw new BrokerageError(
        "Unable to replace averaged brokerage closes with fill history.",
        500,
      );
    }
    removed += count ?? chunk.length;
  }
  return removed;
}

export async function deleteStoredConnection(
  user: SessionUser,
  connection: StoredBrokerageConnection,
): Promise<void> {
  if (!user.firmId) return;
  const supabase = await brokerageDb();
  const accounts = (await listStoredAccounts(user, user.id)).filter(
    (account) => account.connectionId === connection.id,
  );
  for (const account of accounts) {
    const open = await listOpenSyncedPositions(user, account.id);
    for (const lot of open) {
      await closeSyncedPosition(user, lot, lot.entryPrice);
    }
    if (account.bookId) {
      await supabase
        .from("position_books")
        .update({ source: "manual" })
        .eq("id", account.bookId)
        .eq("owner_id", user.id);
    }
  }
  const { error } = await supabase
    .from("brokerage_connections")
    .delete()
    .eq("id", connection.id)
    .eq("user_id", user.id);
  if (error) {
    throw new BrokerageError("Unable to remove the brokerage connection.", 500);
  }
}

export async function loadPositionSource(
  user: SessionUser,
  positionId: string,
): Promise<"manual" | "snaptrade" | null> {
  if (!user.firmId) return null;
  const supabase = await brokerageDb();
  const { data } = await supabase
    .from("positions")
    .select("source")
    .eq("id", positionId)
    .eq("firm_id", user.firmId)
    .maybeSingle();
  const source = (data as { source?: string } | null)?.source;
  return source === "snaptrade" ? "snaptrade" : source === "manual" ? "manual" : null;
}

export async function bookIsBrokerageLinked(
  user: SessionUser,
  bookId: string,
): Promise<boolean> {
  if (!user.firmId || !bookId) return false;
  const supabase = await brokerageDb();
  const { data } = await supabase
    .from("brokerage_accounts")
    .select("id")
    .eq("firm_id", user.firmId)
    .eq("book_id", bookId)
    .maybeSingle();
  return Boolean(data);
}
