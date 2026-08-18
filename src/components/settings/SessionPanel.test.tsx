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
  replace: vi.fn(),
  canCreate: true,
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  canCreateBrowserClient: () => mocks.canCreate,
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
    },
  }),
}));

import { SessionPanel } from "./SessionPanel";

function renderSession(isDemo: boolean) {
  return render(
    <SessionPanel
      email="member@demo.local"
      role="member"
      isDemo={isDemo}
      timeZone="America/Chicago"
    />,
  );
}

describe("SessionPanel sign out", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.signOut.mockReset();
    mocks.canCreate = true;
    vi.stubGlobal("fetch", vi.fn());
  });

  it("demo DELETE /api/auth/demo replaces /login only after HTTP 2xx", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderSession(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/auth/demo", { method: "DELETE" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveFetch!(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/login"),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("demo non-2xx DELETE stays on settings with role=alert", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Demo sign-out failed" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    renderSession(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Demo sign-out failed"),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("live signOut replaces /login only when the result has no error", async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    renderSession(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/login"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("live missing browser client does not replace and shows role=alert", async () => {
    mocks.canCreate = false;

    renderSession(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /session is still active/i,
      ),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("live signOut { error } does not replace and shows role=alert", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "Auth failed" } });

    renderSession(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Auth failed"),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("live signOut reject does not replace and shows role=alert", async () => {
    mocks.signOut.mockRejectedValue(new Error("Network down"));

    renderSession(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Network down"),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
