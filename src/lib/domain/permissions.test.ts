import { describe, expect, it } from "vitest";
import {
  canApproveProposals,
  canConfigureProviders,
  canEmailOnDemandReport,
  canGenerateOnDemandReport,
  canInvite,
  canRetryJobs,
  canSubmitProposals,
  hasPermission,
} from "@/lib/domain/permissions";

describe("permissions", () => {
  it("allows members core research actions", () => {
    expect(canGenerateOnDemandReport("member")).toBe(true);
    expect(canSubmitProposals("member")).toBe(true);
    expect(hasPermission("member", "editWatchlists")).toBe(true);
    expect(hasPermission("member", "editPositions")).toBe(true);
  });

  it("blocks members from admin capabilities", () => {
    expect(canInvite("member")).toBe(false);
    expect(canApproveProposals("member")).toBe(false);
    expect(canEmailOnDemandReport("member")).toBe(false);
    expect(canConfigureProviders("member")).toBe(false);
    expect(canRetryJobs("member")).toBe(false);
  });

  it("allows admins elevated capabilities", () => {
    expect(canInvite("admin")).toBe(true);
    expect(canApproveProposals("admin")).toBe(true);
    expect(canEmailOnDemandReport("admin")).toBe(true);
    expect(canConfigureProviders("admin")).toBe(true);
    expect(canRetryJobs("admin")).toBe(true);
  });
});
