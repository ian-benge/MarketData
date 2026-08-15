/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));

import { NewsWorkspace } from "@/components/news/NewsWorkspace";

describe("NewsWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

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
        if (url.includes("/api/intel/")) {
          return new Response(
            JSON.stringify({
              kind: "news_digest",
              method: "rules",
              data: { headline: "Test digest", bullets: [], clusters: [], unresolvedQuestions: [] },
              sources: [],
              warnings: [],
              cached: false,
              generatedAt: "2026-08-15T20:00:00.000Z",
              evidenceHash: "test",
              promptVersion: "test",
              model: null,
              providerName: null,
              subject: "digest",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
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

  it("pins catalog tickers and sends them on the news search request", async () => {
    render(<NewsWorkspace initialTicker="NVDA,META" />);
    await waitFor(() => {
      expect(screen.getByLabelText("Remove NVDA ticker filter")).toBeTruthy();
      expect(screen.getByLabelText("Remove META ticker filter")).toBeTruthy();
    });
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
      expect(
        calls.some((url) => /ticker=NVDA%2CMETA|ticker=NVDA,META/.test(url)),
      ).toBe(true);
    });
    expect(screen.getByLabelText("Filter by ticker")).toBeTruthy();
  });

  it("states that ticker search is querying news providers", async () => {
    let release!: (value: Response) => void;
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/news/saved") || url.includes("/api/intel/")) {
          return new Response(JSON.stringify({ searches: [], persistence: "unavailable" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return held;
      }),
    );
    render(<NewsWorkspace initialTicker="NVDA" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Searching news providers for NVDA/i),
      ).toBeTruthy();
    });
    expect(
      screen.getByText(/live provider query, not a generated summary/i),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(
      /Searching news providers for NVDA/i,
    );
    release(
      new Response(
        JSON.stringify({
          query: "",
          parsed: {
            raw: "",
            intent: "search",
            textTerms: [],
            tickers: ["NVDA"],
            eventTypes: [],
            themes: [],
            sources: [],
            timeRange: null,
            materialOnly: false,
            whyTicker: null,
          },
          events: [],
          moves: [],
          gaps: [],
          sources: [],
          coverageTickers: [],
          fetchedAt: "2026-08-15T18:00:00.000Z",
          stale: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
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
