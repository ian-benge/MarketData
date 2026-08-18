/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemePreferenceControl } from "./ThemePreferenceControl";

function stubMatchMedia(matches = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe("ThemePreferenceControl", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  beforeEach(() => {
    stubMatchMedia(false);
    window.localStorage.clear();
  });

  it("keeps a single tab stop and moves selection with arrow keys", () => {
    render(
      <ThemeProvider>
        <ThemePreferenceControl />
      </ThemeProvider>,
    );

    const dark = screen.getByRole("radio", { name: "Dark" });
    const light = screen.getByRole("radio", { name: "Light" });
    const system = screen.getByRole("radio", { name: "System" });

    expect(screen.getByRole("radiogroup", { name: "Theme preference" }));
    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(dark).toHaveAttribute("tabindex", "0");
    expect(light).toHaveAttribute("tabindex", "-1");
    expect(system).toHaveAttribute("tabindex", "-1");

    dark.focus();
    fireEvent.keyDown(dark, { key: "ArrowRight" });

    expect(light).toHaveAttribute("aria-checked", "true");
    expect(light).toHaveAttribute("tabindex", "0");
    expect(dark).toHaveAttribute("tabindex", "-1");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("ib-theme")).toBe("light");
    expect(screen.getByText(/Active · light/)).toBeTruthy();
  });
});
