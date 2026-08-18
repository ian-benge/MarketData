import { describe, expect, it } from "vitest";
import {
  isGrok46,
  ModelUnavailableError,
  resolveGrok46Xhigh,
  modelParamsMatch,
  assertRunMatchesSelection,
  type CatalogModel,
} from "./model";

const grok46: CatalogModel = {
  id: "grok-4.6",
  displayName: "Grok 4.6",
  parameters: [
    {
      id: "reasoning_effort",
      values: [
        { value: "low" },
        { value: "medium" },
        { value: "high" },
        { value: "xhigh" },
      ],
    },
    {
      id: "fast",
      values: [{ value: "true", displayName: "Fast" }, { value: "false" }],
    },
  ],
  variants: [
    {
      displayName: "Grok 4.6 xhigh",
      isDefault: false,
      params: [
        { id: "reasoning_effort", value: "xhigh" },
        { id: "fast", value: "true" },
      ],
    },
  ],
};

describe("Grok 4.6 xhigh resolver", () => {
  it("pins grok-4.6 with catalog xhigh params and never Auto", () => {
    const resolved = resolveGrok46Xhigh([
      { id: "auto-smart", displayName: "Auto", parameters: [] },
      { id: "composer-2.5", displayName: "Composer 2.5", parameters: [] },
      grok46,
    ]);
    expect(resolved.selection.id).toBe("grok-4.6");
    expect(resolved.xhighParameterId).toBe("reasoning_effort");
    expect(resolved.xhighValue).toBe("xhigh");
    expect(resolved.selection.params).toEqual([
      { id: "reasoning_effort", value: "xhigh" },
      { id: "fast", value: "true" },
    ]);
  });

  it("rejects catalogs without Grok 4.6", () => {
    expect(() =>
      resolveGrok46Xhigh([
        {
          id: "grok-4.5",
          displayName: "Grok 4.5",
          parameters: [
            { id: "reasoning_effort", values: [{ value: "high" }, { value: "xhigh" }] },
          ],
        },
      ]),
    ).toThrow(ModelUnavailableError);
  });

  it("rejects Grok 4.6 without xhigh instead of downgrading", () => {
    expect(() =>
      resolveGrok46Xhigh([
        {
          id: "grok-4.6",
          displayName: "Grok 4.6",
          parameters: [
            {
              id: "reasoning_effort",
              values: [{ value: "low" }, { value: "medium" }, { value: "high" }],
            },
          ],
        },
      ]),
    ).toThrow(/xhigh/);
  });

  it("does not treat Auto ids as Grok 4.6", () => {
    expect(isGrok46({ id: "auto", displayName: "Auto" })).toBe(false);
    expect(isGrok46({ id: "auto-smart", displayName: "Grok 4.6 router" })).toBe(false);
  });

  it("fails closed when the runtime reports a different model", () => {
    const resolved = resolveGrok46Xhigh([grok46]);
    expect(
      modelParamsMatch(resolved.selection, { id: "auto", params: resolved.selection.params }, resolved.xhighParameterId, resolved.xhighValue).ok,
    ).toBe(false);
    expect(
      modelParamsMatch(
        resolved.selection,
        { id: "grok-4.6", params: [{ id: "reasoning_effort", value: "high" }] },
        resolved.xhighParameterId,
        resolved.xhighValue,
      ).ok,
    ).toBe(false);
    expect(() =>
      assertRunMatchesSelection({
        expected: resolved.selection,
        actual: { id: "composer-2.5" },
        xhighParameterId: resolved.xhighParameterId,
        xhighValue: resolved.xhighValue,
        catalog: [grok46],
      }),
    ).toThrow(ModelUnavailableError);
  });
});
