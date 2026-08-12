import { describe, expect, it } from "vitest";
import {
  formatLevelRange,
  ideasFromMovers,
  rewardRisk,
  riskRewardBarPercents,
} from "@/lib/reports/trade-ideas";

describe("trade idea math", () => {
  it("computes reward/risk from the entry-zone midpoint", () => {
    expect(rewardRisk(100, 102, 98, 107)).toBe(2);
  });

  it("returns null when risk is zero", () => {
    expect(rewardRisk(100, 100, 100, 110)).toBeNull();
  });

  it("formats entry ranges without a hyphen-minus", () => {
    expect(formatLevelRange(98.11, 98.71)).toBe("98.11 to 98.71");
  });

  it("scales the risk/reward bar to the idea's T1 R/R", () => {
    expect(riskRewardBarPercents(1)).toEqual({ riskPct: 50, rewardPct: 50 });
    expect(riskRewardBarPercents(2)).toEqual({ riskPct: 33, rewardPct: 67 });
  });

  it("builds ideas with two targets and R/R above 1.0 at T1", () => {
    const ideas = ideasFromMovers("premarket", "2026-08-10T12:30:00.000Z", [
      {
        ticker: "NVDA",
        price: 100,
        changePercent: 2,
        catalystSummary: "AI outlook",
        sourceIds: ["s1"],
      },
    ]);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.target1).toBeGreaterThan(100);
    expect(ideas[0]?.target2).toBeGreaterThan(ideas[0]!.target1);
    expect(ideas[0]?.rewardRisk1).not.toBeNull();
    expect(ideas[0]?.rewardRisk1 ?? 0).toBeGreaterThan(1);
    expect(ideas[0]?.rewardRisk2).not.toBeNull();
    expect(ideas[0]?.optionsStructure).toBeNull();
  });

  it("skips crypto and vol proxies in the playbook", () => {
    const ideas = ideasFromMovers("premarket", "2026-08-10T12:30:00.000Z", [
      {
        ticker: "BTC-USD",
        price: 97450,
        changePercent: 1.3,
        catalystSummary: "ETF flows",
        sourceIds: ["s1"],
      },
      {
        ticker: "VIXY",
        price: 14.2,
        changePercent: -4,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
      {
        ticker: "NVDA",
        price: 100,
        changePercent: 2,
        catalystSummary: "AI outlook",
        sourceIds: ["s2"],
      },
    ]);
    expect(
      ideas.every((i) => i.ticker !== "BTC-USD" && i.ticker !== "VIXY"),
    ).toBe(true);
    expect(ideas.some((i) => i.ticker === "NVDA")).toBe(true);
  });

  it("does not fill the playbook with uncited waits when two catalysts exist", () => {
    const ideas = ideasFromMovers("premarket", "2026-08-10T12:30:00.000Z", [
      {
        ticker: "VRT",
        price: 98,
        changePercent: 2.4,
        catalystSummary: "Cooling",
        sourceIds: ["s1"],
      },
      {
        ticker: "NVDA",
        price: 130,
        changePercent: 1.9,
        catalystSummary: "AI outlook",
        sourceIds: ["s2"],
      },
      {
        ticker: "AMD",
        price: 160,
        changePercent: 2.8,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
    ]);
    expect(ideas.filter((i) => i.strategyType === "wait_for_confirmation")).toHaveLength(
      0,
    );
    expect(ideas.some((i) => i.ticker === "VRT")).toBe(true);
    expect(ideas.some((i) => i.ticker === "NVDA")).toBe(true);
  });

  it("does not emit a pair when neither leg has a cited catalyst", () => {
    const ideas = ideasFromMovers("premarket", "2026-08-10T12:30:00.000Z", [
      {
        ticker: "AMD",
        price: 160,
        changePercent: 2.8,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
      {
        ticker: "CEG",
        price: 201,
        changePercent: 1.3,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
    ]);
    expect(ideas.some((i) => i.strategyType === "pair_long_short")).toBe(false);
  });

  it("emits a pair from a cited AI name even when vol and crypto also printed", () => {
    const ideas = ideasFromMovers("premarket", "2026-08-10T12:30:00.000Z", [
      {
        ticker: "VIXY",
        price: 14.2,
        changePercent: -4.05,
        catalystSummary: "x",
        sourceIds: [],
      },
      {
        ticker: "AMD",
        price: 162.7,
        changePercent: 2.84,
        catalystSummary: "x",
        sourceIds: [],
      },
      {
        ticker: "VRT",
        price: 98.41,
        changePercent: 2.4,
        catalystSummary: "Cooling",
        sourceIds: ["s1"],
      },
      {
        ticker: "SMH",
        price: 268,
        changePercent: 1.64,
        catalystSummary: "x",
        sourceIds: [],
      },
      {
        ticker: "AVGO",
        price: 171,
        changePercent: 1.37,
        catalystSummary: "x",
        sourceIds: [],
      },
      {
        ticker: "CEG",
        price: 201,
        changePercent: 1.33,
        catalystSummary: "x",
        sourceIds: [],
      },
    ]);
    const pair = ideas.find((i) => i.strategyType === "pair_long_short");
    expect(pair?.ticker).toBe("VRT");
    expect(pair?.pairLeg).toBe("AVGO");
  });

  it("prefers a cross-sleeve pair when session spreads are close", () => {
    const ideas = ideasFromMovers("midday", "2026-08-10T16:30:00.000Z", [
      {
        ticker: "VRT",
        price: 98.41,
        changePercent: 2.4,
        catalystSummary: "Cooling backlog",
        sourceIds: ["s1"],
      },
      {
        ticker: "CEG",
        price: 201.35,
        changePercent: 1.33,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
      {
        ticker: "AVGO",
        price: 171.22,
        changePercent: 1.37,
        catalystSummary: "No confirmed catalyst in evidence bundle",
        sourceIds: [],
      },
    ]);
    const pair = ideas.find((i) => i.strategyType === "pair_long_short");
    expect(pair?.ticker).toBe("VRT");
    expect(pair?.pairLeg).toBe("AVGO");
  });

  it("adds a pair idea from two movers without inventing options flow", () => {
    const ideas = ideasFromMovers("midday", "2026-08-10T16:30:00.000Z", [
      {
        ticker: "NVDA",
        price: 130,
        changePercent: 2,
        catalystSummary: "AI outlook",
        sourceIds: ["s1"],
      },
      {
        ticker: "AMD",
        price: 160,
        changePercent: 0.4,
        catalystSummary: "Roadmap",
        sourceIds: ["s2"],
      },
    ]);
    const pair = ideas.find((i) => i.strategyType === "pair_long_short");
    expect(pair?.ticker).toBe("NVDA");
    expect(pair?.pairLeg).toBe("AMD");
    expect(pair?.optionsStructure).toBeNull();
  });
});
