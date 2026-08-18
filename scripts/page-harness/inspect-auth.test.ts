import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import {
  InspectAuthError,
  assertInspectedRoute,
  cookieListHasDemoRole,
  demoAuthBodyAccepted,
  establishDemoSession,
  pageLooksLikeErrorBoundary,
  pageLooksLikeLogin,
  setCookieHeaderHasDemoRole,
} from "./inspect-auth";

describe("demo auth and route verification", () => {
  it("accepts a successful demo-auth JSON body and cookie", () => {
    expect(demoAuthBodyAccepted({ ok: true, role: "member" }, "member")).toBe(true);
    expect(demoAuthBodyAccepted({ ok: true, role: "admin" }, "member")).toBe(false);
    expect(
      setCookieHeaderHasDemoRole("demo_role=member; Path=/; HttpOnly; SameSite=Lax", "member"),
    ).toBe(true);
    expect(
      cookieListHasDemoRole([{ name: "demo_role", value: "member" }], "member"),
    ).toBe(true);
  });

  it("rejects demo-auth failure bodies", () => {
    expect(demoAuthBodyAccepted({ error: "Demo auth disabled" }, "member")).toBe(false);
    expect(demoAuthBodyAccepted(null, "member")).toBe(false);
  });

  it("rejects a redirect to login as /settings evidence", () => {
    expect(() =>
      assertInspectedRoute({
        requestedRoute: "/settings",
        finalUrl: "http://127.0.0.1:3200/login?next=/settings",
        expectedOrigin: "http://127.0.0.1:3200",
        title: "Sign in · IB Market Data",
        bodyText: "The demo session could not be started. Check the local server and try again.",
        headings: ["h1: Sign in"],
      }),
    ).toThrow(InspectAuthError);
    expect(
      pageLooksLikeLogin({
        pathname: "/login",
        title: "Sign in",
        bodyText: "The demo session could not be started.",
        headings: ["h1: Sign in"],
      }),
    ).toBe(true);
  });

  it("rejects a route mismatch", () => {
    expect(() =>
      assertInspectedRoute({
        requestedRoute: "/settings",
        finalUrl: "http://127.0.0.1:3200/dashboard",
        expectedOrigin: "http://127.0.0.1:3200",
        title: "Market Overview",
        bodyText: "Market Overview",
        headings: ["h1: Market Overview"],
      }),
    ).toThrow(/finished at \/dashboard/);
  });

  it("rejects an error boundary", () => {
    expect(
      pageLooksLikeErrorBoundary({
        title: "Application error",
        bodyText: "Application error: a client-side exception has occurred",
      }),
    ).toBe(true);
    expect(() =>
      assertInspectedRoute({
        requestedRoute: "/settings",
        finalUrl: "http://127.0.0.1:3200/settings",
        expectedOrigin: "http://127.0.0.1:3200",
        title: "Application error",
        bodyText: "Application error: a client-side exception has occurred",
        headings: [],
      }),
    ).toThrow(/error boundary/);
  });

  it("accepts authenticated /settings on the harness origin", () => {
    const result = assertInspectedRoute({
      requestedRoute: "/settings",
      finalUrl: "http://127.0.0.1:3200/settings",
      expectedOrigin: "http://127.0.0.1:3200",
      title: "Settings · IB Market Data",
      bodyText:
        "MOCK WORKSPACE member@demo.local Settings Appearance Teammate book access Lock my book",
      headings: ["h1: Settings", "h2: Appearance"],
    });
    expect(result.pathname).toBe("/settings");
    expect(result.origin).toBe("http://127.0.0.1:3200");
  });

  it("throws when the demo-auth endpoint fails", async () => {
    const page = {
      async goto() {},
      request: {
        async post() {
          return {
            ok: () => false,
            status: () => 403,
            headers: () => ({}),
            async json() {
              return { error: "Demo auth disabled" };
            },
          };
        },
      },
      context() {
        return { cookies: async () => [] };
      },
    } as unknown as Page;
    await expect(establishDemoSession(page, "http://127.0.0.1:3200", "member")).rejects.toThrow(
      InspectAuthError,
    );
    await expect(establishDemoSession(page, "http://127.0.0.1:3200", "member")).rejects.toThrow(
      /403/,
    );
  });

  it("establishes a member demo session from the demo-auth endpoint", async () => {
    const cookies = [{ name: "demo_role", value: "member" }];
    const page = {
      async goto() {},
      request: {
        async post() {
          return {
            ok: () => true,
            status: () => 200,
            headers: () => ({
              "set-cookie": "demo_role=member; Path=/; HttpOnly; SameSite=Lax",
            }),
            async json() {
              return { ok: true, role: "member" };
            },
          };
        },
      },
      context() {
        return {
          cookies: async () => cookies,
          async addCookies() {},
        };
      },
    } as unknown as Page;
    const result = await establishDemoSession(page, "http://127.0.0.1:3200", "member");
    expect(result).toMatchObject({
      ok: true,
      role: "member",
      status: 200,
      cookiePresent: true,
    });
  });
});
