import { describe, expect, it } from "vitest";
import {
  assertNoProductionMarketDataMocks,
  assertSharedProductionAuthorized,
  assertSurfaceAllowed,
  defaultSurfacesForScope,
  licenseAllowsEmailAttachment,
  licenseConfigFromEnv,
  requestedSurfacesForReportRun,
} from "@/lib/market-data/licensing";
import { EntitlementError } from "@/lib/market-data/schemas";

describe("licensing", () => {
  it("defaultSurfacesForScope narrows single_user_development", () => {
    const surfaces = defaultSurfacesForScope("single_user_development");
    expect(surfaces).toContain("dashboard_display");
    expect(surfaces).not.toContain("email_attachment");
    expect(surfaces).not.toContain("pdf_inclusion");
  });

  it("report-run quality surfaces stay inside the current license", () => {
    const solo = defaultSurfacesForScope("single_user_development");
    expect(licenseAllowsEmailAttachment("single_user_development")).toBe(false);
    expect(
      requestedSurfacesForReportRun({
        skipEmail: false,
        permittedSurfaces: solo,
      }),
    ).toEqual(["dashboard_display", "server_calculations", "derived_charts"]);
    expect(
      requestedSurfacesForReportRun({
        skipEmail: false,
        permittedSurfaces: defaultSurfacesForScope("internal_team"),
      }),
    ).not.toContain("email_attachment");
    expect(
      requestedSurfacesForReportRun({
        skipEmail: false,
        permittedSurfaces: defaultSurfacesForScope("redistributable"),
      }),
    ).toContain("email_attachment");
  });

  it("assertSurfaceAllowed rejects disallowed surfaces", () => {
    const config = licenseConfigFromEnv({
      MARKET_DATA_LICENSE_SCOPE: "single_user_development",
      MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
    });
    expect(() => assertSurfaceAllowed(config, "email_attachment")).toThrow(
      EntitlementError,
    );
    expect(() => assertSurfaceAllowed(config, "dashboard_display")).not.toThrow();
  });

  it("assertSharedProductionAuthorized fails closed without ack/scope", () => {
    expect(() =>
      assertSharedProductionAuthorized({
        NODE_ENV: "production",
        MARKET_DATA_LICENSE_SCOPE: "single_user_development",
        MARKET_DATA_LICENSE_ACKNOWLEDGED: true,
      }),
    ).toThrow(/shared multi-user/);

    expect(() =>
      assertSharedProductionAuthorized({
        NODE_ENV: "production",
        MARKET_DATA_LICENSE_SCOPE: "internal_team",
        MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
      }),
    ).toThrow(/ACKNOWLEDGED/);

    expect(() =>
      assertSharedProductionAuthorized({
        NODE_ENV: "production",
        MARKET_DATA_LICENSE_SCOPE: "internal_team",
        MARKET_DATA_LICENSE_ACKNOWLEDGED: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertSharedProductionAuthorized({
        NODE_ENV: "development",
        MARKET_DATA_LICENSE_SCOPE: "single_user_development",
        MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
      }),
    ).not.toThrow();
  });

  it("refuses production mocks", () => {
    expect(() =>
      assertNoProductionMarketDataMocks({ NODE_ENV: "production" }),
    ).toThrow(/Mock market data is forbidden/);
    expect(() =>
      assertNoProductionMarketDataMocks({ NODE_ENV: "development" }),
    ).not.toThrow();
  });
});
