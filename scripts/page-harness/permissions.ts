import type { ToolName } from "@cursor/sdk";
import type { ArtifactName } from "./schemas";

export type AgentPurpose =
  | "planner"
  | "contract_reviewer"
  | "builder"
  | "evaluator"
  | "skeptic";

export const SEARCH_TOOLS: ToolName[] = [
  "read",
  "grep",
  "glob",
  "ls",
  "semSearch",
];

export const ALWAYS_DISALLOWED: ToolName[] = [
  "task",
  "webSearch",
  "webFetch",
  "generateImage",
  "applyAgentDiff",
  "askQuestion",
  "await",
];

export const CUSTOM_TOOL_NAMES = [
  "submit_artifact",
  "request_inspect",
  "request_tests",
] as const;

export type CustomToolName = (typeof CUSTOM_TOOL_NAMES)[number];

export type RolePermissions = {
  purpose: AgentPurpose;
  tools: ToolName[];
  disallowedTools: ToolName[];
  customToolNames: CustomToolName[];
  allowedArtifacts: ArtifactName[];
  readOnly: boolean;
};

export function rolePermissions(purpose: AgentPurpose): RolePermissions {
  switch (purpose) {
    case "planner":
      return {
        purpose,
        tools: [...SEARCH_TOOLS, "mcp"],
        disallowedTools: ["edit", "delete", "shell", "readLints", ...ALWAYS_DISALLOWED],
        customToolNames: ["submit_artifact", "request_inspect"],
        allowedArtifacts: ["baseline", "page-map", "contract"],
        readOnly: true,
      };
    case "contract_reviewer":
      return {
        purpose,
        tools: [...SEARCH_TOOLS, "mcp"],
        disallowedTools: ["edit", "delete", "shell", "readLints", ...ALWAYS_DISALLOWED],
        customToolNames: ["submit_artifact"],
        allowedArtifacts: ["contract-decision"],
        readOnly: true,
      };
    case "builder":
      return {
        purpose,
        tools: [
          ...SEARCH_TOOLS,
          "edit",
          "delete",
          "shell",
          "readLints",
          "mcp",
          "updateTodos",
        ],
        disallowedTools: [...ALWAYS_DISALLOWED],
        customToolNames: ["submit_artifact", "request_tests"],
        allowedArtifacts: ["builder-summary", "failed-approach"],
        readOnly: false,
      };
    case "evaluator":
      return {
        purpose,
        tools: [...SEARCH_TOOLS, "mcp"],
        disallowedTools: ["edit", "delete", "shell", "readLints", ...ALWAYS_DISALLOWED],
        customToolNames: ["submit_artifact", "request_inspect"],
        allowedArtifacts: ["evaluation"],
        readOnly: true,
      };
    case "skeptic":
      return {
        purpose,
        tools: [...SEARCH_TOOLS, "mcp"],
        disallowedTools: ["edit", "delete", "shell", "readLints", ...ALWAYS_DISALLOWED],
        customToolNames: ["submit_artifact", "request_inspect"],
        allowedArtifacts: ["skeptic"],
        readOnly: true,
      };
    default: {
      const exhaustive: never = purpose;
      throw new Error(`Unknown agent purpose: ${exhaustive}`);
    }
  }
}

export function shouldEnableSandbox(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (env.PAGE_HARNESS_SANDBOX === "0") return false;
  if (env.PAGE_HARNESS_SANDBOX === "1") return true;
  return platform !== "win32";
}

export function purposeForRole(
  role: "planner" | "builder" | "evaluator" | "skeptic",
  contractReview: boolean,
): AgentPurpose {
  if (contractReview && (role === "builder" || role === "evaluator")) {
    return "contract_reviewer";
  }
  if (role === "planner") return "planner";
  if (role === "builder") return "builder";
  if (role === "evaluator") return "evaluator";
  return "skeptic";
}
