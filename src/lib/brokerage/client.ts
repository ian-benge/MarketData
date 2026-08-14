import { Snaptrade, SnaptradeAuth, SnaptradeError } from "snaptrade-typescript-sdk";
import { getEnv } from "@/lib/env";
import { BrokerageError } from "./errors";
import { FEATURED_BROKERS, type SnapTradeUserCreds } from "./types";

export type SnapTradeConnection = {
  id: string;
  brokerageSlug: string;
  brokerageName: string;
  disabled: boolean;
};

export type SnapTradeAccount = {
  id: string;
  connectionId: string;
  name: string;
  number: string;
  institutionName: string;
  accountType: string | null;
  totalValue: number | null;
  holdingsReady: boolean;
  holdingsUnavailable: boolean;
  transactionsReady: boolean;
  firstTransactionDate: string | null;
};

function friendlySnapTradeError(error: unknown): BrokerageError {
  if (error instanceof BrokerageError) return error;
  const snap =
    error instanceof SnaptradeError
      ? error
      : error && typeof error === "object" && "status" in error
        ? (error as SnaptradeError)
        : null;
  const status = snap?.status ?? 502;
  const body = snap?.responseBody;
  const detail =
    body && typeof body === "object"
      ? String(
          (body as { detail?: unknown; message?: unknown }).detail ??
            (body as { message?: unknown }).message ??
            "",
        )
      : "";
  if (status === 401 || status === 403) {
    return new BrokerageError(
      "SnapTrade rejected this workspace’s API credentials.",
      502,
    );
  }
  if (status === 429) {
    return new BrokerageError(
      "SnapTrade is rate-limiting brokerage sync. Try again in a minute.",
      429,
    );
  }
  if (/already exists/i.test(detail)) {
    return new BrokerageError(
      "This user is already registered with SnapTrade, but the stored secret is missing.",
      409,
    );
  }
  return new BrokerageError(
    detail.trim() || "Unable to reach SnapTrade right now.",
    status >= 400 && status < 600 ? status : 502,
  );
}

export function isSnapTradeConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SNAPTRADE_CLIENT_ID && env.SNAPTRADE_CONSUMER_KEY);
}

export function createSnapTradeClient() {
  const env = getEnv();
  if (!env.SNAPTRADE_CLIENT_ID || !env.SNAPTRADE_CONSUMER_KEY) {
    throw new BrokerageError(
      "Brokerage linking is not configured on this workspace.",
      503,
    );
  }
  return new Snaptrade({
    auth: SnaptradeAuth.commercialApiKey({
      clientId: env.SNAPTRADE_CLIENT_ID,
      consumerKey: env.SNAPTRADE_CONSUMER_KEY,
    }),
  });
}

export async function registerSnapTradeUser(
  userId: string,
): Promise<SnapTradeUserCreds> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.authentication.registerSnapTradeUser({
      userId,
    });
    if (!data.userId || !data.userSecret) {
      throw new BrokerageError("SnapTrade did not return a user secret.", 502);
    }
    return { userId: data.userId, userSecret: data.userSecret };
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

export async function createConnectionPortalUrl(
  creds: SnapTradeUserCreds,
  options: {
    broker?: string | null;
    reconnect?: string | null;
    redirectUrl: string;
    darkMode?: boolean;
  },
): Promise<string> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.authentication.loginSnapTradeUser({
      userId: creds.userId,
      userSecret: creds.userSecret,
      connectionType: "read",
      immediateRedirect: true,
      customRedirect: options.redirectUrl,
      showCloseButton: true,
      darkMode: options.darkMode ?? true,
      connectionPortalVersion: "v4",
      ...(options.broker ? { broker: options.broker } : {}),
      ...(options.reconnect ? { reconnect: options.reconnect } : {}),
    });
    const redirect =
      data && typeof data === "object" && "redirectURI" in data
        ? String((data as { redirectURI?: string }).redirectURI ?? "")
        : "";
    if (!redirect) {
      throw new BrokerageError(
        "SnapTrade did not return a connection portal link.",
        502,
      );
    }
    return redirect;
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

function mapConnection(row: {
  id?: string;
  disabled?: boolean;
  brokerage?: { slug?: string; name?: string; display_name?: string };
}): SnapTradeConnection | null {
  if (!row.id) return null;
  const slug = row.brokerage?.slug ?? "UNKNOWN";
  const featured = FEATURED_BROKERS.find((broker) => broker.slug === slug);
  return {
    id: row.id,
    brokerageSlug: slug,
    brokerageName:
      featured?.name ??
      row.brokerage?.display_name ??
      row.brokerage?.name ??
      slug,
    disabled: row.disabled === true,
  };
}

export async function listSnapTradeConnections(
  creds: SnapTradeUserCreds,
): Promise<SnapTradeConnection[]> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.connections.listBrokerageAuthorizations({
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    return (data ?? [])
      .map(mapConnection)
      .filter((row): row is SnapTradeConnection => row != null);
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapAccount(
  row: {
    id: string;
    brokerage_authorization: string;
    name: string | null;
    number: string;
    institution_name: string;
    raw_type?: string | null;
    balance?: {
      total?: { amount?: number | string } | number | string | null;
      amount?: number | string;
    } | null;
    sync_status?: {
      holdings?: {
        initial_sync_completed?: boolean;
        last_successful_sync?: string | null;
        holdings_unavailable?: boolean;
      };
      transactions?: {
        initial_sync_completed?: boolean;
        last_successful_sync?: string | null;
        first_transaction_date?: string | null;
      };
    };
  },
  fallbackConnectionId?: string,
): SnapTradeAccount {
  const holdings = row.sync_status?.holdings;
  const transactions = row.sync_status?.transactions;
  const total =
    parseAmount(
      row.balance && typeof row.balance === "object" && "total" in row.balance
        ? typeof row.balance.total === "object" && row.balance.total
          ? row.balance.total.amount
          : row.balance.total
        : null,
    ) ?? parseAmount(row.balance?.amount);
  const initialDone = holdings?.initial_sync_completed;
  const txDone = transactions?.initial_sync_completed;
  const firstTx = transactions?.first_transaction_date;
  const firstTransactionDate =
    typeof firstTx === "string" && /^\d{4}-\d{2}-\d{2}/.test(firstTx)
      ? firstTx.slice(0, 10)
      : null;
  return {
    id: row.id,
    connectionId: row.brokerage_authorization || fallbackConnectionId || "",
    name: row.name ?? row.institution_name,
    number: row.number,
    institutionName: row.institution_name,
    accountType: row.raw_type ?? null,
    totalValue: total != null && Number.isFinite(total) && total >= 0 ? total : null,
    holdingsReady:
      initialDone === true ||
      Boolean(holdings?.last_successful_sync) ||
      initialDone == null,
    holdingsUnavailable: holdings?.holdings_unavailable === true,
    transactionsReady:
      txDone === true ||
      Boolean(transactions?.last_successful_sync) ||
      txDone == null,
    firstTransactionDate,
  };
}

function extractPositionRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const payload = data as Record<string, unknown>;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.positions)) return payload.positions;
  if (payload.data && payload.data !== data) return extractPositionRows(payload.data);
  return [];
}

export async function listSnapTradeAccountsForConnection(
  creds: SnapTradeUserCreds,
  authorizationId: string,
): Promise<SnapTradeAccount[]> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.connections.listBrokerageAuthorizationAccounts({
      authorizationId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    return (data ?? []).map((row) => mapAccount(row, authorizationId));
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

export async function listSnapTradeAccounts(
  creds: SnapTradeUserCreds,
): Promise<SnapTradeAccount[]> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.accountInformation.listUserAccounts({
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    return (data ?? []).map((row) => mapAccount(row));
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

export async function getSnapTradeAccountDetails(
  creds: SnapTradeUserCreds,
  accountId: string,
  fallbackConnectionId?: string,
): Promise<SnapTradeAccount> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.accountInformation.getUserAccountDetails({
      accountId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    return mapAccount(data, fallbackConnectionId);
  } catch (error) {
    throw friendlySnapTradeError(error);
  }
}

export async function listSnapTradePositions(
  creds: SnapTradeUserCreds,
  accountId: string,
): Promise<unknown[]> {
  const client = createSnapTradeClient();
  try {
    const unified = await client.accountInformation.getAllAccountPositions({
      accountId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    const fromUnified = extractPositionRows(unified.data);
    if (fromUnified.length) return fromUnified;
  } catch (error) {
    const mapped = friendlySnapTradeError(error);
    if (mapped.status === 503 || mapped.status === 429) {
      return [];
    }
    if (mapped.status !== 404 && mapped.status !== 410) {
      throw mapped;
    }
  }
  try {
    const holdings = await client.accountInformation.getUserHoldings({
      accountId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    return extractPositionRows(holdings.data);
  } catch (error) {
    const mapped = friendlySnapTradeError(error);
    if (mapped.status === 410 || mapped.status === 404 || mapped.status === 503) {
      return [];
    }
    throw mapped;
  }
}

export async function getSnapTradeAccountBalanceTotal(
  creds: SnapTradeUserCreds,
  accountId: string,
): Promise<number | null> {
  const client = createSnapTradeClient();
  try {
    const { data } = await client.accountInformation.getUserAccountBalance({
      accountId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
    const rows = Array.isArray(data) ? data : [];
    let total = 0;
    let found = false;
    for (const row of rows) {
      const record = row as {
        cash?: { amount?: number | string } | number | string;
        amount?: number | string;
        buying_power?: { amount?: number | string };
      };
      const amount =
        parseAmount(
          typeof record.cash === "object" && record.cash
            ? record.cash.amount
            : record.cash,
        ) ?? parseAmount(record.amount);
      if (amount != null) {
        total += amount;
        found = true;
      }
    }
    return found && Number.isFinite(total) && total >= 0 ? total : null;
  } catch {
    return null;
  }
}

export async function refreshSnapTradeHoldings(
  creds: SnapTradeUserCreds,
  authorizationId: string,
): Promise<void> {
  const client = createSnapTradeClient();
  try {
    await client.connections.refreshBrokerageAuthorization({
      authorizationId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
  } catch (error) {
    const mapped = friendlySnapTradeError(error);
    if (
      mapped.status === 400 ||
      mapped.status === 403 ||
      mapped.status === 404 ||
      mapped.status === 429
    ) {
      return;
    }
  }
}

function extractActivityRows(data: unknown): {
  rows: unknown[];
  total: number | null;
} {
  if (Array.isArray(data)) return { rows: data, total: null };
  if (!data || typeof data !== "object") return { rows: [], total: null };
  const payload = data as Record<string, unknown>;
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const pagination =
    payload.pagination && typeof payload.pagination === "object"
      ? (payload.pagination as { total?: number | string | null })
      : null;
  const total = parseAmount(pagination?.total);
  return { rows, total };
}

export async function listSnapTradeActivities(
  creds: SnapTradeUserCreds,
  accountId: string,
  options?: { startDate?: string | null },
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const client = createSnapTradeClient();
  const pageSize = 1000;
  const maxPages = 100;
  const rows: unknown[] = [];
  const startDate = options?.startDate?.trim() || undefined;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * pageSize;
      const { data } = await client.accountInformation.getAccountActivities({
        accountId,
        userId: creds.userId,
        userSecret: creds.userSecret,
        offset,
        limit: pageSize,
        type: "BUY,SELL,REI,FEE,TAX,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE",
        ...(startDate ? { startDate } : {}),
      });
      const extracted = extractActivityRows(data);
      rows.push(...extracted.rows);
      if (extracted.rows.length < pageSize) {
        return { rows, truncated: false };
      }
      if (extracted.total != null && rows.length >= extracted.total) {
        return { rows, truncated: false };
      }
    }
    return { rows, truncated: true };
  } catch (error) {
    const mapped = friendlySnapTradeError(error);
    if (mapped.status === 404 || mapped.status === 410 || mapped.status === 503) {
      return { rows, truncated: false };
    }
    throw mapped;
  }
}

export async function deleteSnapTradeConnection(
  creds: SnapTradeUserCreds,
  authorizationId: string,
): Promise<void> {
  const client = createSnapTradeClient();
  try {
    await client.connections.deleteConnection({
      connectionId: authorizationId,
      userId: creds.userId,
      userSecret: creds.userSecret,
    });
  } catch (error) {
    const mapped = friendlySnapTradeError(error);
    if (mapped.status === 404) return;
    throw mapped;
  }
}
