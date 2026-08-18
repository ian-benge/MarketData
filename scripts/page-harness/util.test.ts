import { describe, expect, it } from "vitest";
import { resolveSpawn } from "./util";

describe("runCommand spawn", () => {
  it("wraps Windows cmd scripts so Node does not throw EINVAL", () => {
    const resolved = resolveSpawn("npx.cmd", ["tsc", "--noEmit"], "win32", "cmd.exe");
    expect(resolved.command).toBe("cmd.exe");
    expect(resolved.args.slice(0, 4)).toEqual(["/d", "/s", "/c", "npx.cmd"]);
    expect(resolved.args.slice(4)).toEqual(["tsc", "--noEmit"]);
  });

  it("leaves real executables unchanged", () => {
    expect(resolveSpawn("git", ["status"], "win32")).toEqual({
      command: "git",
      args: ["status"],
    });
    expect(resolveSpawn("npx.cmd", ["vitest"], "linux")).toEqual({
      command: "npx.cmd",
      args: ["vitest"],
    });
  });
});
