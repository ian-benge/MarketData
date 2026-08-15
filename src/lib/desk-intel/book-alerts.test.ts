import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return { ...actual, fixturesEnabled: () => false };
});
import { compileBookRisk } from "./compile";
import { sampleEvidencePack } from "./scenario";
import {
  alertSubjectFor,
  buildBookAlertMessage,
  notifyUnexplainedBookMoves,
  unexplainedBookItems,
} from "./book-alerts";

describe("unexplained book alerts", () => {
  it("builds a tape alert without inventing a catalyst or P&L", () => {
    const message = buildBookAlertMessage({
      ticker: "SURG",
      changePercent: 5.83,
      note: "SURG is in the book and +5.83% with no verified catalyst · long.",
      appUrl: "http://localhost:3000",
    });
    expect(message.subject).toMatch(/SURG/);
    expect(message.subject).toMatch(/5\.83/);
    expect(message.html).toMatch(/unknown stays unknown/i);
    expect(message.html).not.toMatch(/\$/);
    expect(message.text).toMatch(/why%20is%20SURG%20moving%20today/);
  });

  it("pages a new unexplained book name once per day", async () => {
    const pack = {
      ...sampleEvidencePack(),
      inBookTickers: ["IREN", "XYZ"],
      moves: sampleEvidencePack().moves.map((move) =>
        move.ticker === "XYZ" ? { ...move, inBook: true } : move,
      ),
    };
    const risk = compileBookRisk(pack);
    expect(unexplainedBookItems(risk).some((row) => row.ticker === "XYZ")).toBe(
      true,
    );

    const sentKeys: string[] = [];
    const first = await notifyUnexplainedBookMoves({
      firmId: "a0000000-0000-4000-8000-000000000001",
      pack,
      risk,
      deps: {
        now: new Date("2026-08-15T18:00:00.000Z"),
        appUrl: "http://localhost:3000",
        loadRecipients: async () => [
          { userId: "u1", email: "desk@example.com", name: "Desk" },
        ],
        send: async () => ({
          ok: true,
          providerName: "test",
          messageIds: ["m1"],
          attempted: 1,
          succeeded: 1,
          failed: 0,
          errors: [],
        }),
        alreadySent: async (subject) => sentKeys.includes(subject),
        markSent: async (envelope) => {
          sentKeys.push(envelope.subject);
        },
      },
    });
    expect(first.sent).toContain("XYZ");

    const second = await notifyUnexplainedBookMoves({
      firmId: "a0000000-0000-4000-8000-000000000001",
      pack,
      risk,
      deps: {
        now: new Date("2026-08-15T18:10:00.000Z"),
        appUrl: "http://localhost:3000",
        loadRecipients: async () => [
          { userId: "u1", email: "desk@example.com", name: "Desk" },
        ],
        send: async () => {
          throw new Error("should not send twice");
        },
        alreadySent: async (subject) => sentKeys.includes(subject),
        markSent: async (envelope) => {
          sentKeys.push(envelope.subject);
        },
      },
    });
    expect(second.sent).toEqual([]);
    expect(second.skipped.some((row) => row.startsWith("XYZ:already"))).toBe(true);
    expect(sentKeys).toEqual([alertSubjectFor("XYZ", new Date("2026-08-15T18:00:00.000Z"))]);
  });
});
