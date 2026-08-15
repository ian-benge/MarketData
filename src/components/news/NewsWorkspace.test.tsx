/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));

import { NewsWorkspace } from "@/components/news/NewsWorkspace";

describe("NewsWorkspace", () => {
  beforeEach(() => {
    replace.mockReset();
    push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/news/saved")) {
          return new Response(JSON.stringify({ searches: [], persistence: "unavailable" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            query: "",
            parsed: {
              raw: "",
              intent: "search",
              textTerms: [],
              tickers: [],
              eventTypes: [],
              themes: [],
              sources: [],
              timeRange: null,
              materialOnly: false,
              whyTicker: null,
            },
            events: [],
            moves: [],
            gaps: [
              {
                code: "no_headlines",
                message: "No headlines were retrieved from configured sources in this window.",
              },
            ],
            sources: [
              {
                id: "wire",
                label: "Finnhub general + RSS",
                status: "empty",
                note: "Provider returned no items in this window.",
                itemCount: 0,
              },
            ],
            coverageTickers: [],
            fetchedAt: "2026-08-15T18:00:00.000Z",
            stale: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  it("renders no-results and coverage-gap states from live search", async () => {
    render(<NewsWorkspace />);
    await waitFor(() => {
      expect(screen.getByText("No matching events")).toBeTruthy();
    });
    expect(
      screen.getByText(/No headlines were retrieved from configured sources/i),
    ).toBeTruthy();
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("shows a hard error when the intelligence service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/news/saved")) {
        return new Response(JSON.stringify({ searches: [], persistence: "unavailable" }), {
          status: 200,
        });
      }
      throw new Error("offline");
    }));
    render(<NewsWorkspace />);
    await waitFor(() => {
      expect(screen.getByText("Headline search unavailable")).toBeTruthy();
    });
  });
});
