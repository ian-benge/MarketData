/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeadlineFeed } from "@/components/dashboard/HeadlineFeed";

describe("HeadlineFeed", () => {
  it("shows an empty state with a search link when no headlines exist", () => {
    render(<HeadlineFeed headlines={[]} events={[]} gaps={[]} />);
    expect(screen.getByText(/No material headlines are available/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open headline search/i }).getAttribute("href")).toBe(
      "/news",
    );
  });

  it("surfaces coverage gaps instead of hiding missing sources", () => {
    render(
      <HeadlineFeed
        headlines={[]}
        events={[]}
        gaps={[
          {
            code: "finnhub_unkeyed",
            message: "Finnhub is not keyed. Company-tagged headlines are limited.",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Finnhub is not keyed/)).toBeTruthy();
  });
});
