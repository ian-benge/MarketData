import { describe, expect, it } from "vitest";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "./fetch-all";

describe("fetchAllRows", () => {
  it("walks inclusive ranges until a short page", async () => {
    const ranges: Array<[number, number]> = [];
    const rows = await fetchAllRows(async (from, to) => {
      ranges.push([from, to]);
      if (from === 0) return Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => i);
      if (from === SUPABASE_PAGE_SIZE) {
        return Array.from({ length: 96 }, (_, i) => i + SUPABASE_PAGE_SIZE);
      }
      return [];
    });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(rows).toHaveLength(1096);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(1095);
  });

  it("returns an empty list when the first page is empty", async () => {
    const rows = await fetchAllRows(async () => []);
    expect(rows).toEqual([]);
  });
});
