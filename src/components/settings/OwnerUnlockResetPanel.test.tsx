/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: mocks.refresh }),
}));

import { OwnerUnlockResetPanel } from "./OwnerUnlockResetPanel";

describe("OwnerUnlockResetPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mocks.refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows unavailable copy instead of a claimed zero when inventory is missing", () => {
    render(
      <OwnerUnlockResetPanel
        isAdmin={false}
        demo
        unlockInventoryAvailable={false}
        unlockedGrantCount={0}
        unlockTtlHours={8}
      />,
    );

    expect(
      screen.getByText(
        "Unlock grant inventory is unavailable in this environment",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/This browser holds 0 teammate unlock grant\(s\)/),
    ).toBeNull();
  });

  it("zeros the grant count only when a demo self reset succeeds and inventory is available", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, demo: true, scope: "self" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <OwnerUnlockResetPanel
        isAdmin={false}
        demo
        unlockInventoryAvailable
        unlockedGrantCount={2}
        unlockTtlHours={8}
      />,
    );

    expect(
      screen.getByText("This browser holds 2 teammate unlock grant(s)"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lock my book" }));

    await waitFor(() =>
      expect(
        screen.getByText("This browser holds 0 teammate unlock grant(s)"),
      ).toBeTruthy(),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Demo session only");
  });

  it("does not force the grant count to 0 after a live self reset", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, demo: false, scope: "self" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <OwnerUnlockResetPanel
        isAdmin={false}
        demo={false}
        unlockInventoryAvailable
        unlockedGrantCount={2}
        unlockTtlHours={8}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lock my book" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText("This browser holds 2 teammate unlock grant(s)"),
    ).toBeTruthy();
  });

  it("renders HTTP error strings in role=alert and posts scope self once while pending", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(
      <OwnerUnlockResetPanel
        isAdmin={false}
        demo
        unlockInventoryAvailable={false}
        unlockedGrantCount={0}
        unlockTtlHours={8}
      />,
    );

    const lock = screen.getByRole("button", { name: "Lock my book" });
    fireEvent.click(lock);
    fireEvent.click(lock);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ scope: "self" }),
    });
    expect(lock).toHaveAttribute("aria-busy", "true");
    expect(lock).toHaveTextContent("Locking...");

    resolveFetch!(
      new Response(JSON.stringify({ error: "Unlock reset failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Unlock reset failed"),
    );
  });

  it("does not POST desk reset until Confirm reset is activated", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, demo: true, scope: "desk" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <OwnerUnlockResetPanel
        isAdmin
        demo
        unlockInventoryAvailable={false}
        unlockedGrantCount={0}
        unlockTtlHours={8}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset all unlocks" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ scope: "desk" }),
    });
  });
});
