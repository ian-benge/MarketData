import { describe, expect, it } from "vitest";
import {
  classifyFailureCategory,
  compareAdjacentRegression,
  compareFailureFingerprints,
  evaluateCompleteRequiredPass,
  extractExecutedSpecs,
  fingerprintId,
  parsePlaywrightFailures,
  selectBudgetRestoreCommit,
} from "./regression";
import { classifyVerifyResults } from "./verify";
import { sampleContract, sampleEvaluation } from "./test-fixtures";
import { evaluationCompleteness } from "./schemas";

const ADJACENT_FAIL_OUTPUT = `
Running 19 tests using 1 worker

  ✓   1 [installed-chrome] › e2e\\\\accessibility.spec.ts:6:5 › settings component vitest covers live sign-out (4.2s)
  ✓  15 [installed-chrome] › e2e\\\\demo-auth.spec.ts:20:7 › demo auth › admin can open admin (2.4s)
  ✘  16 [installed-chrome] › e2e\\\\positions-visual.spec.ts:5:7 › positions visual › desktop blotter is dense and mock-labelled (3.6s)
  ✘  17 [installed-chrome] › e2e\\\\positions-visual.spec.ts:86:7 › positions visual › flat options book is the primary blotter (2.9s)
  ✓  18 [installed-chrome] › e2e\\\\positions-visual.spec.ts:110:7 › positions visual › inspector and add dialog stay within the shell (3.6s)
  ✘  19 [installed-chrome] › e2e\\\\positions-visual.spec.ts:131:7 › positions visual mobile › mobile blotter does not overflow (7.3s)

  1) [installed-chrome] › e2e\\\\positions-visual.spec.ts:5:7 › positions visual › desktop blotter is dense and mock-labelled

    Error: expect(locator).toBeVisible() failed
    Error: strict mode violation: getByRole('group', { name: 'P&L timeframe' }) resolved to 2 elements

  2) [installed-chrome] › e2e\\\\positions-visual.spec.ts:86:7 › positions visual › flat options book is the primary blotter

    Error: expect(locator).toBeVisible() failed
    Error: strict mode violation: getByText('MSFT  2 Feb 26  430 C') resolved to 2 elements

  3) [installed-chrome] › e2e\\\\positions-visual.spec.ts:131:7 › positions visual mobile › mobile blotter does not overflow

    Error: expect(locator).toBeInViewport() failed
    Received: viewport ratio 0

  3 failed
    [installed-chrome] › e2e\\\\positions-visual.spec.ts:5:7 › positions visual › desktop blotter is dense and mock-labelled
    [installed-chrome] › e2e\\\\positions-visual.spec.ts:86:7 › positions visual › flat options book is the primary blotter
    [installed-chrome] › e2e\\\\positions-visual.spec.ts:131:7 › positions visual mobile › mobile blotter does not overflow
  16 passed (1.1m)
`;

describe("playwright failure fingerprints", () => {
  it("parses stable file/title/category identities from list reporter output", () => {
    const failures = parsePlaywrightFailures(ADJACENT_FAIL_OUTPUT);
    expect(extractExecutedSpecs(ADJACENT_FAIL_OUTPUT)).toEqual(
      expect.arrayContaining([
        "e2e/positions-visual.spec.ts",
        "e2e/demo-auth.spec.ts",
      ]),
    );
    expect(failures.map((row) => row.id).sort()).toEqual([
      "e2e/positions-visual.spec.ts::positions visual mobile › mobile blotter does not overflow",
      "e2e/positions-visual.spec.ts::positions visual › desktop blotter is dense and mock-labelled",
      "e2e/positions-visual.spec.ts::positions visual › flat options book is the primary blotter",
    ]);
    expect(failures.find((row) => row.title.includes("desktop"))?.category).toBe(
      "strict_mode_violation",
    );
    expect(failures.find((row) => row.title.includes("mobile"))?.category).toBe(
      "not_in_viewport",
    );
    expect(classifyFailureCategory("Timeout 5000ms exceeded")).toBe("timeout");
  });

  it("treats identical baseline failures as debt, not blocking regressions", () => {
    const current = parsePlaywrightFailures(ADJACENT_FAIL_OUTPUT);
    const compared = compareFailureFingerprints(current, current);
    expect(compared.blocking).toEqual([]);
    expect(compared.baselineDebt).toHaveLength(3);
    expect(compared.resolved).toEqual([]);
  });

  it("blocks new or worsened adjacent failures and incomparable runs without baseline", () => {
    const baseline = parsePlaywrightFailures(ADJACENT_FAIL_OUTPUT);
    const extra = [
      ...baseline,
      {
        id: fingerprintId("e2e/positions-visual.spec.ts", "new flake"),
        file: "e2e/positions-visual.spec.ts",
        title: "new flake",
        project: "installed-chrome",
        category: "timeout" as const,
        message: "Timeout",
      },
    ];
    const worsened = compareFailureFingerprints(baseline, extra);
    expect(worsened.blocking).toHaveLength(1);
    expect(worsened.blocking[0]?.title).toBe("new flake");

    const classified = classifyVerifyResults({
      requestedRoute: "/settings",
      results: [
        {
          name: "playwright-adjacent",
          ok: false,
          output: ADJACENT_FAIL_OUTPUT,
          scope: "adjacent",
        },
      ],
    });
    const withoutBaseline = compareAdjacentRegression({
      policy: { requireAdjacentRegression: true },
      classified,
      baselineFingerprints: null,
      adjacentRequired: true,
    });
    expect(withoutBaseline.missingBaseline).toBe(true);
    expect(withoutBaseline.blocking).toHaveLength(3);

    const withBaseline = compareAdjacentRegression({
      policy: { requireAdjacentRegression: true },
      classified,
      baselineFingerprints: baseline,
      adjacentRequired: true,
    });
    expect(withBaseline.blocking).toEqual([]);
    expect(withBaseline.baselineDebt).toHaveLength(3);
  });
});

describe("completeRequiredPass", () => {
  it("does not fail a complete pass merely because adjacent jobs are not ok", () => {
    const contract = sampleContract("/settings");
    const evaluation = sampleEvaluation(true, "hash");
    const completeness = evaluationCompleteness(contract, evaluation);
    const classified = classifyVerifyResults({
      requestedRoute: "/settings",
      results: [
        {
          name: "target-route-inspect",
          ok: true,
          output: "route /settings",
          scope: "target",
          page: "/settings",
          targetRouteVisited: true,
          visitedRoutes: ["/settings"],
        },
        { name: "typecheck", ok: true, output: "", scope: "static" },
        {
          name: "playwright-target",
          ok: true,
          output: 'navigating to "http://127.0.0.1:3200/settings"',
          scope: "target",
          page: "/settings",
          targetRouteVisited: true,
          visitedRoutes: ["/settings"],
        },
        {
          name: "playwright-adjacent",
          ok: false,
          output: ADJACENT_FAIL_OUTPUT,
          scope: "adjacent",
        },
      ],
    });
    const regression = compareAdjacentRegression({
      policy: { requireAdjacentRegression: true },
      classified,
      baselineFingerprints: parsePlaywrightFailures(ADJACENT_FAIL_OUTPUT),
      adjacentRequired: true,
    });
    const result = evaluateCompleteRequiredPass({
      evaluationPassed: true,
      completeness,
      skepticRequired: true,
      skepticPassed: true,
      classified,
      regression,
      freshnessOk: true,
      performanceRegressions: 0,
      routeError: false,
    });
    expect(result.testsFailed).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("still blocks failed target verification", () => {
    const completeness = evaluationCompleteness(sampleContract(), sampleEvaluation(true));
    const classified = classifyVerifyResults({
      requestedRoute: "/settings",
      results: [
        {
          name: "playwright-target",
          ok: false,
          output: "failed",
          scope: "target",
          page: "/settings",
          targetRouteVisited: true,
          visitedRoutes: ["/settings"],
        },
      ],
    });
    const result = evaluateCompleteRequiredPass({
      evaluationPassed: true,
      completeness,
      skepticRequired: false,
      skepticPassed: null,
      classified,
      regression: {
        blocking: [],
        baselineDebt: [],
        resolved: [],
        incomparable: [],
        missingBaseline: false,
        missingRequiredAdjacent: false,
      },
      freshnessOk: true,
      performanceRegressions: 0,
      routeError: false,
    });
    expect(result.passed).toBe(false);
    expect(result.testsFailed).toBe(true);
  });
});

describe("budget restore selection", () => {
  it("preserves a passing checkpoint instead of the baseline", () => {
    expect(
      selectBudgetRestoreCommit({
        best: { completeRequiredPass: true, commit: "iter4" },
        startCommit: "baseline",
      }),
    ).toEqual({ commit: "iter4", restoreKind: "passing_checkpoint" });
    expect(
      selectBudgetRestoreCommit({
        best: { completeRequiredPass: false, commit: "iter3" },
        startCommit: "baseline",
      }),
    ).toEqual({ commit: "baseline", restoreKind: "baseline" });
  });
});
