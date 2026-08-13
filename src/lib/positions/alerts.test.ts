import { describe, expect, it, vi } from "vitest";
import {
  actorDisplayName,
  buildPositionAlert,
  notifyPositionChange,
  shouldSendPositionAlert,
  uniqueRecipients,
  type PositionAlertInput,
} from "./alerts";
import type { PositionRecord } from "./types";
import type { TransactionalEmailRequest } from "@/lib/providers/types";

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return { ...actual, fixturesEnabled: () => false };
});

function lot(
  overrides: Partial<PositionRecord> = {},
): PositionRecord {
  return {
    id: "pos-1",
    firmId: "firm-1",
    ticker: "AAPL",
    assetType: "equity",
    side: "long",
    quantity: 100,
    multiplier: 1,
    entryPrice: 185.5,
    entryDate: "2026-08-01",
    currency: "USD",
    strategy: "core",
    notes: null,
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "user-ian",
    bookId: "book-main",
    createdAt: "2026-08-01T14:00:00.000Z",
    updatedAt: "2026-08-01T14:00:00.000Z",
    ...overrides,
  };
}

const actor = {
  id: "user-ian",
  email: "ian@example.com",
  displayName: "Ian Benge",
};

function openedAlert(
  overrides: Partial<PositionAlertInput> = {},
): PositionAlertInput {
  return {
    kind: "opened",
    actor,
    position: lot(),
    bookTitle: "Main",
    firmId: "firm-1",
    ...overrides,
  };
}

describe("position alerts", () => {
  it("names the actor when display name is missing", () => {
    expect(
      actorDisplayName({ id: "u", email: "desk@example.com", displayName: "  " }),
    ).toBe("desk@example.com");
  });

  it("dedupes recipients by email and drops blanks", () => {
    expect(
      uniqueRecipients([
        { userId: "a", email: "Ian@example.com", name: "Ian" },
        { userId: "b", email: "ian@example.com", name: "Dup" },
        { userId: "c", email: "mick@example.com", name: "Mick" },
        { userId: "d", email: "   " },
      ]),
    ).toEqual([
      { userId: "a", email: "ian@example.com", name: "Ian" },
      { userId: "c", email: "mick@example.com", name: "Mick" },
    ]);
  });

  it("builds an opened tape that includes every member context", () => {
    const message = buildPositionAlert(openedAlert(), {
      appUrl: "https://desk.example.com",
      recipients: [
        { userId: "user-ian", email: "ian@example.com", name: "Ian Benge" },
        { userId: "user-mick", email: "mick@example.com", name: "Michael Koval" },
      ],
    });

    expect(message.subject).toBe("IB Market Data — Opened LONG 100 AAPL");
    expect(message.html).toContain("Ian Benge opened a long equity in Main");
    expect(message.html).toContain("LONG 100 AAPL shares");
    expect(message.html).toContain("Open blotter");
    expect(message.html).toContain("https://desk.example.com/positions");
    expect(message.html).toContain("every active member");
    expect(message.text).toContain("Entry: 185.50 on Aug 1, 2026");
    expect(message.html).toContain("Cost basis");
    expect(message.html).toContain("$18,550.00");
    expect(message.html).not.toContain("Realized");
  });

  it("shows the owner when someone else closes their book", () => {
    const message = buildPositionAlert(
      openedAlert({
        kind: "closed",
        actor: {
          id: "user-ian",
          email: "ian@example.com",
          displayName: "Ian Benge",
        },
        bookTitle: "IRA",
        position: lot({
          status: "closed",
          createdBy: "user-mick",
          quantity: 50,
          closePrice: 190,
          closeDate: "2026-08-13",
          closedAt: "2026-08-13T15:00:00.000Z",
        }),
      }),
      {
        appUrl: "https://desk.example.com",
        recipients: [
          { userId: "user-mick", email: "mick@example.com", name: "Michael Koval" },
        ],
      },
    );

    expect(message.subject).toBe("IB Market Data — Closed LONG 50 AAPL");
    expect(message.html).toContain(
      "Ian Benge closed a long equity in Michael Koval / IRA",
    );
    expect(message.html).toContain("+$225.00");
    expect(message.html).toContain("#0f7b3a");
  });

  it("marks a partial close in the subject and copy", () => {
    const message = buildPositionAlert(
      openedAlert({
        kind: "closed",
        partial: true,
        position: lot({
          status: "closed",
          quantity: 40,
          closePrice: 180,
          closeDate: "2026-08-13",
        }),
      }),
      { appUrl: "https://desk.example.com" },
    );
    expect(message.subject).toContain("(partial)");
    expect(message.html).toContain("partially closed");
    expect(message.html).toContain("#b42318");
  });

  it("escapes notes so they cannot inject html", () => {
    const message = buildPositionAlert(
      openedAlert({
        position: lot({
          notes: `<img src=x onerror="alert(1)"> & more`,
        }),
      }),
      { appUrl: "https://desk.example.com" },
    );
    expect(message.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; more",
    );
    expect(message.html).not.toContain("<img");
  });

  it("skips demo users and missing email credentials", () => {
    expect(
      shouldSendPositionAlert(
        { isDemo: true, firmId: "firm-1" },
        { RESEND_API_KEY: "re_test", ALLOW_MOCK_PROVIDERS: false, NODE_ENV: "development" } as never,
      ),
    ).toBe("demo");
    expect(
      shouldSendPositionAlert(
        { isDemo: false, firmId: null },
        { RESEND_API_KEY: "re_test", NODE_ENV: "production" } as never,
      ),
    ).toBe("no-firm");
    expect(
      shouldSendPositionAlert(
        { isDemo: false, firmId: "firm-1" },
        { NODE_ENV: "production", ALLOW_MOCK_PROVIDERS: true } as never,
      ),
    ).toBe("email-unconfigured");
  });

  it("mails every unique member and does not throw when send fails", async () => {
    const send = vi.fn(async (request: TransactionalEmailRequest) => {
      expect(request.recipients).toHaveLength(2);
      throw new Error("resend down");
    });
    const result = await notifyPositionChange(openedAlert(), {
      emailConfigured: true,
      appUrl: "https://desk.example.com",
      loadRecipients: async () => [
        { userId: "user-ian", email: "ian@example.com", name: "Ian" },
        { userId: "user-mick", email: "mick@example.com", name: "Mick" },
        { userId: "user-ian", email: "IAN@example.com" },
      ],
      send,
    });
    expect(result.skipped).toBe("send-error");
    expect(send).toHaveBeenCalledOnce();

    const delivered = await notifyPositionChange(openedAlert(), {
      emailConfigured: true,
      appUrl: "https://desk.example.com",
      loadRecipients: async () => [
        { userId: "user-ian", email: "ian@example.com" },
        { userId: "user-mick", email: "mick@example.com" },
      ],
      send: async (request) => ({
        ok: true,
        providerName: "test",
        messageIds: ["1", "2"],
        attempted: request.recipients.length,
        succeeded: request.recipients.length,
        failed: 0,
        errors: [],
      }),
    });
    expect(delivered.delivery?.succeeded).toBe(2);
    expect(delivered.skipped).toBeUndefined();
  });

  it("skips when nobody can be mailed", async () => {
    const send = vi.fn();
    const result = await notifyPositionChange(openedAlert(), {
      emailConfigured: true,
      loadRecipients: async () => [],
      send,
    });
    expect(result.skipped).toBe("no-recipients");
    expect(send).not.toHaveBeenCalled();
  });
});
