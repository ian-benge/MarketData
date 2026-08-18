import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { ModelSelection, SDKCustomTool, ToolName } from "@cursor/sdk";
import type { ArtifactStore } from "./artifacts";
import type { ArtifactName } from "./schemas";
import { inspectRoute, type InspectReport } from "./inspect";
import { runVerification, type VerifyResult } from "./verify";
import { redactSecrets } from "./util";
import type { PageRole } from "./catalog";
import {
  assertArtifactName,
  assertArtifactSize,
  assertHarnessOrigin,
  assertRouteContained,
} from "./containment";
import {
  rolePermissions,
  shouldEnableSandbox,
  type AgentPurpose,
  type CustomToolName,
} from "./permissions";
import {
  localSandboxOptions,
  type SandboxPolicy,
} from "./sandbox";
import {
  assertRunMatchesSelection,
  assertSamePinnedModel,
  listAndResolveGrok46Xhigh,
  type ResolvedGrok46,
} from "./model";
import type { TokenUsage } from "./usage";
import { accountSdkUsage, emptyUsage } from "./usage";

export type RoleName = "planner" | "builder" | "evaluator" | "skeptic";

export type { TokenUsage };

export const READ_ONLY_TOOLS: ToolName[] = rolePermissions("planner").tools;
export const READ_ONLY_DISALLOWED_TOOLS: ToolName[] =
  rolePermissions("planner").disallowedTools;
export const BUILDER_DISALLOWED_TOOLS: ToolName[] =
  rolePermissions("builder").disallowedTools;

export { shouldEnableSandbox };

export function isSandboxUnavailableMessage(message: string): boolean {
  return /sandboxing is not supported|sandboxOptions\.enabled/i.test(message);
}

export function toolRestrictions(purpose: AgentPurpose): {
  tools: ToolName[];
  disallowedTools: ToolName[];
} {
  const perms = rolePermissions(purpose);
  return { tools: perms.tools, disallowedTools: perms.disallowedTools };
}

export type AgentTurnResult = {
  agentId: string;
  runId: string;
  status: "finished" | "error" | "cancelled";
  resultText: string;
  usage: TokenUsage;
  usageAccount?: import("./usage").UsageAccount;
  durationMs: number;
  submitted: ArtifactName[];
  model?: ModelSelection;
};

export type AgentSession = {
  readonly agentId: string;
  readonly role: RoleName;
  readonly purpose: AgentPurpose;
  send(prompt: string): Promise<AgentTurnResult>;
  close(): Promise<void>;
};

export type AgentHost = {
  open(options: {
    role: RoleName;
    cwd: string;
    purpose: AgentPurpose;
  }): Promise<AgentSession>;
};

export type CreateAgentFn = typeof Agent.create;

export function buildLocalAgentCreateOptions(options: {
  cwd: string;
  policy: SandboxPolicy;
  customTools?: Record<string, SDKCustomTool>;
}) {
  return {
    cwd: options.cwd,
    settingSources: [] as Array<
      "project" | "user" | "team" | "mdm" | "plugins" | "all"
    >,
    autoReview: true as const,
    sandboxOptions: localSandboxOptions(options.policy),
    ...(options.customTools ? { customTools: options.customTools } : {}),
  };
}

type InspectFn = (label: string, route?: string) => Promise<InspectReport>;
type VerifyFn = () => Promise<VerifyResult[]>;

const SubmitArtifactArgs = z.object({
  name: z.string().min(1),
  payload: z.unknown(),
});

const RequestInspectArgs = z.object({
  note: z.string().max(500).optional(),
  route: z.string().max(200).optional(),
});

const RequestTestsArgs = z.object({
  note: z.string().max(500).optional(),
});

export function parseRequestTestsArgs(args: unknown) {
  return RequestTestsArgs.parse(args ?? {});
}

export const REQUEST_TESTS_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    note: {
      type: "string",
      description: "Optional note; omit or pass {} to run the default suite.",
    },
  },
};

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function createCustomTools(options: {
  store: ArtifactStore;
  inspect: InspectFn;
  verify: VerifyFn;
  submitted: ArtifactName[];
  allowedTools: CustomToolName[];
  allowedArtifacts: ArtifactName[];
  allowedOrigin: string;
  targetRoute: string;
  adjacentRoutes: string[];
}): Record<string, SDKCustomTool> {
  const tools: Record<string, SDKCustomTool> = {};

  if (options.allowedTools.includes("submit_artifact")) {
    tools.submit_artifact = {
      description:
        "Submit a structured harness artifact. name must be one of the role-allowlisted artifact names.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          payload: { type: "object" },
        },
        required: ["name", "payload"],
      },
      execute(args) {
        try {
          const parsed = SubmitArtifactArgs.parse(args);
          const name = assertArtifactName(parsed.name);
          if (!options.allowedArtifacts.includes(name)) {
            return toolError(
              `Artifact '${name}' is not allowed for this role. Allowed: ${options.allowedArtifacts.join(", ")}`,
            );
          }
          assertArtifactSize(parsed.payload);
          const { file } = options.store.submit(name, parsed.payload);
          options.submitted.push(name);
          return {
            content: [{ type: "text", text: `stored ${name} at ${file}` }],
            structuredContent: { name, file },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    };
  }

  if (options.allowedTools.includes("request_inspect")) {
    tools.request_inspect = {
      description:
        "Re-run the orchestrator Playwright inspect against the harness-owned local demo origin.",
      inputSchema: {
        type: "object",
        properties: {
          note: { type: "string" },
          route: { type: "string" },
        },
      },
      async execute(args) {
        try {
          const parsed = RequestInspectArgs.parse(args);
          const route = assertRouteContained(
            parsed.route ?? options.targetRoute,
            options.targetRoute,
            options.adjacentRoutes,
          );
          assertHarnessOrigin(options.allowedOrigin, options.allowedOrigin);
          const report = await options.inspect(parsed.note ?? "ad-hoc", route);
          return {
            content: [
              {
                type: "text",
                text: `inspect complete. consoleErrors=${report.consoleErrors.length} transferKb=${report.transferKb} screenshots=${report.screenshots.length}`,
              },
            ],
            structuredContent: {
              title: report.title,
              finalUrl: report.finalUrl,
              consoleErrors: report.consoleErrors,
              duplicateGets: report.duplicateGets,
              a11y: report.a11y,
              screenshots: report.screenshots,
            },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    };
  }

  if (options.allowedTools.includes("request_tests")) {
    tools.request_tests = {
      description:
        "Run the orchestrator typecheck plus targeted Vitest/Playwright suite for this page.",
      inputSchema: REQUEST_TESTS_INPUT_SCHEMA,
      async execute(args) {
        try {
          parseRequestTestsArgs(args);
          const results = await options.verify();
          return {
            content: [
              {
                type: "text",
                text: results
                  .map((row) => `${row.ok ? "PASS" : "FAIL"} ${row.name}`)
                  .join("\n"),
              },
            ],
            structuredContent: { results },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    };
  }

  return tools;
}

export function createCursorAgentHost(options: {
  apiKey?: string;
  model: ResolvedGrok46;
  store: ArtifactStore;
  agentCwd: string;
  baseUrl: string;
  route: string;
  adjacentRoutes?: string[];
  inspectRole: PageRole;
  sandboxPolicy: SandboxPolicy;
  log: { info: (msg: string) => void; verbose: (msg: string) => void; warn: (msg: string) => void };
  createAgent?: CreateAgentFn;
}): AgentHost {
  const seenAgentIds = new Set<string>();
  return {
    async open({ role, cwd, purpose }) {
      const perms = rolePermissions(purpose);
      const inspect: InspectFn = async (label, route) => {
        const outDir = path.join(
          options.store.paths.inspect,
          "adhoc",
          `${role}-${Date.now()}`,
        );
        mkdirSync(outDir, { recursive: true });
        return inspectRoute({
          baseUrl: options.baseUrl,
          route: route ?? options.route,
          role: options.inspectRole,
          outDir,
        });
      };
      const verify: VerifyFn = async () =>
        runVerification({
          cwd: options.agentCwd,
          route: options.route,
          baseUrl: options.baseUrl,
        });

      process.env.PAGE_HARNESS_ACTIVE = "1";
      process.env.PAGE_HARNESS_AGENT_CWD = cwd;
      process.env.PAGE_HARNESS_WORKTREE = cwd;
      process.env.PAGE_HARNESS_RUN_DIR = options.store.paths.root;

      const resolved = await listAndResolveGrok46Xhigh(options.apiKey);
      assertSamePinnedModel(
        options.model.selection,
        resolved.selection,
        resolved.catalog,
      );
      options.store.writeJson("model-resolution-latest.json", {
        id: resolved.selection.id,
        params: resolved.selection.params,
        xhighParameterId: resolved.xhighParameterId,
        xhighValue: resolved.xhighValue,
        purpose,
        resolvedAt: new Date().toISOString(),
      });

      const agent = await createAgentWithSandbox({
        apiKey: options.apiKey,
        model: resolved.selection,
        cwd,
        tools: perms.tools,
        disallowedTools: perms.disallowedTools,
        sandboxPolicy: options.sandboxPolicy,
        createAgent: options.createAgent,
        customTools: () => {
          const submitted: ArtifactName[] = [];
          return {
            submitted,
            tools: createCustomTools({
              store: options.store,
              inspect,
              verify,
              submitted,
              allowedTools: perms.customToolNames,
              allowedArtifacts: perms.allowedArtifacts,
              allowedOrigin: options.baseUrl,
              targetRoute: options.route,
              adjacentRoutes: options.adjacentRoutes ?? [],
            }),
          };
        },
        log: options.log,
        role,
      });

      if (seenAgentIds.has(agent.handle.agentId)) {
        throw new Error(
          `Agent ${agent.handle.agentId} was reused. Every role/iteration must create a fresh agent.`,
        );
      }
      seenAgentIds.add(agent.handle.agentId);
      options.log.info(
        `${role}/${purpose} agent=${agent.handle.agentId} tools=${perms.tools.join(",")}`,
      );

      return {
        agentId: agent.handle.agentId,
        role,
        purpose,
        async send(prompt: string) {
          const submitted = agent.submitted;
          submitted.length = 0;
          const promptFile = path.join(
            options.store.paths.prompts,
            `${purpose}-${agent.handle.agentId}.md`,
          );
          writeFileSync(promptFile, redactSecrets(prompt), "utf8");
          const run = await agent.handle.send(prompt);
          options.log.info(`${role} run=${run.id}`);
          const transcript: string[] = [];
          let streamedUsage: TokenUsage | null = null;
          if (run.supports("stream")) {
            for await (const event of run.stream()) {
              if (event.type === "usage") {
                streamedUsage = {
                  inputTokens: event.usage.inputTokens,
                  outputTokens: event.usage.outputTokens,
                  totalTokens: event.usage.totalTokens,
                  cacheReadTokens: event.usage.cacheReadTokens,
                  cacheWriteTokens: event.usage.cacheWriteTokens,
                  reasoningTokens: event.usage.reasoningTokens,
                };
              } else if (event.type === "system" && event.model) {
                assertRunMatchesSelection({
                  expected: resolved.selection,
                  actual: event.model,
                  xhighParameterId: resolved.xhighParameterId,
                  xhighValue: resolved.xhighValue,
                  catalog: resolved.catalog,
                });
              } else if (event.type === "assistant") {
                for (const block of event.message.content) {
                  if (block.type === "text") transcript.push(block.text);
                }
              } else if (event.type !== "thinking") {
                options.store.appendVerbose({ role, purpose, type: event.type });
              }
            }
          }
          const result = await run.wait();
          assertRunMatchesSelection({
            expected: resolved.selection,
            actual: result.model ?? run.model,
            xhighParameterId: resolved.xhighParameterId,
            xhighValue: resolved.xhighValue,
            catalog: resolved.catalog,
          });
          if (result.status === "error") {
            throw new Error(
              `${role} run failed (${result.id}): ${result.error?.message ?? "unknown"}`,
            );
          }
          const rawUsage = result.usage
            ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
                cacheReadTokens: result.usage.cacheReadTokens,
                cacheWriteTokens: result.usage.cacheWriteTokens,
                reasoningTokens: result.usage.reasoningTokens,
              }
            : streamedUsage;
          const usageAccount = accountSdkUsage(rawUsage);
          const usage = rawUsage ?? emptyUsage();
          const text = redactSecrets(result.result ?? transcript.join(""));
          writeFileSync(
            path.join(options.store.paths.roles, `${purpose}-${run.id}.md`),
            text,
            "utf8",
          );
          return {
            agentId: agent.handle.agentId,
            runId: result.id,
            status: result.status,
            resultText: text,
            usage,
            usageAccount,
            durationMs: result.durationMs ?? 0,
            submitted: [...submitted],
            model: result.model ?? run.model,
          };
        },
        async close() {
          await agent.handle[Symbol.asyncDispose]();
        },
      };
    },
  };
}

export async function createAgentWithSandbox(options: {
  apiKey?: string;
  model: ModelSelection;
  cwd: string;
  tools: ToolName[];
  disallowedTools: ToolName[];
  sandboxPolicy: SandboxPolicy;
  createAgent?: CreateAgentFn;
  customTools: () => {
    submitted: ArtifactName[];
    tools: Record<string, SDKCustomTool>;
  };
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  role: string;
}) {
  const bundle = options.customTools();
  const local = buildLocalAgentCreateOptions({
    cwd: options.cwd,
    policy: options.sandboxPolicy,
    customTools: bundle.tools,
  });
  const createAgent = options.createAgent ?? Agent.create.bind(Agent);

  try {
    const handle = await createAgent({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      model: options.model,
      local,
      tools: options.tools,
      disallowedTools: options.disallowedTools,
    });
    return { handle, submitted: bundle.submitted, local };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSandboxUnavailableMessage(message)) {
      throw new Error(
        [
          `${options.role} SDK sandbox request was rejected after policy resolution.`,
          `requested=${options.sandboxPolicy.requested}`,
          `detected=${options.sandboxPolicy.detected.supported ? "supported" : "unsupported"}`,
          `effective=${options.sandboxPolicy.effective}`,
          `passed sandboxOptions=${JSON.stringify(local.sandboxOptions)}`,
          message,
        ].join(" "),
      );
    }
    if (error instanceof CursorAgentError) {
      throw new Error(
        `${options.role} startup failed: ${error.message} retryable=${error.isRetryable}`,
      );
    }
    throw error;
  }
}
