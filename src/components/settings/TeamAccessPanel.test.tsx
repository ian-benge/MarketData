/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamAccessPanel } from "./TeamAccessPanel";

describe("TeamAccessPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a list-failure alert and not the empty desk copy", () => {
    render(
      <TeamAccessPanel
        initialMembers={[]}
        demo
        listError="Unable to list desk members."
      />,
    );

    expect(screen.getByRole("heading", { name: "Desk members" })).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to list desk members.",
    );
    expect(screen.queryByText("No members on this desk yet.")).toBeNull();
  });

  it("shows the empty desk copy when the list succeeds with no members", () => {
    render(<TeamAccessPanel initialMembers={[]} demo />);

    expect(screen.getByText("No members on this desk yet.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not fetch when confirm does not match and keeps password inputs masked", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamAccessPanel initialMembers={[]} demo />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@demo.local" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "desk-pass-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "desk-pass-2" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Add user" }).closest("form")!,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Passwords do not match",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

    vi.unstubAllGlobals();
  });
});
