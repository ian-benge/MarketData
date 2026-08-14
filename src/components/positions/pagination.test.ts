import { describe, expect, it } from "vitest";
import { pageWindow, paginate } from "./pagination";

describe("pageWindow", () => {
  it("lists every page when the range is short", () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps 1 2 3 4 and the last page on the first screen", () => {
    expect(pageWindow(1, 109)).toEqual([1, 2, 3, 4, "ellipsis", 109]);
  });

  it("windows around the current page", () => {
    expect(pageWindow(12, 40)).toEqual([
      1,
      "ellipsis",
      11,
      12,
      13,
      "ellipsis",
      40,
    ]);
  });
});

describe("paginate", () => {
  it("slices the current page and reports the visible range", () => {
    const rows = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(paginate(rows, 1, 10)).toMatchObject({
      currentPage: 1,
      pageCount: 3,
      rangeStart: 1,
      rangeEnd: 10,
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(paginate(rows, 3, 10)).toMatchObject({
      currentPage: 3,
      rangeStart: 21,
      rangeEnd: 23,
      items: [21, 22, 23],
    });
  });
});
