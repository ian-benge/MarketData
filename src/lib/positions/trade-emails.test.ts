import { afterEach, describe, expect, it } from "vitest";
import {
  demoOwnerTradeEmails,
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

  it("persists a demo mute on the member account", async () => {
    await setViewerTradeEmails(demoUser, false);
    expect(demoOwnerTradeEmails("demo-member")).toBe(false);
    expect(demoOwnerTradeEmails("demo-admin")).toBe(true);
    setDemoOwnerTradeEmails("demo-member", true);
    expect(demoOwnerTradeEmails("demo-member")).toBe(true);
  });
});
