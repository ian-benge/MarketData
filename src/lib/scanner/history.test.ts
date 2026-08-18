import { describe, expect, it } from "vitest";
import { profileFromHistory } from "@/lib/scanner/history";

describe("scanner history profiles", () => {
  it("flags former runners from repeated extreme days", () => {
    const flags = profileFromHistory([
      { sessionDate: "2026-06-01", changeFromClosePct: 32, gapPercent: 2, changeFromOpenPct: 10, halted: false, offeringHeadline: false },
      { sessionDate: "2026-06-08", changeFromClosePct: -28, gapPercent: 1, changeFromOpenPct: -5, halted: false, offeringHeadline: false },
      { sessionDate: "2026-06-15", changeFromClosePct: 4, gapPercent: 0, changeFromOpenPct: 1, halted: false, offeringHeadline: false },
    ]);
    expect(flags.formerRunner).toBe(true);
    expect(flags.extremeMoveDays90d).toBe(2);
  });

  it("flags gap-and-fade when most large gaps give back", () => {
    const flags = profileFromHistory([
      { sessionDate: "2026-06-01", changeFromClosePct: 2, gapPercent: 12, changeFromOpenPct: -6, halted: false, offeringHeadline: false },
      { sessionDate: "2026-06-02", changeFromClosePct: 1, gapPercent: 9, changeFromOpenPct: -5, halted: false, offeringHeadline: false },
      { sessionDate: "2026-06-03", changeFromClosePct: 3, gapPercent: 10, changeFromOpenPct: -4, halted: false, offeringHeadline: false },
      { sessionDate: "2026-06-04", changeFromClosePct: 8, gapPercent: 11, changeFromOpenPct: 2, halted: false, offeringHeadline: false },
    ]);
    expect(flags.gapAndFade).toBe(true);
  });

  it("flags offering risk and frequent halts", () => {
    const flags = profileFromHistory([
      { sessionDate: "2026-06-01", changeFromClosePct: -12, gapPercent: -4, changeFromOpenPct: -3, halted: true, offeringHeadline: true },
      { sessionDate: "2026-06-10", changeFromClosePct: -8, gapPercent: 0, changeFromOpenPct: -2, halted: true, offeringHeadline: true },
    ]);
    expect(flags.offeringRisk).toBe(true);
    expect(flags.frequentHalt).toBe(true);
    expect(flags.haltCount90d).toBe(2);
  });
});
