import { parseArgs } from "node:util";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { buildLocalAgentCreateOptions, createCursorAgentHost } from "./agents";
import { HARNESS_DEFAULTS, lookupPage, normalizeRoute, PAGE_CATALOG } from "./catalog";
import { loadHarnessEnv, Logger, redactSecrets } from "./util";
import {
  listAndResolveGrok46Xhigh,
  ModelUnavailableError,
  summarizeCatalog,
} from "./model";
import { attachIsolation, createIsolation, currentHead, changedFiles, dirtyFiles, makeRunId, removeWorktree } from "./isolation";
import { runHarness } from "./orchestrator";
import {
  buildHarnessRequest,
  CriticalSkepticRequiredError,
} from "./policy";
import { AuditReuseError } from "./audit-reuse";
import { createHarnessServerLease } from "./server-lease";
import { decideReadPath, decideShellCommand } from "./safety";
import { runPreflight } from "./preflight";
import { formatRouteInventory, inventoryRoutes } from "./routes-inventory";
import { RunMachine, createMachine } from "./machine";
import type { HarnessRequest } from "./request";
import type { IsolatedWorkspace } from "./isolation";
import {
  SandboxRequiredError,
  resolveSandboxPolicy,
  sandboxPolicySnapshot,
} from "./sandbox";
import { InspectAuthError } from "./inspect-auth";
import { classifyFailure } from "./failure";
import { installHarnessCrashGuard } from "./crash-guard";
import {
  applyResumeBudgetExtension,
  formatRunStatus,
  migratePersistedRun,
  resolveResumeRunId,
  restoreRunBudget,
  validateResume,
} from "./resume";

const HELP = `Page Improvement Harness v2 — IB Market Data

Usage:
  npm run page:improve -- <route> [options]
  npm run page:audit -- <route>
  npm run page:inspect -- <route>
  npm run page:routes
  npm run page:status -- [run-id]
  npm run page:prompts -- [run-id]
  npm run page:report -- [run-id]
  npm run page:resume -- <run-id>
  npm run page:resume -- <run-id> --max-total-tokens <higher> --max-minutes <higher> --max-agent-runs <higher>
  npm run page:models
  npm run page:harness-check
  npm run page:login

Examples:
  npm run page:audit -- /settings
  npm run page:improve -- /denied --objective "Tighten keyboard access" --max-iterations 1
  npm run page:improve -- /denied --from-audit <run-id>
  npm run page:resume -- denied-20260817-abc123

Options:
  --objective <text>          Optional short objective
  --objective-file <path>     Read objective from a file
  --audit-only                Read-only planner, dual review, evaluator; no edits
  --skeptic / --no-skeptic    Adversarial pass after the evaluator. Critical risk requires a skeptic for audit and improve; --no-skeptic is refused.
  --max-iterations <n>        Builder/evaluator repair rounds (default: 3)
  --max-minutes <n>           Wall-clock budget (alias: --max-duration-minutes, default: 90)
  --max-contract-rounds <n>   Dual-review / dispute ceiling (default: 3; safety cap, not a target)
  --max-agent-runs <n>        Fresh SDK agent cap (default: 40)
  --max-total-tokens <n>      Token cap across runs (default: 2000000). Resume may only increase this.
  --reviewers 1|2             Override independent contract reviewer count
  --risk low|medium|critical  Changes verification, skeptic, reviewer count, and adjacent regression
  --from-audit <run-id>       Reuse a completed provenance-valid audit contract+baseline.
  --resume <run-id>           Resume an incomplete run from last atomically completed state.
                              Budget exhaustion requires a strictly higher cap; consumed totals never reset.
                              Contract-round increases require an explicit higher --max-contract-rounds.
  --allow-no-sandbox          Required for builder runs when filesystem sandboxing is unavailable
  --isolation <mode>          worktree | branch | none (default: worktree)
  --role <role>               member | admin | public (default: catalog)
  --base-url <url>            Use an already running app; do not spawn Next
  --port <n>                  Demo server port (default: 3200)
  --cleanup-worktree          Remove the worktree after the run (never merges)
  --list-models               Print Cursor.models.list() and pinned Grok 4.6 xhigh
  --list-routes               Inventory app routes and recommended risk
  --self-check                Verify hooks, sandbox policy, then resolve Grok 4.6 xhigh
  --login                     Mint a local SDK key via Cursor.auth.login()
  --inspect-only              Start the demo app and capture inspect/performance only
  --status / --prompts / --report
  --help                      Show this help

Safety:
  Never merges, pushes, deploys, or writes secrets into artifacts.
  Requires CURSOR_API_KEY. Fails if Grok 4.6 xhigh is unavailable.
  No edits occur before CONTRACT_LOCK. No auto-merge or auto-deploy command exists.
  Builder runs require local filesystem sandboxing or an explicit --allow-no-sandbox acknowledgement.
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  installHarnessCrashGuard();
  const script = process.env.npm_lifecycle_event ?? "";
  const implied = impliedFlags(script);
  const parsed = parseArgs({
    args: [...implied, ...argv],
    allowPositionals: true,
    options: {
      objective: { type: "string" },
      "objective-file": { type: "string" },
      "audit-only": { type: "boolean", default: false },
      skeptic: { type: "boolean" },
      "no-skeptic": { type: "boolean", default: false },
      "max-iterations": { type: "string" },
      "max-minutes": { type: "string" },
      "max-duration-minutes": { type: "string" },
      "max-contract-rounds": { type: "string" },
      "max-agent-runs": { type: "string" },
      "max-total-tokens": { type: "string" },
      reviewers: { type: "string" },
      risk: { type: "string" },
      "from-audit": { type: "string" },
      resume: { type: "string" },
      isolation: { type: "string" },
      role: { type: "string" },
      "base-url": { type: "string" },
      port: { type: "string" },
      "cleanup-worktree": { type: "boolean", default: false },
      "allow-no-sandbox": { type: "boolean", default: false },
      "list-models": { type: "boolean", default: false },
      "list-routes": { type: "boolean", default: false },
      "self-check": { type: "boolean", default: false },
      login: { type: "boolean", default: false },
      "inspect-only": { type: "boolean", default: false },
      status: { type: "boolean", default: false },
      prompts: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (parsed.values.help) {
    console.log(HELP);
    return 0;
  }

  if (parsed.values.login) {
    const { Cursor } = await import("@cursor/sdk");
    console.log("Opening Cursor auth to mint a local SDK key. The key is not printed.");
    await Cursor.auth.login();
    console.log("SDK login complete.");
    if (
      !parsed.positionals[0] &&
      !parsed.values["list-models"] &&
      !parsed.values["self-check"]
    ) {
      return 0;
    }
  }

  loadHarnessEnv();
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  const repoRoot = process.cwd();

  if (parsed.values["list-routes"]) {
    console.log(formatRouteInventory(inventoryRoutes(repoRoot)));
    return 0;
  }

  if (parsed.values.status || parsed.values.prompts || parsed.values.report) {
    return inspectRunCommand(repoRoot, parsed.positionals[0], {
      status: Boolean(parsed.values.status),
      prompts: Boolean(parsed.values.prompts),
      report: Boolean(parsed.values.report),
    });
  }

  if (parsed.values["list-models"] || parsed.values["self-check"]) {
    return specialCommands(apiKey, Boolean(parsed.values["self-check"]), repoRoot);
  }

  const resumeResolved = resolveResumeRunId({
    script,
    resumeFlag: parsed.values.resume,
    positional: parsed.positionals[0],
    repoRoot,
  });
  if (script === "page:resume" || parsed.values.resume) {
    if (!resumeResolved.ok) {
      console.error(resumeResolved.message);
      return 1;
    }
    return resumeRun({
      runId: resumeResolved.runId,
      repoRoot,
      apiKey,
      baseUrl: parsed.values["base-url"],
      port: parsed.values.port,
      cleanup: Boolean(parsed.values["cleanup-worktree"]),
      budgetExtension: {
        maxTotalTokens: parsed.values["max-total-tokens"]
          ? Number(parsed.values["max-total-tokens"])
          : undefined,
        maxMinutes: parsed.values["max-minutes"]
          ? Number(parsed.values["max-minutes"])
          : parsed.values["max-duration-minutes"]
            ? Number(parsed.values["max-duration-minutes"])
            : undefined,
        maxAgentRuns: parsed.values["max-agent-runs"]
          ? Number(parsed.values["max-agent-runs"])
          : undefined,
        maxContractRounds: parsed.values["max-contract-rounds"]
          ? Number(parsed.values["max-contract-rounds"])
          : undefined,
        reason: "CLI resume budget extension",
      },
    });
  }

  const routeArg = parsed.positionals[0];
  if (!routeArg) {
    console.error("A target page or route is required.\n");
    console.log(HELP);
    return 1;
  }

  const route = normalizeRoute(routeArg);
  const page = lookupPage(route);
  const runId = makeRunId(route);
  const paths = createRunPaths(repoRoot, runId);
  const store = new ArtifactStore(paths);
  const log = new Logger((line) => store.appendLog(line));
  process.env.PAGE_HARNESS_ACTIVE = "1";
  process.env.PAGE_HARNESS_RUN_DIR = paths.root;

  const inspectOnly = Boolean(parsed.values["inspect-only"]);
  const auditOnly = Boolean(parsed.values["audit-only"] || inspectOnly);
  const allowNoSandbox = Boolean(parsed.values["allow-no-sandbox"]);
  const needsBuilder = !auditOnly;
  const preflight = runPreflight(repoRoot, {
    needsBuilder,
    allowNoSandbox,
    cwd: repoRoot,
  });
  store.writeJson("preflight.json", {
    ...preflight,
    sandboxPolicy: sandboxPolicySnapshot(preflight.sandboxPolicy),
  });
  store.writeJson("sandbox.json", preflight.sandbox);
  store.writeJson("role-permissions.json", preflight.rolePermissions);
  log.info(preflight.sandboxNote);
  if (!preflight.ok) {
    const message = "Harness preflight failed:\n" + preflight.failures.join("\n");
    console.error(message);
    store.markUnreusable({ failedPhase: "PRECHECK", message });
    return 1;
  }

  let model: Awaited<ReturnType<typeof listAndResolveGrok46Xhigh>> | null = null;
  if (!parsed.values["inspect-only"]) {
    try {
      model = await listAndResolveGrok46Xhigh(apiKey);
    } catch (error) {
      return failModel(error, log);
    }
    store.writeJson("model.json", {
      id: model.selection.id,
      params: model.selection.params,
      xhighParameterId: model.xhighParameterId,
      xhighValue: model.xhighValue,
      displayName: model.matched.displayName,
      catalog: summarizeCatalog(model.catalog),
    });
    log.info(
      `model ${model.selection.id} ${model.xhighParameterId}=${model.xhighValue}`,
    );
  }

  const isolationMode =
    (parsed.values.isolation as "worktree" | "branch" | "none" | undefined) ??
    HARNESS_DEFAULTS.isolation;
  const isolation = await createIsolation({
    repoRoot,
    route,
    mode: parsed.values["inspect-only"] ? "none" : isolationMode,
    runId,
  });
  process.env.PAGE_HARNESS_WORKTREE = isolation.agentCwd;
  process.env.PAGE_HARNESS_AGENT_CWD = isolation.agentCwd;
  log.info(
    `isolation ${isolation.mode} cwd=${isolation.agentCwd} branch=${isolation.branchName ?? "n/a"} sha=${isolation.baseSha ?? "n/a"}`,
  );

  const suppliedObjective = readSuppliedObjective(
    parsed.values.objective,
    parsed.values["objective-file"],
  );
  let request: HarnessRequest;
  try {
    request = buildHarnessRequest({
      route,
      pageTitle: page?.title,
      pageCritical: Boolean(page?.critical),
      suppliedObjective,
      auditOnly: Boolean(parsed.values["audit-only"] || parsed.values["inspect-only"]),
      skeptic: parsed.values.skeptic,
      noSkeptic: Boolean(parsed.values["no-skeptic"]),
      risk: parsed.values.risk,
      maxIterations: Number(parsed.values["max-iterations"] ?? HARNESS_DEFAULTS.maxIterations),
      maxDurationMinutes: Number(
        parsed.values["max-minutes"] ??
          parsed.values["max-duration-minutes"] ??
          HARNESS_DEFAULTS.maxDurationMinutes,
      ),
      maxContractRounds: Number(
        parsed.values["max-contract-rounds"] ?? HARNESS_DEFAULTS.maxContractRounds,
      ),
      maxAgentRuns: Number(parsed.values["max-agent-runs"] ?? HARNESS_DEFAULTS.maxAgentRuns),
      maxTotalTokens: Number(
        parsed.values["max-total-tokens"] ?? HARNESS_DEFAULTS.maxTotalTokens,
      ),
      inspectRole:
        (parsed.values.role as HarnessRequest["inspectRole"] | undefined) ??
        page?.role ??
        "member",
      reviewers: parseReviewers(parsed.values.reviewers),
      fromAudit: parsed.values["from-audit"] ?? null,
      resumeRunId: null,
      allowNoSandbox,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(redactSecrets(message));
    store.markUnreusable({ failedPhase: "PRECHECK", message });
    return 1;
  }

  const machine = RunMachine.start(
    paths.root,
    createMachine({
      runId,
      request,
      isolation,
      model: model
        ? { id: model.selection.id, params: model.selection.params }
        : null,
    }),
  );
  machine.begin("PRECHECK", { route });
    machine.complete("PRECHECK", {
      model: model?.selection.id ?? null,
      sandbox: preflight.sandbox,
    });
  machine.begin("WORKTREE", { mode: isolation.mode });
  machine.complete("WORKTREE", isolation);

  const lease = createHarnessServerLease({
    cwd: isolation.agentCwd,
    port: Number(parsed.values.port ?? HARNESS_DEFAULTS.port),
    logFile: path.join(paths.root, "next.log"),
    store,
    role: request.inspectRole,
    route,
    externalOrigin: parsed.values["base-url"],
  });
  let baseUrl = lease.origin();
  try {
    if (parsed.values["inspect-only"]) {
      const ready = await lease.ensure("BASELINE");
      baseUrl = ready.origin;
      log.info(`demo server ${baseUrl}`);
      const { inspectRoute } = await import("./inspect");
      const before = await inspectRoute({
        baseUrl,
        route,
        role: request.inspectRole,
        outDir: paths.inspectBefore,
        viewports: (await import("./catalog")).FULL_VIEWPORTS,
        meta: {
          runId,
          route,
          contractHash: "pending",
          iteration: 0,
          worktreeSha: isolation.baseSha ?? "unknown",
          serverOrigin: baseUrl,
          browser: "chrome",
          generatingCommand: "inspect-only",
        },
      });
      store.writeJson("performance/before.json", before);
      store.writeJson("request.json", { ...request, inspectOnly: true });
      log.info(
        `inspect-only consoleErrors=${before.consoleErrors.length} transferKb=${before.transferKb} navMs=${before.navigationMsMedian}`,
      );
      console.log(path.join(paths.inspectBefore, "inspect.json"));
      return 0;
    }

    if (!model) {
      throw new Error("Grok 4.6 xhigh was not resolved before the agent loop.");
    }

    const host = createCursorAgentHost({
      apiKey,
      model,
      store,
      agentCwd: isolation.agentCwd,
      baseUrl,
      route,
      adjacentRoutes: page?.route ? ["/login", "/dashboard"] : [],
      inspectRole: request.inspectRole,
      sandboxPolicy: preflight.sandboxPolicy,
      log,
    });

    const result = await runHarness(request, {
      host,
      store,
      paths,
      isolation,
      baseUrl,
      log,
      machine,
      model: model.selection,
      server: lease,
    });
    log.info(`done status=${result.status} score=${result.score} report=${result.reportPath}`);
    console.log(result.reportPath);
    if (result.status === "failed") return 2;
    if (result.status === "cancelled" || result.status === "stopped") return 3;
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(redactSecrets(message));
    try {
      machine.fail(machine.state.currentPhase, redactSecrets(message));
    } catch {
      // machine persist may already have failed
    }
    const classified = classifyFailure(message);
    const status = store.readJson("run-status.json") as { resumable?: boolean } | null;
    if (status?.resumable !== true && classified.retryable) {
      store.writeFailureStatus({
        phase: machine.state.currentPhase,
        message,
        resumable: true,
        category: classified.category,
      });
    } else if (status?.resumable !== true) {
      store.markUnreusable({
        failedPhase: machine.state.currentPhase,
        message,
      });
    }
    if (error instanceof AuditReuseError || error instanceof CriticalSkepticRequiredError) {
      store.writeJson("from-audit-rejected.json", {
        reusable: false,
        reason: redactSecrets(error.message),
      });
    }
    if (error instanceof InspectAuthError) {
      store.writeJson("baseline-invalid.json", {
        reusable: false,
        ...error.diagnostics,
        message: redactSecrets(error.message),
      });
    }
    return 1;
  } finally {
    await lease.stop();
    if (parsed.values["cleanup-worktree"] && isolation.worktreePath) {
      await removeWorktree(repoRoot, isolation.worktreePath);
    }
  }
}

function impliedFlags(script: string): string[] {
  switch (script) {
    case "page:audit":
      return ["--audit-only"];
    case "page:inspect":
      return ["--inspect-only"];
    case "page:models":
      return ["--list-models"];
    case "page:harness-check":
      return ["--self-check"];
    case "page:login":
      return ["--login"];
    case "page:routes":
      return ["--list-routes"];
    case "page:status":
      return ["--status"];
    case "page:prompts":
      return ["--prompts"];
    case "page:report":
      return ["--report"];
    case "page:resume":
      return [];
    default:
      return [];
  }
}

function readSuppliedObjective(text: string | undefined, file: string | undefined): string | null {
  if (file) {
    return readFileSync(file, "utf8");
  }
  if (text !== undefined) return text;
  return null;
}

async function specialCommands(
  apiKey: string | undefined,
  selfCheck: boolean,
  repoRoot: string,
): Promise<number> {
  if (selfCheck) {
    const auditPreflight = runPreflight(repoRoot, {
      needsBuilder: false,
      allowNoSandbox: false,
      cwd: repoRoot,
    });
    const improvePreflight = runPreflight(repoRoot, {
      needsBuilder: true,
      allowNoSandbox: false,
      cwd: repoRoot,
    });
    if (!auditPreflight.ok) {
      console.error("Safety self-check failed.", auditPreflight.failures);
      return 1;
    }
    const push = decideShellCommand("git push origin main", {
      PAGE_HARNESS_ACTIVE: "1",
    });
    const envRead = decideReadPath(path.join(repoRoot, ".env.local"));
    const example = decideReadPath(path.join(repoRoot, ".env.example"));
    if (push.permission !== "deny" || envRead.permission !== "deny" || example.permission !== "allow") {
      console.error("Safety self-check failed.", { push, envRead, example });
      return 1;
    }
    const auditLocal = buildLocalAgentCreateOptions({
      cwd: repoRoot,
      policy: auditPreflight.sandboxPolicy,
    });
    const improveLocal = buildLocalAgentCreateOptions({
      cwd: repoRoot,
      policy: improvePreflight.sandboxPolicy,
    });
    if (auditLocal.sandboxOptions.enabled && !auditPreflight.sandboxPolicy.detected.supported) {
      console.error(
        "Self-check failed: effective Agent.create config would pass sandboxOptions.enabled=true without filesystem sandbox support.",
      );
      return 1;
    }
    console.log("Safety self-check passed (hooks, push denied, .env denied, .env.example allowed).");
    console.log(`Audit sandbox: ${auditPreflight.sandboxNote}`);
    console.log(`Improve sandbox: ${improvePreflight.sandboxNote}`);
    console.log(
      `Agent.create local.sandboxOptions (audit): ${JSON.stringify(auditLocal.sandboxOptions)}`,
    );
    console.log(
      `Agent.create local.sandboxOptions (improve, no ack): ${JSON.stringify(improveLocal.sandboxOptions)}`,
    );
    if (!improvePreflight.sandboxPolicy.fallbackAllowed) {
      console.log(
        "Builder runs on this machine require --allow-no-sandbox; audit fallback is SANDBOX_UNAVAILABLE after read-only tool verification.",
      );
    }
    console.log(`Known pages: ${PAGE_CATALOG.map((page) => page.route).join(", ")}`);
    const smokeId = `selfcheck-${Date.now().toString(36)}`;
    const isolation = await createIsolation({
      repoRoot,
      route: "/denied",
      mode: "worktree",
      runId: smokeId,
    });
    if (!isolation.worktreePath || !isolation.branchName) {
      console.error("Worktree self-check failed: missing path/branch.");
      return 1;
    }
    await removeWorktree(repoRoot, isolation.worktreePath);
    const delBranch = await import("./util").then((mod) =>
      mod.git(["branch", "-D", isolation.branchName!], repoRoot),
    );
    if (delBranch.code !== 0) {
      console.warn(`Could not delete smoke branch ${isolation.branchName}`);
    }
    console.log(`Worktree self-check passed (${isolation.branchName}).`);
  }

  try {
    const resolved = await listAndResolveGrok46Xhigh(apiKey);
    console.log(`Pinned model: ${resolved.selection.id}`);
    console.log(`Pinned params: ${JSON.stringify(resolved.selection.params)}`);
    console.log(`xhigh parameter: ${resolved.xhighParameterId}=${resolved.xhighValue}`);
    if (!selfCheck) {
      console.log("\nCatalog:\n" + summarizeCatalog(resolved.catalog));
    }
  } catch (error) {
    return failModel(error);
  }
  return 0;
}

function inspectRunCommand(
  repoRoot: string,
  runIdArg: string | undefined,
  flags: { status: boolean; prompts: boolean; report: boolean },
): number {
  const runId = runIdArg || latestRunId(repoRoot);
  if (!runId) {
    console.error("No page-harness runs found under tmp/page-harness.");
    return 1;
  }
  const root = path.join(repoRoot, "tmp", "page-harness", runId);
  if (!existsSync(root)) {
    console.error(`Run not found: ${runId}`);
    return 1;
  }
  if (flags.status) {
    const machineFile = path.join(root, "machine.json");
    if (!existsSync(machineFile)) {
      console.log(`run ${runId} (no machine.json)`);
      return 0;
    }
    try {
      const paths = createRunPaths(repoRoot, runId);
      const store = new ArtifactStore(paths);
      const state = migratePersistedRun(store, paths.root);
      console.log(formatRunStatus(runId, state));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return 1;
    }
  }
  if (flags.prompts) {
    const dir = path.join(root, "artifacts", "prompts");
    if (!existsSync(dir)) {
      console.log("No prompts recorded.");
    } else {
      for (const file of readdirSync(dir)) {
        console.log(path.join(dir, file));
      }
    }
  }
  if (flags.report) {
    const report = path.join(root, "artifacts", "report.md");
    if (!existsSync(report)) {
      console.error("No report.md for this run.");
      return 1;
    }
    console.log(report);
    console.log(readFileSync(report, "utf8"));
  }
  return 0;
}

function latestRunId(repoRoot: string): string | null {
  const root = path.join(repoRoot, "tmp", "page-harness");
  if (!existsSync(root)) return null;
  const entries = readdirSync(root)
    .map((name) => ({ name, mtime: statSync(path.join(root, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0]?.name ?? null;
}

async function resumeRun(options: {
  runId: string;
  repoRoot: string;
  apiKey?: string;
  baseUrl?: string;
  port?: string;
  cleanup: boolean;
  budgetExtension?: {
    maxTotalTokens?: number;
    maxMinutes?: number;
    maxAgentRuns?: number;
    maxContractRounds?: number;
    reason: string;
  };
}): Promise<number> {
  const paths = createRunPaths(options.repoRoot, options.runId);
  if (!existsSync(path.join(paths.root, "machine.json"))) {
    console.error(
      `Run not found: ${options.runId}. page:resume will not start a new run.`,
    );
    return 1;
  }
  const store = new ArtifactStore(paths);
  const log = new Logger((line) => store.appendLog(line));
  let machine: RunMachine;
  try {
    machine = RunMachine.resume(paths.root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const migrated = migratePersistedRun(store, paths.root);
  machine = RunMachine.resume(paths.root);
  const validation = await validateResume({
    store,
    runRoot: paths.root,
    repoRoot: options.repoRoot,
    git: {
      currentHead,
      changedFiles,
      dirtyFiles,
    },
  });
  const extensionRequested = Boolean(
    options.budgetExtension &&
      (options.budgetExtension.maxTotalTokens != null ||
        options.budgetExtension.maxMinutes != null ||
        options.budgetExtension.maxAgentRuns != null ||
        options.budgetExtension.maxContractRounds != null),
  );
  if (!validation.ok) {
    const category = validation.category;
    const allowContractExtension =
      category === "contract_exhausted" &&
      options.budgetExtension?.maxContractRounds != null &&
      options.budgetExtension.maxContractRounds > (migrated.budget.maxContractRounds ?? 0);
    const allowBudgetExtension =
      category === "budget_exhausted" && extensionRequested;
    if (!allowContractExtension && !allowBudgetExtension) {
      console.error(
        `Run ${options.runId} is not resumable: ${validation.reason}`,
      );
      if (validation.state) {
        console.log(formatRunStatus(options.runId, validation.state));
      }
      return 1;
    }
  }
  if (!migrated.resumable && !extensionRequested) {
    console.error(
      `Run ${options.runId} is not resumable (reusable=${migrated.reusable ? "yes" : "no"}).`,
    );
    console.log(formatRunStatus(options.runId, migrated));
    return 1;
  }

  const request = machine.state.request;
  const isolation = await attachIsolation(machine.state.isolation as IsolatedWorkspace);
  process.env.PAGE_HARNESS_ACTIVE = "1";
  process.env.PAGE_HARNESS_RUN_DIR = paths.root;
  process.env.PAGE_HARNESS_WORKTREE = isolation.agentCwd;
  process.env.PAGE_HARNESS_AGENT_CWD = isolation.agentCwd;

  const preflight = runPreflight(options.repoRoot, {
    needsBuilder: !request.auditOnly,
    allowNoSandbox: request.allowNoSandbox === true,
    cwd: isolation.agentCwd,
  });
  store.writeJson("preflight.json", {
    ...preflight,
    sandboxPolicy: sandboxPolicySnapshot(preflight.sandboxPolicy),
  });
  store.writeJson("sandbox.json", preflight.sandbox);
  store.writeJson("role-permissions.json", preflight.rolePermissions);
  log.info(preflight.sandboxNote);
  if (!preflight.ok) {
    const message = "Harness preflight failed:\n" + preflight.failures.join("\n");
    console.error(message);
    store.writeFailureStatus({
      phase: "PRECHECK",
      message,
      resumable: false,
      category: "security_policy",
    });
    return 1;
  }

  const sandboxPolicy = resolveSandboxPolicy({
    needsBuilder: !request.auditOnly,
    allowNoSandbox: request.allowNoSandbox === true,
    cwd: options.repoRoot,
  });
  store.writeJson("sandbox.json", sandboxPolicySnapshot(sandboxPolicy));
  if (!sandboxPolicy.fallbackAllowed && sandboxPolicy.effective !== "enabled") {
    const err = new SandboxRequiredError(sandboxPolicy);
    log.error(err.message);
    store.writeFailureStatus({
      phase: "PRECHECK",
      message: err.message,
      resumable: false,
      category: "security_policy",
    });
    return 1;
  }

  let model: Awaited<ReturnType<typeof listAndResolveGrok46Xhigh>>;
  try {
    model = await listAndResolveGrok46Xhigh(options.apiKey);
  } catch (error) {
    return failModel(error, log);
  }
  store.writeJson("model.json", {
    id: model.selection.id,
    params: model.selection.params,
    xhighParameterId: model.xhighParameterId,
    xhighValue: model.xhighValue,
    displayName: model.matched.displayName,
    catalog: summarizeCatalog(model.catalog),
  });
  log.info(`model ${model.selection.id} ${model.xhighParameterId}=${model.xhighValue}`);

  const resumeState = validation.ok ? validation.state : migrated;
  const budget = restoreRunBudget(resumeState.budget);
  if (extensionRequested && options.budgetExtension) {
    try {
      applyResumeBudgetExtension({
        budget,
        request,
        store,
        maxTotalTokens: options.budgetExtension.maxTotalTokens,
        maxMinutes: options.budgetExtension.maxMinutes,
        maxAgentRuns: options.budgetExtension.maxAgentRuns,
        maxContractRounds: options.budgetExtension.maxContractRounds,
        reason: options.budgetExtension.reason,
      });
      machine.state.request = request;
      machine.state.stopReason = null;
      if (machine.state.failureCategory === "budget_exhausted" || machine.state.failureCategory === "contract_exhausted") {
        machine.state.failureCategory = null;
      }
      machine.persist();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return 1;
    }
  } else if (resumeState.failureCategory === "budget_exhausted") {
    console.error(resumeState.nextAction);
    console.log(formatRunStatus(options.runId, resumeState));
    return 1;
  }
  const lease = createHarnessServerLease({
    cwd: isolation.agentCwd,
    port: Number(options.port ?? HARNESS_DEFAULTS.port),
    logFile: path.join(paths.root, "next.log"),
    store,
    role: request.inspectRole,
    route: request.route,
    externalOrigin: options.baseUrl,
  });
  const baseUrl = lease.origin();
  try {
    const host = createCursorAgentHost({
      apiKey: options.apiKey,
      model,
      store,
      agentCwd: isolation.agentCwd,
      baseUrl,
      route: request.route,
      inspectRole: request.inspectRole,
      sandboxPolicy,
      log,
    });
    const result = await runHarness(
      { ...request, resumeRunId: options.runId },
      {
        host,
        store,
        paths,
        isolation,
        baseUrl,
        log,
        machine,
        model: model.selection,
        budget,
        server: lease,
      },
    );
    console.log(result.reportPath);
    return result.status === "failed" ? 2 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(redactSecrets(message));
    const classified = classifyFailure(message);
    const status = store.readJson("run-status.json") as { resumable?: boolean } | null;
    if (status?.resumable === true) return 1;
    try {
      machine.fail(machine.state.currentPhase, redactSecrets(message), classified.category);
    } catch {
      // ignore persist failures
    }
    store.writeFailureStatus({
      phase: machine.state.currentPhase,
      message,
      resumable: classified.retryable,
      category: classified.category,
    });
    return 1;
  } finally {
    await lease.stop();
    if (options.cleanup && isolation.worktreePath) {
      await removeWorktree(options.repoRoot, isolation.worktreePath);
    }
  }
}

function parseReviewers(value: string | undefined): 1 | 2 | null {
  if (value == null) return null;
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new Error("--reviewers must be 1 or 2");
}

function failModel(error: unknown, log?: Logger): number {
  if (error instanceof ModelUnavailableError) {
    const message = `${error.message}\nCatalog:\n${error.catalogSummary}`;
    log?.error(message);
    console.error(message);
    return 1;
  }
  const message = error instanceof Error ? error.message : String(error);
  const authHint =
    /401|unauthor|api key|not authenticated/i.test(message)
      ? " Set CURSOR_API_KEY to a user or service-account key from https://cursor.com/dashboard/integrations. The harness will not print the value."
      : "";
  console.error(redactSecrets(message) + authHint);
  return 1;
}
