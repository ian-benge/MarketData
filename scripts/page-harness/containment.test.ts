import { describe, expect, it } from "vitest";
import {
  assertArtifactName,
  assertArtifactSize,
  assertHarnessOrigin,
  assertPathInside,
  assertRouteContained,
  pathIsInside,
} from "./containment";
import { MAX_ARTIFACT_BYTES } from "./schemas";

describe("path and route containment", () => {
  it("keeps artifacts inside the run directory", () => {
    const root = "C:/Projects/MarketData/tmp/page-harness/run-1";
    expect(pathIsInside(root, `${root}/artifacts/contract.json`)).toBe(true);
    expect(() =>
      assertPathInside("C:/Windows/System32/config", [root], "artifact"),
    ).toThrow(/escapes/);
  });

  it("restricts browser inspection to the harness origin", () => {
    expect(() =>
      assertHarnessOrigin("https://evil.example", "http://127.0.0.1:3200"),
    ).toThrow(/local origin/);
    expect(() =>
      assertHarnessOrigin("http://127.0.0.1:9999", "http://127.0.0.1:3200"),
    ).toThrow(/does not match/);
    expect(() =>
      assertHarnessOrigin("http://127.0.0.1:3200", "http://127.0.0.1:3200"),
    ).not.toThrow();
  });

  it("contains routes to the target page", () => {
    expect(assertRouteContained("/denied", "/denied")).toBe("/denied");
    expect(() => assertRouteContained("/admin", "/denied")).toThrow(/outside/);
    expect(assertRouteContained("/login", "/denied", ["/login"])).toBe("/login");
  });

  it("allowlists artifact names and sizes", () => {
    expect(assertArtifactName("contract")).toBe("contract");
    expect(() => assertArtifactName("secret")).toThrow(/allowlisted/);
    expect(() => assertArtifactSize({ blob: "x".repeat(MAX_ARTIFACT_BYTES) })).toThrow(
      /exceeds/,
    );
  });
});
