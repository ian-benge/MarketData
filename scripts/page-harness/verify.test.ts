import { describe, expect, it } from "vitest";
import {
  classifyVerifyResults,
  extractDeclaredRoutes,
  extractVisitedRoutes,
  playwrightEnvForHarness,
  specCoversRoute,
  verifyHasInfrastructureFailure,
} from "./verify";

describe("verification routing", () => {
  it("detects that the accessibility spec does not cover /settings", () => {
    const spec = `
      for (const path of ["/dashboard", "/watchlists", "/positions"]) {
        await page.goto(path);
      }
    `;
    expect(specCoversRoute(spec, "/settings")).toBe(false);
    expect(specCoversRoute(spec, "/watchlists")).toBe(true);
  });

  it("extracts visited routes from Playwright timeout output", () => {
    const output = `navigating to "http://127.0.0.1:3200/watchlists", waiting until "load"`;
    expect(extractVisitedRoutes(output)).toContain("/watchlists");
    expect(extractVisitedRoutes(output)).not.toContain("/settings");
  });

  it("does not mark a target route visited from page/scope metadata alone", () => {
    const classified = classifyVerifyResults({
      requestedRoute: "/settings",
      results: [
        {
          name: "playwright-target",
          ok: true,
          output: "13 passed",
          scope: "target",
          page: "/settings",
          targetRouteVisited: false,
          visitedRoutes: [],
        },
      ],
    });
    expect(classified.target[0]?.targetRouteVisited).toBe(false);
    expect(classified.targetOk).toBe(false);
  });

  it("reads visited routes from executed spec manifests", () => {
    const spec = `
      await page.goto("/settings");
      await page.goto("/login");
    `;
    expect(extractDeclaredRoutes(spec)).toEqual(
      expect.arrayContaining(["/settings", "/login"]),
    );
    expect(specCoversRoute(spec, "/settings")).toBe(true);
  });

  it("keeps unrelated failures separate from target-page verification", () => {
    const classified = classifyVerifyResults({
      requestedRoute: "/settings",
      results: [
        {
          name: "target-route-inspect",
          ok: true,
          output: "authenticated local origin and route /settings",
          scope: "target",
          page: "/settings",
          targetRouteVisited: true,
          visitedRoutes: ["/settings"],
        },
        {
          name: "playwright-unrelated",
          ok: false,
          output: 'navigating to "http://127.0.0.1:3200/watchlists"',
          scope: "unrelated",
        },
        { name: "typecheck", ok: true, output: "", scope: "static" },
      ],
    });
    expect(classified.targetOk).toBe(true);
    expect(classified.unrelatedFailures).toHaveLength(1);
    expect(classified.staticChecks).toHaveLength(1);
  });

  it("classifies ECONNREFUSED as infrastructure and does not mark the target visited", () => {
    const classified = classifyVerifyResults({
      requestedRoute: "/scanner",
      results: [
        {
          name: "target-route-inspect",
          ok: true,
          output: "authenticated local origin and route /scanner",
          scope: "target",
          targetRouteVisited: true,
          visitedRoutes: ["/scanner"],
        },
        {
          name: "playwright-target",
          ok: false,
          output: "connect ECONNREFUSED 127.0.0.1:3200\nPOST http://127.0.0.1:3200/api/auth/demo",
          scope: "target",
          page: "/scanner",
        },
      ],
    });
    expect(classified.infrastructureFailed).toBe(true);
    expect(classified.targetOk).toBe(false);
    expect(
      verifyHasInfrastructureFailure(classified.target),
    ).toBe(true);
  });

  it("passes the harness-owned origin to Playwright as an external server", () => {
    const env = playwrightEnvForHarness("http://127.0.0.1:3200");
    expect(env.PLAYWRIGHT_EXTERNAL_SERVER).toBe("true");
    expect(env.PLAYWRIGHT_BASE_URL).toBe("http://127.0.0.1:3200");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://127.0.0.1:3200");
  });
});
