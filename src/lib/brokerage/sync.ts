import type { SessionUser } from "@/lib/auth/session";
import { BrokerageError } from "./errors";
import {
  createConnectionPortalUrl,
  deleteSnapTradeConnection,
  getSnapTradeAccountBalanceTotal,
  getSnapTradeAccountDetails,
  isSnapTradeConfigured,
  listSnapTradeAccounts,
  listSnapTradeAccountsForConnection,
  listSnapTradeActivities,
  listSnapTradeConnections,
  listSnapTradePositions,
  refreshSnapTradeHoldings,
  registerSnapTradeUser,
  type SnapTradeAccount,
} from "./client";
import {
  historyLookbackStart,
  type HistoryLookback,
} from "./history-lookback";
import { matchClosedLots, normalizeSnapTradeActivities, residualActivityFees } from "./history";
import { normalizeSnapTradePositions } from "./normalize";
import { planSyncedBookChanges } from "./diff";
import {
  deleteStoredConnection,
  insertImportedClosedLot,
  listImportedHistoryIds,
  listManualOpenKeys,
  listOpenSyncedPositions,
  listStoredAccounts,
  listStoredConnections,
  loadSnapTradeCreds,
  loadStoredConnection,
  markConnectionSync,
  saveSnapTradeCreds,
  toBrokerageSnapshot,
  updateBookImportedFees,
  upsertStoredAccount,
  upsertStoredConnection,
  upsertSyncedPosition,
  deleteSyncedPosition,
  deleteHoldingsSourcedClosedLots,
  loadSyncedPositionRecord,
  type StoredBrokerageAccount,
  type StoredBrokerageConnection,
} from "./store";
import { EMPTY_BROKERAGE_SNAPSHOT, type BrokerageSnapshot } from "./types";
import { getEnv } from "@/lib/env";
import {
  preparePositionAlert,
  schedulePositionAlert,
} from "@/lib/positions/alerts";
import { chicagoDateString } from "@/lib/scheduling/chicago-schedule";

export type SyncResult = {
  pending: boolean;
  imported: number;
  updated: number;
  closed: number;
  skipped: number;
  historyImported: number;
  historyUpdated: number;
  warnings: string[];
};

export type HistoryImportResult = {
  pending: boolean;
  imported: number;
  skipped: number;
  unmatched: number;
  fills: number;
  fromDate: string | null;
  toDate: string | null;
  firstTransactionDate: string | null;
  updated: number;
  warnings: string[];
  lookback: HistoryLookback;
};

function emptySyncResult(warnings: string[] = []): SyncResult {
  return {
    pending: false,
    imported: 0,
    updated: 0,
    closed: 0,
    skipped: 0,
    historyImported: 0,
    historyUpdated: 0,
    warnings,
  };
}

function emptyHistoryResult(
  warnings: string[] = [],
  lookback: HistoryLookback = "all",
): HistoryImportResult {
  return {
    pending: false,
    imported: 0,
    skipped: 0,
    unmatched: 0,
    fills: 0,
    fromDate: null,
    toDate: null,
    firstTransactionDate: null,
    updated: 0,
    warnings,
    lookback,
  };
}

function minDate(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current || next < current) return next;
  return current;
}

function maxDate(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current || next > current) return next;
  return current;
}

async function ensureCreds(user: SessionUser) {
  const existing = await loadSnapTradeCreds(user);
  if (existing) return existing;
  const created = await registerSnapTradeUser(user.id);
  await saveSnapTradeCreds(user, created);
  return created;
}

export function connectionPortalRedirectUrl(): string {
  const base = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/positions?brokerage=return`;
}

export async function startBrokerageConnect(
  user: SessionUser,
  options: { broker?: string | null; reconnectId?: string | null },
): Promise<{ redirectUri: string }> {
  if (user.isDemo) {
    throw new BrokerageError(
      "Brokerage linking is available in a live workspace, not demo mode.",
      400,
    );
  }
  if (!isSnapTradeConfigured()) {
    throw new BrokerageError(
      "Brokerage linking is not configured on this workspace.",
      503,
    );
  }
  const creds = await ensureCreds(user);
  let reconnect: string | null = null;
  if (options.reconnectId) {
    const connection = await loadStoredConnection(user, options.reconnectId);
    if (connection.userId !== user.id) {
      throw new BrokerageError("You can only reconnect your own brokerage.", 403);
    }
    reconnect = connection.snaptradeAuthorizationId;
  }
  const redirectUri = await createConnectionPortalUrl(creds, {
    broker: options.broker,
    reconnect,
    redirectUrl: connectionPortalRedirectUrl(),
    darkMode: true,
  });
  return { redirectUri };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectRemoteAccounts(
  creds: Awaited<ReturnType<typeof ensureCreds>>,
  connections: { id: string }[],
): Promise<SnapTradeAccount[]> {
  const byId = new Map<string, SnapTradeAccount>();
  try {
    for (const row of await listSnapTradeAccounts(creds)) {
      byId.set(row.id, row);
    }
  } catch {
    /* daily list is a fallback; connection-scoped list is preferred */
  }
  for (const connection of connections) {
    try {
      const extra = await listSnapTradeAccountsForConnection(creds, connection.id);
      for (const account of extra) {
        byId.set(account.id, account);
      }
    } catch {
      /* listUserAccounts already covers most plans */
    }
  }
  const accounts = [...byId.values()];
  await Promise.all(
    accounts.map(async (account, index) => {
      try {
        accounts[index] = await getSnapTradeAccountDetails(
          creds,
          account.id,
          account.connectionId,
        );
      } catch {
        /* keep the list payload */
      }
    }),
  );
  return accounts;
}

function accountsStillImporting(accounts: SnapTradeAccount[]): boolean {
  if (!accounts.length) return true;
  return accounts.some(
    (account) => !account.holdingsUnavailable && !account.holdingsReady,
  );
}

async function syncAccountHoldings(
  user: SessionUser,
  creds: Awaited<ReturnType<typeof ensureCreds>>,
  connection: StoredBrokerageConnection,
  account: StoredBrokerageAccount,
  remote: SnapTradeAccount,
  notify: boolean,
): Promise<Omit<SyncResult, "pending" | "historyImported" | "historyUpdated">> {
  const warnings: string[] = [];
  if (!account.bookId) {
    return { imported: 0, updated: 0, closed: 0, skipped: 0, warnings: ["Account has no book."] };
  }
  if (remote.holdingsUnavailable) {
    warnings.push(`${account.name} does not expose holdings to SnapTrade.`);
    return { imported: 0, updated: 0, closed: 0, skipped: 0, warnings };
  }

  const raw = await listSnapTradePositions(creds, remote.id);
  const { holdings, skipped } = normalizeSnapTradePositions(raw);
  if (!remote.holdingsReady && holdings.length === 0) {
    warnings.push(
      `${account.name} is still importing holdings from Schwab (${raw.length} rows so far).`,
    );
    return { imported: 0, updated: 0, closed: 0, skipped: skipped.length, warnings };
  }
  const manualKeys = await listManualOpenKeys(user, account.bookId);
  const existing = await listOpenSyncedPositions(user, account.id);
  const existingByExternal = new Map(
    existing
      .filter((row) => row.externalId)
      .map((row) => [row.externalId as string, row]),
  );
  const plan = planSyncedBookChanges(existing, holdings, manualKeys);
  let imported = 0;
  let updated = 0;
  const skippedCount = skipped.length + plan.skipped.length;

  for (const holding of plan.skipped) {
    warnings.push(
      `Skipped ${holding.ticker} — a manual lot with the same side is already on this book.`,
    );
  }

  const qtyEps = 1e-8;
  for (const holding of plan.upserts) {
    const current = existingByExternal.get(holding.externalId);
    const result = await upsertSyncedPosition(
      user,
      account,
      connection,
      holding,
      current?.id,
    );
    if (current) updated += 1;
    else imported += 1;
    if (!notify || !result) continue;
    const qtyUp = current != null && holding.quantity > current.quantity + qtyEps;
    if (result.inserted || qtyUp) {
      schedulePositionAlert(
        preparePositionAlert(user, "opened", result.position, {
          bookTitle: account.name,
          fillQuantity:
            current != null && qtyUp
              ? holding.quantity - current.quantity
              : undefined,
        }),
      );
    }
  }

  let closed = 0;
  for (const lot of plan.closes) {
    const record = notify ? await loadSyncedPositionRecord(user, lot.id) : null;
    await deleteSyncedPosition(user, lot);
    closed += 1;
    if (record) {
      schedulePositionAlert(
        preparePositionAlert(
          user,
          "closed",
          {
            ...record,
            status: "closed",
            closePrice: null,
            closeDate: chicagoDateString(new Date()),
            closedAt: new Date().toISOString(),
          },
          { bookTitle: account.name },
        ),
      );
    }
  }

  await deleteHoldingsSourcedClosedLots(user, account.id, {
    excludeTickers: holdings.map((row) => row.ticker),
  });

  for (const skip of skipped) {
    if (skip.ticker) warnings.push(`${skip.ticker}: ${skip.reason}`);
  }

  return { imported, updated, closed, skipped: skippedCount, warnings };
}

export async function syncBrokerageHoldings(
  user: SessionUser,
  options?: {
    historyLookback?: HistoryLookback | false;
    live?: boolean;
    refresh?: boolean;
  },
): Promise<SyncResult> {
  if (user.isDemo) {
    throw new BrokerageError(
      "Brokerage sync is available in a live workspace, not demo mode.",
      400,
    );
  }
  if (!isSnapTradeConfigured()) {
    throw new BrokerageError(
      "Brokerage linking is not configured on this workspace.",
      503,
    );
  }
  const creds = await loadSnapTradeCreds(user);
  if (!creds) {
    return emptySyncResult();
  }

  const live = Boolean(options?.live);
  const refresh = Boolean(options?.refresh);
  const remoteConnections = await listSnapTradeConnections(creds);
  let remoteAccounts = await collectRemoteAccounts(creds, remoteConnections);
  if (!live) {
    for (let attempt = 0; attempt < 3 && accountsStillImporting(remoteAccounts); attempt += 1) {
      await sleep(2_000);
      remoteAccounts = await collectRemoteAccounts(creds, remoteConnections);
    }
  }
  const warnings: string[] = [];
  let imported = 0;
  let updated = 0;
  let closed = 0;
  let skipped = 0;
  let pending = false;

  const keptAuthIds = new Set(remoteConnections.map((row) => row.id));
  const localConnections = await listStoredConnections(user, user.id);
  for (const local of localConnections) {
    if (!keptAuthIds.has(local.snaptradeAuthorizationId)) {
      await deleteStoredConnection(user, local);
    }
  }

  for (const remote of remoteConnections) {
    const status = remote.disabled ? "reconnect_required" : "connected";
    const stored = await upsertStoredConnection(user, {
      snaptradeAuthorizationId: remote.id,
      brokerageSlug: remote.brokerageSlug,
      brokerageName: remote.brokerageName,
      status,
    });
    if (status !== "connected") {
      await markConnectionSync(user, stored.id, {
        status,
        error: "Reconnect required — the brokerage login expired.",
      });
      warnings.push(`${remote.brokerageName} needs to be reconnected.`);
      continue;
    }

    let accounts = remoteAccounts.filter((account) => account.connectionId === remote.id);
    try {
      if (
        refresh ||
        (!live && (accountsStillImporting(accounts) || accounts.length === 0))
      ) {
        await refreshSnapTradeHoldings(creds, remote.id);
        if (!live) {
          await sleep(2_500);
          remoteAccounts = await collectRemoteAccounts(creds, remoteConnections);
          accounts = remoteAccounts.filter((account) => account.connectionId === remote.id);
        }
      }
      let connectionPending = accounts.length === 0;
      for (const remoteAccount of accounts) {
        if (!remoteAccount.holdingsReady) pending = true;
        if (remoteAccount.totalValue == null) {
          const cash = await getSnapTradeAccountBalanceTotal(
            creds,
            remoteAccount.id,
          );
          if (cash != null) {
            console.info(
              JSON.stringify({
                msg: "brokerage_account_value_cash_fallback",
                accountId: remoteAccount.id,
                cash,
              }),
            );
            remoteAccount.totalValue = cash;
          }
        }
        const storedAccount = await upsertStoredAccount(user, stored, {
          snaptradeAccountId: remoteAccount.id,
          name: remoteAccount.name,
          number: remoteAccount.number,
          accountType: remoteAccount.accountType,
          totalValue: remoteAccount.totalValue,
        });
        const result = await syncAccountHoldings(
          user,
          creds,
          stored,
          storedAccount,
          remoteAccount,
          Boolean(stored.lastSyncAt),
        );
        imported += result.imported;
        updated += result.updated;
        closed += result.closed;
        skipped += result.skipped;
        warnings.push(...result.warnings);
        if (
          !remoteAccount.holdingsReady &&
          result.imported === 0 &&
          result.updated === 0
        ) {
          connectionPending = true;
          pending = true;
          warnings.push(
            `${remoteAccount.name} is still importing holdings from the brokerage.`,
          );
        } else if (
          result.imported === 0 &&
          result.updated === 0 &&
          remoteAccount.totalValue == null
        ) {
          remoteAccount.totalValue = 0;
          await upsertStoredAccount(user, stored, {
            snaptradeAccountId: remoteAccount.id,
            name: remoteAccount.name,
            number: remoteAccount.number,
            accountType: remoteAccount.accountType,
            totalValue: 0,
          });
        }
      }
      if (connectionPending) pending = true;
      await markConnectionSync(user, stored.id, {
        status: "connected",
        pending: connectionPending,
        error: connectionPending
          ? "Holdings are still importing from the brokerage."
          : null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Brokerage sync failed.";
      await markConnectionSync(user, stored.id, { error: message });
      warnings.push(message);
    }
  }

  const historyLookback =
    options?.historyLookback !== undefined
      ? options.historyLookback
      : live
        ? false
        : "1w";
  let historyImported = 0;
  let historyUpdated = 0;
  if (historyLookback) {
    try {
      const history = await importBrokerageHistory(user, historyLookback, {
        quiet: true,
      });
      historyImported = history.imported;
      historyUpdated = history.updated;
      pending = pending || history.pending;
      warnings.push(...history.warnings);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Past-trade import failed.";
      warnings.push(message);
    }
  }

  return {
    pending,
    imported,
    updated,
    closed,
    skipped,
    historyImported,
    historyUpdated,
    warnings: [...new Set(warnings)],
  };
}

export async function importBrokerageHistory(
  user: SessionUser,
  lookback: HistoryLookback = "all",
  options?: { quiet?: boolean },
): Promise<HistoryImportResult> {
  if (user.isDemo) {
    throw new BrokerageError(
      "Importing past trades is available in a live workspace, not demo mode.",
      400,
    );
  }
  if (!isSnapTradeConfigured()) {
    throw new BrokerageError(
      "Brokerage linking is not configured on this workspace.",
      503,
    );
  }
  const quiet = Boolean(options?.quiet);
  const creds = await loadSnapTradeCreds(user);
  if (!creds) {
    return emptyHistoryResult(
      quiet ? [] : ["Connect a brokerage before importing past trades."],
      lookback,
    );
  }

  const startDate = historyLookbackStart(lookback);
  const connections = await listStoredConnections(user, user.id);
  const accounts = await listStoredAccounts(user, user.id);
  const warnings: string[] = [];
  let pending = false;
  let imported = 0;
  let skipped = 0;
  let unmatched = 0;
  let fills = 0;
  let updated = 0;
  let fromDate: string | null = startDate;
  let toDate: string | null = null;
  let firstTransactionDate: string | null = null;

  for (const connection of connections) {
    if (connection.status !== "connected") {
      warnings.push(
        `${connection.brokerageName} needs to be reconnected before importing history.`,
      );
      continue;
    }
    const owned = accounts.filter((account) => account.connectionId === connection.id);
    for (const account of owned) {
      if (!account.bookId) {
        warnings.push(`${account.name} has no book.`);
        continue;
      }
      try {
        let transactionsReady = true;
        try {
          const details = await getSnapTradeAccountDetails(
            creds,
            account.snaptradeAccountId,
            connection.snaptradeAuthorizationId,
          );
          transactionsReady = details.transactionsReady;
          if (details.firstTransactionDate) {
            firstTransactionDate = minDate(
              firstTransactionDate,
              details.firstTransactionDate,
            );
          }
        } catch {
          /* activities fetch is the source of truth */
        }
        const activityPage = await listSnapTradeActivities(
          creds,
          account.snaptradeAccountId,
          { startDate },
        );
        if (activityPage.truncated) {
          warnings.push(
            `${account.name}: reached the 100,000-fill import cap. Re-run if older fills are still missing.`,
          );
        }
        const raw = activityPage.rows;
        const normalized = normalizeSnapTradeActivities(raw);
        const windowedFills = startDate
          ? normalized.fills.filter((fill) => fill.date >= startDate)
          : normalized.fills;
        fills += windowedFills.length;
        skipped += normalized.skipped.length;
        if (windowedFills.length) {
          fromDate = minDate(fromDate, windowedFills[0]?.date ?? null);
          toDate = maxDate(
            toDate,
            windowedFills[windowedFills.length - 1]?.date ?? null,
          );
        }
        if (windowedFills.length === 0) {
          if (lookback === "all") {
            await updateBookImportedFees(
              user,
              account.bookId,
              normalized.activityFees,
            );
          }
          if (!transactionsReady) {
            pending = true;
            if (!quiet) {
              warnings.push(
                `${account.name} is still importing trade history from the brokerage. SnapTrade refreshes this about once a day — try again later.`,
              );
            }
          } else if (!quiet) {
            warnings.push(
              startDate
                ? `No BUY/SELL fills in that window for ${account.name}.`
                : `No BUY/SELL fills found for ${account.name}.`,
            );
          }
          continue;
        }

        const matched = matchClosedLots(windowedFills);
        unmatched += matched.unmatched;
        const existing = await listImportedHistoryIds(user, account.id);
        for (const lot of matched.lots) {
          const existingId = existing.get(lot.externalId);
          const inserted = await insertImportedClosedLot(
            user,
            account,
            connection,
            lot,
            existingId,
          );
          if (inserted) {
            imported += 1;
            existing.set(lot.externalId, lot.externalId);
          } else if (existingId) {
            updated += 1;
          } else {
            skipped += 1;
          }
        }
        if (matched.lots.length > 0) {
          await deleteHoldingsSourcedClosedLots(user, account.id, {
            tickers: [...new Set(matched.lots.map((lot) => lot.ticker))],
          });
        }
        if (lookback === "all") {
          await updateBookImportedFees(
            user,
            account.bookId,
            residualActivityFees(normalized.activityFees, matched.lots),
          );
        }
        if (matched.unmatched > 0 && matched.lots.length === 0 && !quiet) {
          warnings.push(
            lookback === "all"
              ? `${account.name}: fills are still open inventory. Use Sync for current holdings; Import past trades only creates closed lots.`
              : `${account.name}: no closed lots in that window. Entries older than the lookback are not matched — use All history for those.`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Past-trade import failed.";
        warnings.push(`${account.name}: ${message}`);
      }
    }
  }

  return {
    pending,
    imported,
    skipped,
    unmatched,
    fills,
    fromDate,
    toDate,
    firstTransactionDate,
    updated,
    warnings: [...new Set(warnings)],
    lookback,
  };
}

export async function disconnectBrokerage(
  user: SessionUser,
  connectionId: string,
): Promise<void> {
  if (user.isDemo) {
    throw new BrokerageError("Demo books cannot disconnect a brokerage.", 400);
  }
  const connection = await loadStoredConnection(user, connectionId);
  if (connection.userId !== user.id) {
    throw new BrokerageError("You can only disconnect your own brokerage.", 403);
  }
  const creds = await loadSnapTradeCreds(user);
  if (creds) {
    await deleteSnapTradeConnection(creds, connection.snaptradeAuthorizationId);
  }
  await deleteStoredConnection(user, connection);
}

export async function loadBrokerageSnapshot(
  user: SessionUser,
  ownerId = user.id,
): Promise<BrokerageSnapshot> {
  const configured = isSnapTradeConfigured();
  const connectable =
    configured &&
    !user.isDemo &&
    ownerId === user.id &&
    Boolean(user.firmId);
  if (user.isDemo) {
    return { ...EMPTY_BROKERAGE_SNAPSHOT, configured: false, connectable: false };
  }
  try {
    const [connections, accounts] = await Promise.all([
      listStoredConnections(user, ownerId),
      listStoredAccounts(user, ownerId),
    ]);
    return toBrokerageSnapshot(configured, connectable, connections, accounts);
  } catch {
    return { ...EMPTY_BROKERAGE_SNAPSHOT, configured, connectable };
  }
}

export { FEATURED_BROKERS } from "./types";
