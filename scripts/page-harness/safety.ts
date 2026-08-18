export type ShellDecision = {
  permission: "allow" | "deny";
  reason: string;
  agent_message?: string;
  user_message?: string;
};

const ALWAYS_DENY: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\s+.*(--force|-f|--force-with-lease)\b/i, reason: "force-push is blocked" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "hard reset is blocked for agents" },
  { pattern: /\bgit\s+checkout\s+(-B|--orphan)\s+(main|master)\b/i, reason: "replacing main/master is blocked" },
  { pattern: /\bsupabase\s+db\s+reset\b/i, reason: "hosted database reset is forbidden" },
  { pattern: /\bvercel\s+[^\n]*(--prod|promote)\b/i, reason: "production deploy is blocked" },
  { pattern: /\bnpm\s+publish\b/i, reason: "npm publish is blocked" },
  { pattern: /\bwrangler\s+deploy\b/i, reason: "cloudflare deploy is blocked" },
  { pattern: /\bkubectl\s+(apply|delete|replace)\b/i, reason: "cluster mutation is blocked" },
  { pattern: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i, reason: "destructive SQL is blocked" },
  { pattern: /\baws\s+s3\s+(rm|rb)\b/i, reason: "remote object deletion is blocked" },
];

const HARNESS_DENY: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\b/i, reason: "harness must not push" },
  { pattern: /\bgit\s+merge\b/i, reason: "harness must not merge" },
  { pattern: /\bgit\s+rebase\b/i, reason: "harness must not rebase onto shared branches" },
  { pattern: /\bgit\s+(checkout|switch)\s+(main|master)\b/i, reason: "harness must not switch to protected branches" },
  { pattern: /\bgh\s+pr\s+(create|merge|ready|edit)\b/i, reason: "harness must not open or merge pull requests" },
  { pattern: /\bvercel\b/i, reason: "harness must not deploy" },
  { pattern: /\bsupabase\s+db\s+(push|reset|lint)\b/i, reason: "harness must not mutate hosted schema" },
  { pattern: /\bnpx\s+supabase\s+db\s+(push|reset)\b/i, reason: "harness must not mutate hosted schema" },
  { pattern: /\bdocker\s+push\b/i, reason: "harness must not publish images" },
  { pattern: /\bfly(\.exe)?\s+deploy\b/i, reason: "harness must not deploy" },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, reason: "destructive git clean is blocked" },
  { pattern: /\b(rm|rmdir)\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--force)\b/i, reason: "destructive filesystem delete is blocked" },
  { pattern: /\bRemove-Item\b[\s\S]*(-Recurse|-Force)/i, reason: "destructive PowerShell delete is blocked" },
  { pattern: /\b(del|erase)\s+\/[sS]/i, reason: "recursive delete is blocked" },
  { pattern: /\brd\s+\/s/i, reason: "recursive rmdir is blocked" },
  { pattern: /\bformat\s+[a-zA-Z]:/i, reason: "disk format is blocked" },
  { pattern: /\b(printenv|Get-ChildItem\s+Env:)\b/i, reason: "credential dump is blocked" },
  { pattern: /\b(type|Get-Content|cat|less|more)\s+[^\n]*\.env\b/i, reason: ".env access is blocked" },
  { pattern: /(^|[^\w])(>|>>)\s*['"]?[^'"\n]*\.env\b/i, reason: ".env writes are blocked" },
  { pattern: /\b(CURSOR_API_KEY|SUPABASE_SERVICE_ROLE_KEY|AWS_SECRET_ACCESS_KEY)\b/i, reason: "credential-bearing command is blocked" },
];

const SECRET_PATH =
  /(\.env(?:\.|$)|\.pem$|credentials\.json$|id_rsa$|id_ed25519$|service[_-]?account.*\.json$)/i;

export function isHarnessActive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PAGE_HARNESS_ACTIVE === "1" || env.PAGE_HARNESS_ACTIVE === "true";
}

export function decideShellCommand(
  command: string,
  env: Record<string, string | undefined> = process.env,
): ShellDecision {
  const compact = command.replace(/\s+/g, " ").trim();
  for (const rule of ALWAYS_DENY) {
    if (rule.pattern.test(compact)) {
      return deny(rule.reason);
    }
  }
  if (isHarnessActive(env)) {
    for (const rule of HARNESS_DENY) {
      if (rule.pattern.test(compact)) {
        return deny(rule.reason);
      }
    }
  }
  return { permission: "allow", reason: "ok" };
}

export function decideReadPath(filePath: string): ShellDecision {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".env.example")) {
    return { permission: "allow", reason: "example env is not secret" };
  }
  if (SECRET_PATH.test(normalized) || /(^|\/)\.env(\.|$)/.test(normalized)) {
    return deny("secret file is not agent-readable");
  }
  return { permission: "allow", reason: "ok" };
}

export function decideWritePath(filePath: string): ShellDecision {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".env.example")) {
    return { permission: "allow", reason: "example env may be documented" };
  }
  if (SECRET_PATH.test(normalized) || /(^|\/)\.env(\.|$)/.test(normalized)) {
    return deny("secret file is not agent-writable");
  }
  if (/(^|\/)\.git(\/|$)/.test(normalized) && !/\/\.gitkeep$/.test(normalized)) {
    return deny(".git mutation is not allowed from agents");
  }
  return { permission: "allow", reason: "ok" };
}

export function isAllowedMcpTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name.includes("submit_artifact") ||
    name.includes("request_inspect") ||
    name.includes("request_tests")
  );
}

function deny(reason: string): ShellDecision {
  return {
    permission: "deny",
    reason,
    agent_message: reason,
    user_message: reason,
  };
}

export const SHALLOW_SIGNALS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bcoming soon\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\bnot implemented\b/i,
  /\bstub(?:bed)?\b/i,
  /\bdisplay[- ]only\b/i,
];

export function findShallowSignals(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of SHALLOW_SIGNALS) {
    const match = text.match(pattern);
    if (match) hits.push(match[0]);
  }
  return [...new Set(hits)];
}
