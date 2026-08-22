/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/scanner",
  useSearchParams: () => new URLSearchParams("system=momentum&preset=open"),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { ScannerWorkspace } from "@/components/scanner/ScannerWorkspace";
import { fixtureScannerSnapshot } from "@/lib/scanner/fixtures";
import { SCANNER_STRATEGIES } from "@/lib/scanner/strategies";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/scanner/types";

function payload() {
  const snapshot = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z"));
  return {
    snapshot,
    user: {
      pins: [],
      mutes: [],
      settings: DEFAULT_ALERT_SETTINGS,
      presets: [],
    },
    catalog: SCANNER_STRATEGIES.filter((item) => item.system === "momentum").map((item) => ({
      id: item.id,
      title: item.title,
      shortTitle: item.shortTitle,
      description: item.description,
      kind: item.kind,
      system: item.system,
    })),
    pollSeconds: 20,
  };
}

describe("ScannerWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    replace.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/scanner?")) {
          return new Response(JSON.stringify(payload()), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "not mocked" }), { status: 404 });
      }),
    );
  });

  it("renders a ranked workbench with glance stats, tape, and event detail", async () => {
    render(
      <ScannerWorkspace
        initialSystem="momentum"
        initialTicker="ABCD"
        initialPreset="open"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Scanner Center" })).toBeInTheDocument();
    });
    expect(screen.getByText(/mock · not live/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ross · warrior trading/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /desk intelligence/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select ABCD" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ABCD · event detail/i })).toBeInTheDocument();
    expect(screen.getAllByText(/FDA clearance|Confirmed catalyst/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Scanner strategies" })).toBeInTheDocument();
    const tapeItems = screen.getAllByRole("listitem");
    expect(tapeItems.length).toBeGreaterThan(8);
  });

  it("switches the desk system from the segmented control", async () => {
    render(
      <ScannerWorkspace
        initialSystem="momentum"
        initialTicker="ABCD"
        initialPreset="open"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /desk intelligence/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /desk intelligence/i }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    const last = replace.mock.calls.at(-1)?.[0] as string;
    expect(last).toMatch(/system=desk/);
  });
});
