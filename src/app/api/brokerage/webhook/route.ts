import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import {
  loadBrokerageJobUserBySnapTradeId,
  syncBrokerageHoldingsLive,
} from "@/lib/brokerage/jobs";
import {
  parseSnapTradeWebhook,
  SNAPTRADE_HOLDINGS_EVENTS,
  verifySnapTradeWebhookSignature,
  webhookEventIsFresh,
} from "@/lib/brokerage/webhook";

export const maxDuration = 60;

export async function GET() {
  return jsonOk({ ok: true });
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const consumerKey = env.SNAPTRADE_CONSUMER_KEY;
    if (!consumerKey) {
      return jsonError("Brokerage webhooks are not configured.", 503);
    }

    const rawBody = await request.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return jsonError("Invalid webhook payload.", 400);
    }

    const signature =
      request.headers.get("signature") ?? request.headers.get("Signature");
    if (
      !verifySnapTradeWebhookSignature({
        rawBody,
        payload,
        signature,
        consumerKey,
      })
    ) {
      return jsonError("Invalid webhook signature.", 401);
    }

    const event = parseSnapTradeWebhook(payload);
    if (!event) {
      console.info("[brokerage] webhook ignored", { reason: "malformed" });
      return jsonOk({ ok: true, ignored: "malformed" });
    }
    if (!webhookEventIsFresh(event.eventTimestamp)) {
      console.info("[brokerage] webhook ignored", {
        reason: "stale",
        eventType: event.eventType,
      });
      return jsonOk({ ok: true, ignored: "stale" });
    }
    if (!SNAPTRADE_HOLDINGS_EVENTS.has(event.eventType)) {
      console.info("[brokerage] webhook ignored", {
        reason: event.eventType,
        eventType: event.eventType,
      });
      return jsonOk({ ok: true, ignored: event.eventType });
    }
    if (!event.userId) {
      console.info("[brokerage] webhook ignored", {
        reason: "no-user",
        eventType: event.eventType,
      });
      return jsonOk({ ok: true, ignored: "no-user" });
    }

    const user = await loadBrokerageJobUserBySnapTradeId(event.userId);
    if (!user) {
      console.info("[brokerage] webhook ignored", {
        reason: "unknown-user",
        eventType: event.eventType,
        userId: event.userId,
      });
      return jsonOk({ ok: true, ignored: "unknown-user" });
    }

    const refresh = event.eventType !== "ACCOUNT_HOLDINGS_UPDATED";
    const result = await syncBrokerageHoldingsLive(user, { refresh });
    console.info("[brokerage] webhook", {
      eventType: event.eventType,
      userId: event.userId,
      imported: result.imported,
      updated: result.updated,
      closed: result.closed,
    });
    return jsonOk({
      ok: true,
      eventType: event.eventType,
      imported: result.imported,
      updated: result.updated,
      closed: result.closed,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
