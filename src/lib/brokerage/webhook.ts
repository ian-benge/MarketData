import { createHmac, timingSafeEqual } from "node:crypto";

export const SNAPTRADE_HOLDINGS_EVENTS = new Set([
  "TRADE_DETECTION",
  "ACCOUNT_HOLDINGS_UPDATED",
  "CONNECTION_ADDED",
  "NEW_ACCOUNT_AVAILABLE",
  "CONNECTION_FIXED",
]);

export type SnapTradeWebhookEvent = {
  eventType: string;
  eventTimestamp: string | null;
  userId: string | null;
  webhookId: string | null;
  accountId: string | null;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function hmacB64(body: string, consumerKey: string): string {
  return createHmac("sha256", consumerKey).update(body, "utf8").digest("base64");
}

function signaturesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifySnapTradeWebhookSignature(input: {
  rawBody: string;
  payload: unknown;
  signature: string | null;
  consumerKey: string;
}): boolean {
  const signature = input.signature?.trim();
  if (!signature || !input.consumerKey) return false;
  const candidates = [
    hmacB64(input.rawBody, input.consumerKey),
    hmacB64(canonicalJson(input.payload), input.consumerKey),
  ];
  return candidates.some((expected) => signaturesMatch(expected, signature));
}

export function webhookEventIsFresh(
  eventTimestamp: string | null,
  now = new Date(),
  maxAgeSeconds = 600,
): boolean {
  if (!eventTimestamp) return false;
  const parsed = Date.parse(eventTimestamp);
  if (!Number.isFinite(parsed)) return false;
  const age = Math.abs(now.getTime() - parsed) / 1000;
  return age <= maxAgeSeconds;
}

export function parseSnapTradeWebhook(payload: unknown): SnapTradeWebhookEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const row = payload as Record<string, unknown>;
  const eventType = typeof row.eventType === "string" ? row.eventType.trim() : "";
  if (!eventType) return null;
  return {
    eventType,
    eventTimestamp:
      typeof row.eventTimestamp === "string" ? row.eventTimestamp : null,
    userId: typeof row.userId === "string" ? row.userId : null,
    webhookId: typeof row.webhookId === "string" ? row.webhookId : null,
    accountId: typeof row.accountId === "string" ? row.accountId : null,
  };
}
