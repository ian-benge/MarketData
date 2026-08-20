import { afterEach, describe, expect, it } from "vitest";
import {
  demoOwnerTradeEmails,
  isMissingTradeEmailsColumn,
  resetDemoTradeEmails,
  setDemoOwnerTradeEmails,
  setViewerTradeEmails,
} from "./trade-emails";
import type { SessionUser } from "@/lib/auth/session";

afterEach(() => {
  resetDemoTradeEmails();
});

const demoUser: SessionUser = {
  id: "demo-member",
  email: "member@demo.local",
  displayName: "Demo Member",
  role: "member",
  firmId: "firm-1",
  isDemo: true,
};

describe("trade email preference", () => {
  it("defaults to sending desk email", () => {
    expect(demoOwnerTradeEmails("demo-member")).toBe(true);
  });

  it("detects a missing preference column so the toggle can fail closed", () => {
    expect(
      isMissingTradeEmailsColumn({
        code: "42703",
        message: "column profiles.position_trade_emails does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingTradeEmailsColumn({
        code: "PGRST204",
        message: "Could not find the 'position_trade_emails' column of 'profiles' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingTradeEmailsColumn({ code: "42501", message: "forbidden" })).toBe(
      false,
    );
  });

  it("persists a demo mute on the member account", async () => {
    await setViewerTradeEmails(demoUser, false);
    expect(demoOwnerTradeEmails("demo-member")).toBe(false);
    expect(demoOwnerTradeEmails("demo-admin")).toBe(true);
    setDemoOwnerTradeEmails("demo-member", true);
    expect(demoOwnerTradeEmails("demo-member")).toBe(true);
  });
});
