import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  nodeModulesLinkEscapesProject,
  resolveLinkedInstallRoot,
  isHarnessTsconfigResidue,
} from "./isolation";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree node_modules link", () => {
  it("treats a real node_modules directory as in-project", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "phr-nm-"));
    temps.push(root);
    mkdirSync(path.join(root, "node_modules"));
    expect(nodeModulesLinkEscapesProject(root)).toBe(false);
    expect(resolveLinkedInstallRoot(root)).toBeNull();
  });

  it("detects a junction or symlink that points at a parent install", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "phr-nm-"));
    temps.push(root);
    const install = path.join(root, "install");
    const project = path.join(root, "worktree");
    mkdirSync(path.join(install, "node_modules"), { recursive: true });
    mkdirSync(project);
    writeFileSync(path.join(install, "node_modules", ".keep"), "");
    symlinkSync(
      path.join(install, "node_modules"),
      path.join(project, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(nodeModulesLinkEscapesProject(project)).toBe(true);
    expect(resolveLinkedInstallRoot(project)).toBe(install);
  });
});

describe("harness bootstrap residue", () => {
  it("recognizes Next harness type includes as tsconfig residue", () => {
    const head = JSON.stringify({
      compilerOptions: { strict: true },
      include: [".next-e2e/types/**/*.ts"],
    });
    const current = JSON.stringify({
      compilerOptions: { strict: true },
      include: [".next-e2e/types/**/*.ts", ".next-harness/types/**/*.ts"],
    });
    expect(isHarnessTsconfigResidue(head, current)).toBe(true);
    expect(
      isHarnessTsconfigResidue(
        head,
        JSON.stringify({
          compilerOptions: { strict: false },
          include: [".next-e2e/types/**/*.ts", ".next-harness/types/**/*.ts"],
        }),
      ),
    ).toBe(false);
  });
});
