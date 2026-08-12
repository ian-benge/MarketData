import type { Env } from "@/lib/env";
import {
  EntitlementError,
  LicenseScopeSchema,
  type LicenseScope,
  type ProductSurface,
} from "@/lib/market-data/schemas";

export type LicenseConfig = {
  scope: LicenseScope;
  /** Explicit acknowledgement that the operator verified provider terms. */
  acknowledged: boolean;
  permittedSurfaces: ProductSurface[];
  /** Non-secret id for provenance (e.g. "alpaca:single_user_development"). */
  licenseScopeId: string;
};

/**
 * Default product surfaces permitted for a license scope.
 * single_user_development is intentionally narrow — shared multi-user
 * production surfaces require internal_team or redistributable.
 */
export function defaultSurfacesForScope(scope: LicenseScope): ProductSurface[] {
  switch (scope) {
    case "single_user_development":
      return ["dashboard_display", "server_calculations", "derived_charts"];
    case "internal_team":
      return [
        "dashboard_display",
        "server_calculations",
        "archived_normalized",
        "derived_charts",
        "in_app_reports",
        "pdf_inclusion",
        "ai_analysis_input",
      ];
    case "redistributable":
      return [
        "dashboard_display",
        "server_calculations",
        "archived_normalized",
        "derived_charts",
        "in_app_reports",
        "pdf_inclusion",
        "email_attachment",
        "ai_analysis_input",
      ];
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function licenseConfigFromEnv(
  env: Pick<
    Env,
    "MARKET_DATA_LICENSE_SCOPE" | "MARKET_DATA_LICENSE_ACKNOWLEDGED"
  >,
  providerKey = "market_data",
): LicenseConfig {
  const scope = LicenseScopeSchema.parse(env.MARKET_DATA_LICENSE_SCOPE);
  return {
    scope,
    acknowledged: env.MARKET_DATA_LICENSE_ACKNOWLEDGED === true,
    permittedSurfaces: defaultSurfacesForScope(scope),
    licenseScopeId: `${providerKey}:${scope}`,
  };
}

export function assertSurfaceAllowed(
  config: LicenseConfig,
  surface: ProductSurface,
): void {
  if (!config.permittedSurfaces.includes(surface)) {
    throw new EntitlementError(
      "license_scope",
      `Surface "${surface}" is not permitted under license scope "${config.scope}" (id=${config.licenseScopeId}).`,
    );
  }
}

/**
 * Production fail-closed gate for shared market-data use.
 *
 * MARKET_DATA_LICENSE_ACKNOWLEDGED is an operational guardrail confirming the
 * account owner verified current provider terms — it is NOT proof of a license.
 * Do not treat acknowledgement alone as legal authorization.
 */
export function assertSharedProductionAuthorized(
  env: Pick<
    Env,
    | "NODE_ENV"
    | "MARKET_DATA_LICENSE_SCOPE"
    | "MARKET_DATA_LICENSE_ACKNOWLEDGED"
  >,
): void {
  if (env.NODE_ENV !== "production") return;

  const scope = LicenseScopeSchema.parse(env.MARKET_DATA_LICENSE_SCOPE);
  const sharedOk = scope === "internal_team" || scope === "redistributable";
  if (!sharedOk) {
    throw new EntitlementError(
      "license_scope",
      `Production market data refused: scope "${scope}" does not authorize shared multi-user use. Configure internal_team or redistributable after verifying provider terms.`,
    );
  }
  if (env.MARKET_DATA_LICENSE_ACKNOWLEDGED !== true) {
    throw new EntitlementError(
      "license_scope",
      "Production market data refused: MARKET_DATA_LICENSE_ACKNOWLEDGED must be true. Acknowledgement is an operational guardrail, not proof of a license.",
    );
  }
}

/** In production, never silently use mocks for market data. */
export function assertNoProductionMarketDataMocks(env: Pick<Env, "NODE_ENV">): void {
  if (env.NODE_ENV === "production") {
    throw new EntitlementError(
      "license_scope",
      "Mock market data is forbidden in production. Configure an authorized live provider.",
    );
  }
}
