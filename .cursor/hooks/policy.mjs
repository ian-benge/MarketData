import { stdin } from "node:process";
import path from "node:path";

export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const ALWAYS_DENY = [
  /\bgit\s+push\s+.*(--force|-f|--force-with-lease)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bsupabase\s+db\s+reset\b/i,
  /\bvercel\s+[^\n]*(--prod|promote)\b/i,
  /\bnpm\s+publish\b/i,
  /\bwrangler\s+deploy\b/i,
  /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i,
];

const HARNESS_DENY = [
  /\bgit\s+push\b/i,
  /\bgit\s+merge\b/i,
  /\bgit\s+rebase\b/i,
  /\bgit\s+(checkout|switch)\s+(main|master)\b/i,
  /\bgh\s+pr\s+(create|merge|ready|edit)\b/i,
  /\bvercel\b/i,
  /\bsupabase\s+db\s+(push|reset)\b/i,
  /\bnpx\s+supabase\s+db\s+(push|reset)\b/i,
  /\bgit\s+clean\s+-[a-zA-Z]*f/i,
  /\b(rm|rmdir)\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--force)\b/i,
  /\bRemove-Item\b[\s\S]*(-Recurse|-Force)/i,
  /\b(del|erase)\s+\/[sS]/i,
  /\brd\s+\/s/i,
  /\b(printenv|Get-ChildItem\s+Env:)\b/i,
  /\b(type|Get-Content|cat)\s+[^\n]*\.env\b/i,
  /(^|[^\w])(>|>>)\s*['"]?[^'"\n]*\.env\b/i,
  /\b(CURSOR_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/i,
];

const SECRET_PATH =
  /(\.env(?:\.|$)|\.pem$|credentials\.json$|id_rsa$|id_ed25519$)/i;

export function isHarness(env = process.env) {
  return env.PAGE_HARNESS_ACTIVE === "1" || env.PAGE_HARNESS_ACTIVE === "true";
}

function deny(message) {
  return {
    permission: "deny",
    agent_message: message,
    user_message: message,
  };
}

export function decideShell(command = "", env = process.env) {
  const compact = String(command).replace(/\s+/g, " ").trim();
  for (const pattern of ALWAYS_DENY) {
    if (pattern.test(compact)) {
      return deny("This command is blocked by project hooks.");
    }
  }
  if (isHarness(env)) {
    for (const pattern of HARNESS_DENY) {
      if (pattern.test(compact)) {
        return deny(
          "The page improvement harness cannot merge, push, deploy, mutate hosted data, dump credentials, or run destructive filesystem commands.",
        );
      }
    }
  }
  return { permission: "allow" };
}

export function decideRead(filePath = "", env = process.env) {
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized.endsWith(".env.example")) return { permission: "allow" };
  if (SECRET_PATH.test(normalized) || /(^|\/)\.env(\.|$)/.test(normalized)) {
    return deny("Secret files are not agent-readable.");
  }
  if (isHarness(env) && !insideAllowedRoots(normalized, env)) {
    return deny("Reads outside the run worktree and artifact directories are blocked.");
  }
  return { permission: "allow" };
}

export function decideWrite(filePath = "", env = process.env) {
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized.endsWith(".env.example")) return { permission: "allow" };
  if (SECRET_PATH.test(normalized) || /(^|\/)\.env(\.|$)/.test(normalized)) {
    return deny("Secret files are not agent-writable.");
  }
  if (/(^|\/)\.git(\/|$)/.test(normalized) && !/\/\.gitkeep$/.test(normalized)) {
    return deny(".git mutation is blocked.");
  }
  if (isHarness(env) && !insideAllowedRoots(normalized, env, true)) {
    return deny("Writes outside the run worktree are blocked.");
  }
  return { permission: "allow" };
}

export function decidePreTool(input = {}, env = process.env) {
  const tool = String(input.tool_name || input.toolName || "");
  const toolInput = input.tool_input || input.toolInput || {};
  if (/^task$/i.test(tool) && isHarness(env)) {
    return deny("Subagents are disabled for harness runs. The orchestrator owns sequencing.");
  }
  const command = String(toolInput.command || input.command || "");
  if (command) {
    const shell = decideShell(command, env);
    if (shell.permission === "deny") return shell;
  }
  const filePath = String(
    toolInput.path ||
      toolInput.file_path ||
      toolInput.target_file ||
      toolInput.filePath ||
      "",
  );
  if (filePath && /^(write|edit|delete)$/i.test(tool)) {
    return decideWrite(filePath, env);
  }
  if (filePath && /^read$/i.test(tool)) {
    return decideRead(filePath, env);
  }
  return { permission: "allow" };
}

export function decideSubagent(env = process.env) {
  if (isHarness(env)) {
    return deny("Subagents are disabled unless the page harness orchestrator owns them.");
  }
  return { permission: "allow" };
}

export function decideMcp(input = {}, env = process.env) {
  if (!isHarness(env)) return { permission: "allow" };
  const name = String(input.tool_name || input.toolName || "");
  const allowed =
    name.toLowerCase().includes("submit_artifact") ||
    name.toLowerCase().includes("request_inspect") ||
    name.toLowerCase().includes("request_tests");
  if (!allowed) {
    return deny("Harness MCP is limited to submit_artifact, request_inspect, and request_tests.");
  }
  return { permission: "allow" };
}

function insideAllowedRoots(filePath, env, write = false) {
  const worktree = env.PAGE_HARNESS_WORKTREE;
  const runDir = env.PAGE_HARNESS_RUN_DIR;
  const cwd = env.PAGE_HARNESS_AGENT_CWD;
  const roots = [worktree, cwd, write ? null : runDir].filter(Boolean);
  if (roots.length === 0) return true;
  const target = path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
  return roots.some((root) => {
    const base = path.resolve(root).replace(/\\/g, "/").toLowerCase();
    return target === base || target.startsWith(`${base}/`);
  });
}
