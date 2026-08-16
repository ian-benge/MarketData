import { describe, expect, it } from "vitest";
import {
  EMAIL_CHANNELS,
  bookAlertEmailDisabled,
  reportEmailDisabled,
} from "./policy";

describe("email notification policy", () => {
  it("keeps only position open/close mail live", () => {
    expect(EMAIL_CHANNELS.positions).toBe(true);
    expect(reportEmailDisabled()).toBe(true);
    expect(bookAlertEmailDisabled()).toBe(true);
  });
});
