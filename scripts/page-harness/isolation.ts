import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import { git, requireGitOk, runCommand, shortId } from "./util";
import { slugForRoute } from "./catalog";

export type IsolationMode = "worktree" | "branch" | "none";

export type IsolatedWorkspace = {
  mode: IsolationMode;
  repoRoot: string;
  agentCwd: string;
  branchName: string | null;
  worktreePath: string | null;
  created: boolean;
  baseSha: string | null;
};

export const RUNTIME_OVERLAY_FILES = ["next.config.ts", "playwright.config.ts"] as const;

export async function createIsolation(options: {
  repoRoot: string;
  route: string;
  mode: IsolationMode;
  runId: string;
}): Promise<IsolatedWorkspace> {
  const { repoRoot, route, mode, runId } = options;
  const slug = slugForRoute(route);
  const branchName = `page-improve/${slug}-${runId}`;

  const sha = await git(["rev-parse", "HEAD"], repoRoot);
  requireGitOk(sha, "read base SHA");
  const baseSha = sha.stdout.trim() || null;

  if (mode === "none") {
    return {
      mode,
      repoRoot,
      agentCwd: repoRoot,
      branchName: null,
      worktreePath: null,
      created: false,
      baseSha,
    };
  }

  const head = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  requireGitOk(head, "read current branch");

  if (mode === "branch") {
    const checkout = await git(["checkout", "-b", branchName], repoRoot);
    requireGitOk(checkout, `create branch ${branchName}`);
    return {
      mode,
      repoRoot,
      agentCwd: repoRoot,
      branchName,
      worktreePath: null,
      created: true,
      baseSha,
    };
  }

  const worktreePath = path.join(repoRoot, ".worktrees", `page-improve-${runId}`);
  mkdirSync(path.dirname(worktreePath), { recursive: true });
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree already exists: ${worktreePath}`);
  }
  const added = await git(
    ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
    repoRoot,
    60_000,
  );
  requireGitOk(added, "create git worktree");
  linkWorkspaceDependencies(repoRoot, worktreePath);
  return {
    mode,
    repoRoot,
    agentCwd: worktreePath,
    branchName,
    worktreePath,
    created: true,
    baseSha,
  };
}

export async function attachIsolation(saved: IsolatedWorkspace): Promise<IsolatedWorkspace> {
  if (saved.mode === "worktree") {
    if (!saved.worktreePath || !existsSync(saved.worktreePath)) {
      throw new Error(
        `Cannot resume: worktree ${saved.worktreePath ?? "(missing)"} is gone. Start a new run.`,
      );
    }
  }
  return saved;
}

export function nodeModulesLinkEscapesProject(projectDir: string): boolean {
  const dir = path.join(projectDir, "node_modules");
  if (!existsSync(dir)) return false;
  try {
    if (!lstatSync(dir).isSymbolicLink()) return false;
    const resolved = realpathSync(dir);
    const rel = path.relative(path.resolve(projectDir), resolved);
    return rel.startsWith("..") || path.isAbsolute(rel);
  } catch {
    return true;
  }
}

export function resolveLinkedInstallRoot(projectDir: string): string | null {
  const dir = path.join(projectDir, "node_modules");
  if (!nodeModulesLinkEscapesProject(projectDir)) return null;
  try {
    return path.dirname(realpathSync(dir));
  } catch {
    return null;
  }
}

export function linkWorkspaceDependencies(repoRoot: string, worktreePath: string): void {
  const nodeModules = path.join(repoRoot, "node_modules");
  const dest = path.join(worktreePath, "node_modules");
  if (existsSync(nodeModules) && !existsSync(dest)) {
    // Junction is required so agents can resolve packages. Turbopack treats this
    // as an out-of-root symlink; startDemoServer expands turbopack.root or
    // falls back to webpack.
    symlinkSync(nodeModules, dest, "junction");
  }
  for (const relative of ["next.config.ts", "playwright.config.ts"] as const) {
    const src = path.join(repoRoot, relative);
    const target = path.join(worktreePath, relative);
    if (existsSync(src)) {
      copyFileSync(src, target);
    }
  }
  for (const envName of [".env.local", ".env"] as const) {
    const src = path.join(repoRoot, envName);
    const target = path.join(worktreePath, envName);
    if (existsSync(src) && !existsSync(target)) {
      copyFileSync(src, target);
    }
  }
}

export async function revertRuntimeOverlaysToHead(cwd: string): Promise<void> {
  for (const relative of RUNTIME_OVERLAY_FILES) {
    const target = path.join(cwd, relative);
    if (!existsSync(target)) continue;
    await git(["checkout", "HEAD", "--", relative], cwd);
  }
  await revertHarnessTsconfigResidue(cwd);
}

export function isHarnessTsconfigResidue(headText: string, currentText: string): boolean {
  try {
    const head = JSON.parse(headText) as { include?: string[] };
    const current = JSON.parse(currentText) as { include?: string[] };
    const headInclude = new Set(head.include ?? []);
    const extra = (current.include ?? []).filter((row) => !headInclude.has(row));
    if (extra.some((row) => !row.includes(".next-harness"))) return false;
    const headRest = { ...head, include: undefined };
    const currentRest = { ...current, include: undefined };
    return JSON.stringify(headRest) === JSON.stringify(currentRest);
  } catch {
    return false;
  }
}

async function revertHarnessTsconfigResidue(cwd: string): Promise<void> {
  const relative = "tsconfig.json";
  const currentPath = path.join(cwd, relative);
  if (!existsSync(currentPath)) return;
  const shown = await git(["show", `HEAD:${relative}`], cwd);
  if (shown.code !== 0) return;
  if (isHarnessTsconfigResidue(shown.stdout, readFileSync(currentPath, "utf8"))) {
    await git(["checkout", "HEAD", "--", relative], cwd);
  }
}

export async function ensureBaselineMirror(
  isolation: IsolatedWorkspace,
): Promise<string | null> {
  if (isolation.mode !== "worktree" || !isolation.worktreePath || !isolation.baseSha) {
    return null;
  }
  const mirrorPath = `${isolation.worktreePath}-baseline`;
  if (!existsSync(mirrorPath)) {
    const added = await git(
      ["worktree", "add", "--detach", mirrorPath, isolation.baseSha],
      isolation.repoRoot,
      60_000,
    );
    if (added.code !== 0) return null;
    linkWorkspaceDependencies(isolation.repoRoot, mirrorPath);
  }
  return mirrorPath;
}

export async function checkpoint(
  cwd: string,
  message: string,
  options: { repoRoot?: string } = {},
): Promise<{ commit: string | null; dirty: boolean }> {
  await revertRuntimeOverlaysToHead(cwd);
  await git(["add", "-A"], cwd);
  const status = await git(["status", "--porcelain"], cwd);
  if (!status.stdout.trim()) {
    const head = await git(["rev-parse", "HEAD"], cwd);
    if (options.repoRoot) linkWorkspaceDependencies(options.repoRoot, cwd);
    return { commit: head.stdout.trim() || null, dirty: false };
  }
  const committed = await runCommand("git", ["commit", "-m", message], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Page Improve Harness",
      GIT_AUTHOR_EMAIL: "harness@local",
      GIT_COMMITTER_NAME: "Page Improve Harness",
      GIT_COMMITTER_EMAIL: "harness@local",
    },
  });
  if (committed.code !== 0) {
    throw new Error(`Checkpoint commit failed:\n${committed.stderr || committed.stdout}`);
  }
  const head = await git(["rev-parse", "HEAD"], cwd);
  if (options.repoRoot) linkWorkspaceDependencies(options.repoRoot, cwd);
  return { commit: head.stdout.trim(), dirty: true };
}

export async function currentHead(cwd: string): Promise<string> {
  const head = await git(["rev-parse", "HEAD"], cwd);
  requireGitOk(head, "read worktree HEAD");
  const sha = head.stdout.trim();
  if (!sha) throw new Error(`Could not read HEAD SHA in ${cwd}`);
  return sha;
}

export async function restoreCommit(cwd: string, commit: string): Promise<void> {
  const reset = await git(["reset", "--hard", commit], cwd);
  requireGitOk(reset, `restore checkpoint ${commit}`);
  const clean = await git(["clean", "-fd", "-e", ".env.local", "-e", ".env"], cwd);
  requireGitOk(clean, "clean untracked files after restore");
}

export async function changedFiles(cwd: string, from: string, to = "HEAD"): Promise<string[]> {
  const diff = await git(["diff", "--name-only", from, to], cwd);
  requireGitOk(diff, "list changed files");
  return diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function dirtyFiles(cwd: string): Promise<string[]> {
  const status = await git(["status", "--porcelain", "-uall"], cwd);
  requireGitOk(status, "read worktree dirty files");
  return status.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*/, ""))
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/.* -> /, "").trim())
    .filter(Boolean);
}

export function makeRunId(route: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${slugForRoute(route)}-${stamp}-${shortId()}`;
}

export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const removed = await git(["worktree", "remove", "--force", worktreePath], repoRoot, 60_000);
  if (removed.code !== 0 && existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true });
    await git(["worktree", "prune"], repoRoot);
  }
}
