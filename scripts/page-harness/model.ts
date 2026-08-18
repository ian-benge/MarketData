export type CatalogParameter = {
  id: string;
  displayName?: string;
  values: Array<{ value: string; displayName?: string }>;
};

export type CatalogVariant = {
  params: Array<{ id: string; value: string }>;
  displayName: string;
  description?: string;
  isDefault?: boolean;
};

export type CatalogModel = {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
  parameters?: CatalogParameter[];
  variants?: CatalogVariant[];
};

export type ModelSelection = {
  id: string;
  params?: Array<{ id: string; value: string }>;
};

export class ModelUnavailableError extends Error {
  readonly catalogSummary: string;

  constructor(message: string, catalogSummary: string) {
    super(message);
    this.name = "ModelUnavailableError";
    this.catalogSummary = catalogSummary;
  }
}

const GROK_46 = /grok[- _.]?4\.?6/i;
const GROK_45_ONLY = /grok[- _.]?4\.?5/i;
const AUTO = /^(auto|auto-smart|default)$/i;

export function isGrok46(model: CatalogModel): boolean {
  const haystack = [model.id, model.displayName, ...(model.aliases ?? [])].join(" ");
  if (AUTO.test(model.id)) return false;
  if (GROK_45_ONLY.test(haystack) && !GROK_46.test(haystack)) return false;
  return GROK_46.test(haystack);
}

export function summarizeCatalog(models: CatalogModel[]): string {
  if (models.length === 0) return "(empty catalog)";
  return models
    .map((model) => {
      const params =
        model.parameters
          ?.map((parameter) => {
            const values = parameter.values.map((value) => value.value).join("|");
            return `${parameter.id}=[${values}]`;
          })
          .join(", ") ?? "no-params";
      const variants =
        model.variants?.map((variant) => variant.displayName).join(", ") ?? "no-variants";
      return `${model.id} (${model.displayName}): ${params}; variants: ${variants}`;
    })
    .join("\n");
}

function findXhighParameter(model: CatalogModel): {
  parameter: CatalogParameter;
  value: string;
} | null {
  for (const parameter of model.parameters ?? []) {
    const xhigh = parameter.values.find(
      (entry) =>
        entry.value.toLowerCase() === "xhigh" ||
        (entry.displayName ?? "").toLowerCase() === "xhigh" ||
        (entry.displayName ?? "").toLowerCase().includes("xhigh"),
    );
    if (xhigh) return { parameter, value: xhigh.value };
  }
  return null;
}

function paramsFromDefaultVariant(model: CatalogModel): Array<{ id: string; value: string }> {
  const def = model.variants?.find((variant) => variant.isDefault) ?? model.variants?.[0];
  return def ? def.params.map((param) => ({ ...param })) : [];
}

function applyXhigh(
  model: CatalogModel,
  xhigh: { parameter: CatalogParameter; value: string },
): Array<{ id: string; value: string }> {
  const variant = model.variants?.find((entry) =>
    entry.params.some(
      (param) => param.id === xhigh.parameter.id && param.value === xhigh.value,
    ),
  );
  if (variant) return variant.params.map((param) => ({ ...param }));

  const params = paramsFromDefaultVariant(model);
  const existing = params.find((param) => param.id === xhigh.parameter.id);
  if (existing) existing.value = xhigh.value;
  else params.push({ id: xhigh.parameter.id, value: xhigh.value });

  for (const parameter of model.parameters ?? []) {
    if (params.some((param) => param.id === parameter.id)) continue;
    const first = parameter.values[0];
    if (first) params.push({ id: parameter.id, value: first.value });
  }
  return params;
}

export function resolveGrok46Xhigh(models: CatalogModel[]): {
  selection: ModelSelection;
  matched: CatalogModel;
  xhighParameterId: string;
  xhighValue: string;
} {
  const grokModels = models.filter(isGrok46);
  const summary = summarizeCatalog(models);

  if (grokModels.length === 0) {
    throw new ModelUnavailableError(
      "Grok 4.6 is not in Cursor.models.list() for this API key. Refusing to downgrade, route through Auto, or substitute another model.",
      summary,
    );
  }

  const usable: Array<{
    model: CatalogModel;
    xhigh: { parameter: CatalogParameter; value: string };
  }> = [];
  for (const model of grokModels) {
    const xhigh = findXhighParameter(model);
    if (xhigh) usable.push({ model, xhigh });
  }

  if (usable.length === 0) {
    throw new ModelUnavailableError(
      "Grok 4.6 is available but xhigh reasoning effort is not. Refusing to silently use high/medium/low or any other effort.",
      summarizeCatalog(grokModels),
    );
  }

  usable.sort((a, b) => {
    const rank = (id: string) => {
      if (id === "grok-4.6") return 0;
      if (id === "grok-4.6-fast" || id.endsWith("-fast")) return 2;
      return 1;
    };
    return rank(a.model.id) - rank(b.model.id);
  });

  const chosen = usable[0];
  const params = applyXhigh(chosen.model, chosen.xhigh);
  const effort = params.find((param) => param.id === chosen.xhigh.parameter.id);
  if (!effort || effort.value !== chosen.xhigh.value) {
    throw new ModelUnavailableError(
      "Internal resolver error: xhigh was not pinned on the selected Grok 4.6 params.",
      summarizeCatalog(grokModels),
    );
  }

  return {
    selection: { id: chosen.model.id, params },
    matched: chosen.model,
    xhighParameterId: chosen.xhigh.parameter.id,
    xhighValue: chosen.xhigh.value,
  };
}

export type ResolvedGrok46 = {
  selection: ModelSelection;
  matched: CatalogModel;
  xhighParameterId: string;
  xhighValue: string;
  catalog: CatalogModel[];
};

export async function listAndResolveGrok46Xhigh(apiKey?: string): Promise<ResolvedGrok46> {
  const { Cursor } = await import("@cursor/sdk");
  const catalog = (await Cursor.models.list(
    apiKey ? { apiKey } : undefined,
  )) as CatalogModel[];
  const resolved = resolveGrok46Xhigh(catalog);
  return { ...resolved, catalog };
}

export function modelParamsMatch(
  expected: ModelSelection,
  actual: ModelSelection | undefined,
  xhighParameterId: string,
  xhighValue: string,
): { ok: boolean; reason?: string } {
  if (!actual) {
    return { ok: false, reason: "SDK run did not report a model selection" };
  }
  if (AUTO.test(actual.id) || actual.id.toLowerCase() === "default") {
    return { ok: false, reason: `runtime model ${actual.id} is Auto/default` };
  }
  if (actual.id !== expected.id) {
    return {
      ok: false,
      reason: `runtime model ${actual.id} != requested ${expected.id}`,
    };
  }
  const effort = actual.params?.find((param) => param.id === xhighParameterId);
  if (!effort || effort.value !== xhighValue) {
    return {
      ok: false,
      reason: `runtime ${xhighParameterId}=${effort?.value ?? "(missing)"} != ${xhighValue}`,
    };
  }
  return { ok: true };
}

export function assertRunMatchesSelection(options: {
  expected: ModelSelection;
  actual: ModelSelection | undefined;
  xhighParameterId: string;
  xhighValue: string;
  catalog: CatalogModel[];
}): void {
  const match = modelParamsMatch(
    options.expected,
    options.actual,
    options.xhighParameterId,
    options.xhighValue,
  );
  if (!match.ok) {
    throw new ModelUnavailableError(
      `Grok 4.6 xhigh differed at runtime: ${match.reason}. Refusing to continue.`,
      summarizeCatalog(options.catalog),
    );
  }
}

export function assertSamePinnedModel(
  pinned: ModelSelection,
  resolved: ModelSelection,
  catalog: CatalogModel[],
): void {
  if (pinned.id !== resolved.id) {
    throw new ModelUnavailableError(
      `Catalog Grok 4.6 id changed mid-run (${pinned.id} → ${resolved.id}). Stopping.`,
      summarizeCatalog(catalog),
    );
  }
}
