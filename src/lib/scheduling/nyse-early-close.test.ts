import { describe, expect, it } from "vitest";
import { isNyseEarlyCloseDay } from "@/lib/scheduling/nyse-early-close";

describe("nyse early close", () => {
  it("treats the day after Thanksgiving 2026 as early close", () => {
    expect(isNyseEarlyCloseDay("2026-11-27")).toBe(true);
    expect(isNyseEarlyCloseDay("2026-08-10")).toBe(false);
  });

  it("honors overrides", () => {
    expect(
      isNyseEarlyCloseDay("2026-08-10", { extraEarlyCloses: ["2026-08-10"] }),
    ).toBe(true);
    expect(
      isNyseEarlyCloseDay("2026-11-27", { forceOpen: ["2026-11-27"] }),
    ).toBe(false);
  });
});
