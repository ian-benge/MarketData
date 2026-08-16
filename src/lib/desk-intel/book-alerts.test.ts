import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return { ...actual, fixturesEnabled: () => false };
});
import { compileBookRisk } from "./compile";
import { sampleEvidencePack } from "./scenario";
import {
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

  it("does not send unexplained-book mail while only position alerts are live", async () => {
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

    const result = await notifyUnexplainedBookMoves({
      firmId: "a0000000-0000-4000-8000-000000000001",
      pack,
      risk,
      deps: {
        now: new Date("2026-08-15T18:00:00.000Z"),
        appUrl: "http://localhost:3000",
        loadRecipients: async () => [
          { userId: "u1", email: "desk@example.com", name: "Desk" },
        ],
        send: async () => {
          throw new Error("book alert mail should stay off");
        },
      },
    });
    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual(["disabled"]);
  });
});
