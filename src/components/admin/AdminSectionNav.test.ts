import { describe, expect, it } from "vitest";
import {
  LIVE_ADMIN_SECTIONS,
  normalizeAdminSection,
} from "@/components/admin/AdminSectionNav";

describe("live admin sections", () => {
  it("keeps production on the instrument queue and ignores fixture tabs", () => {
    expect(LIVE_ADMIN_SECTIONS).toEqual(["instruments"]);
    expect(normalizeAdminSection("team", LIVE_ADMIN_SECTIONS)).toBe("instruments");
    expect(normalizeAdminSection("instruments", LIVE_ADMIN_SECTIONS)).toBe(
      "instruments",
    );
    expect(normalizeAdminSection(null)).toBe("team");
  });
});
