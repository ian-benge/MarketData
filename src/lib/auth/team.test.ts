import { describe, expect, it } from "vitest";
import { CreateTeamUserSchema } from "./team";

describe("CreateTeamUserSchema", () => {
  it("requires a usable password and lowercases email", () => {
    const parsed = CreateTeamUserSchema.parse({
      email: "  New.User@Example.com ",
      password: "desk-pass-1",
    });
    expect(parsed.email).toBe("new.user@example.com");
    expect(parsed.role).toBe("member");
    expect(parsed.displayName).toBeUndefined();
  });

  it("rejects short passwords", () => {
    const parsed = CreateTeamUserSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an admin role and display name", () => {
    const parsed = CreateTeamUserSchema.parse({
      email: "lead@example.com",
      displayName: "Desk Lead",
      role: "admin",
      password: "desk-pass-1",
    });
    expect(parsed.displayName).toBe("Desk Lead");
    expect(parsed.role).toBe("admin");
  });
});
