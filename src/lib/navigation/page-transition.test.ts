import { afterEach, describe, expect, it } from "vitest";
import {
  beginPageTransition,
  endPageTransition,
  isPageTransitionPending,
  shouldStartPageTransition,
  subscribePageTransition,
} from "./page-transition";

afterEach(() => {
  endPageTransition();
});

describe("shouldStartPageTransition", () => {
  it("starts when the path changes", () => {
    expect(
      shouldStartPageTransition(
        new URL("https://ibmarketdata.vercel.app/dashboard"),
        new URL("https://ibmarketdata.vercel.app/positions"),
      ),
    ).toBe(true);
  });

  it("starts when only the query changes", () => {
    expect(
      shouldStartPageTransition(
        new URL("https://ibmarketdata.vercel.app/dashboard"),
        new URL("https://ibmarketdata.vercel.app/dashboard?generate=1"),
      ),
    ).toBe(true);
  });

  it("ignores hash-only jumps on the same page", () => {
    expect(
      shouldStartPageTransition(
        new URL("https://ibmarketdata.vercel.app/positions"),
        new URL("https://ibmarketdata.vercel.app/positions#main-content"),
      ),
    ).toBe(false);
  });

  it("ignores trailing-slash equivalents", () => {
    expect(
      shouldStartPageTransition(
        new URL("https://ibmarketdata.vercel.app/news"),
        new URL("https://ibmarketdata.vercel.app/news/"),
      ),
    ).toBe(false);
  });

  it("ignores off-origin links", () => {
    expect(
      shouldStartPageTransition(
        new URL("https://ibmarketdata.vercel.app/dashboard"),
        new URL("https://example.com/dashboard"),
      ),
    ).toBe(false);
  });
});

describe("page transition store", () => {
  it("notifies subscribers when a navigation starts and ends", () => {
    const seen: boolean[] = [];
    const stop = subscribePageTransition((value) => {
      seen.push(value);
    });
    beginPageTransition();
    beginPageTransition();
    endPageTransition();
    stop();
    expect(isPageTransitionPending()).toBe(false);
    expect(seen).toEqual([false, true, false]);
  });
});
