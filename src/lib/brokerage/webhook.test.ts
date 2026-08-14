import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseSnapTradeWebhook,
  SNAPTRADE_HOLDINGS_EVENTS,
  verifySnapTradeWebhookSignature,
  webhookEventIsFresh,
} from "./webhook";

describe("SnapTrade webhook helpers", () => {
  it("accepts HMAC of canonical JSON using the consumer key", () => {
    const payload = {
      eventType: "TRADE_DETECTION",
      userId: "user-1",
      eventTimestamp: "2026-08-14T14:00:00.000Z",
      details: { orders: [] },
    };
    const body = canonicalJson(payload);
    const signature = createHmac("sha256", "secret-key")
      .update(body, "utf8")
      .digest("base64");
    expect(
      verifySnapTradeWebhookSignature({
        rawBody: JSON.stringify(payload),
        payload,
        signature,
        consumerKey: "secret-key",
      }),
    ).toBe(true);
    expect(
      verifySnapTradeWebhookSignature({
        rawBody: JSON.stringify(payload),
        payload,
        signature,
        consumerKey: "other",
      }),
    ).toBe(false);
  });

  it("parses holdings events and rejects stale timestamps", () => {
    const parsed = parseSnapTradeWebhook({
      eventType: "TRADE_DETECTION",
      userId: "abc",
      eventTimestamp: "2026-08-14T14:00:00+00:00",
      webhookId: "wh-1",
    });
    expect(parsed?.eventType).toBe("TRADE_DETECTION");
    expect(SNAPTRADE_HOLDINGS_EVENTS.has(parsed?.eventType ?? "")).toBe(true);
    expect(
      webhookEventIsFresh(
        "2026-08-14T14:00:00.000Z",
        new Date("2026-08-14T14:02:00.000Z"),
      ),
    ).toBe(true);
    expect(
      webhookEventIsFresh(
        "2026-08-14T14:00:00.000Z",
        new Date("2026-08-14T14:20:00.000Z"),
      ),
    ).toBe(false);
  });
});
