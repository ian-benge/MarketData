export type ThemeDef = {
  id: string;
  label: string;
  pattern: RegExp;
  relatedTickers: string[];
};

export const THEMES: ThemeDef[] = [
  {
    id: "semiconductors",
    label: "Semiconductors",
    pattern:
      /semiconductor|\bgpu\b|\bhbm\b|\bdram\b|\bnand\b|foundry|wafer|chipmaker|ai chip/i,
    relatedTickers: [
      "NVDA",
      "AVGO",
      "AMD",
      "TSM",
      "ASML",
      "AMAT",
      "LRCX",
      "KLAC",
      "MU",
      "INTC",
      "MRVL",
      "QCOM",
      "ARM",
    ],
  },
  {
    id: "photonics",
    label: "Photonics",
    pattern:
      /photonic|silicon photonics|optical interconnect|\bcpo\b|transceiver|coherent optics/i,
    relatedTickers: ["COHR", "LITE", "AAOI", "FN", "GLW", "POET", "AXTI", "CRDO", "ALAB"],
  },
  {
    id: "hyperscalers",
    label: "Hyperscalers",
    pattern:
      /hyperscaler|cloud capex|aws\b|azure|google cloud|meta capex|msft capex/i,
    relatedTickers: ["MSFT", "AMZN", "GOOGL", "META", "ORCL"],
  },
  {
    id: "data_centers",
    label: "Data centers",
    pattern: /data[- ]cent(?:er|re)s?|colocation|liquid cooling|ai cluster/i,
    relatedTickers: ["EQIX", "DLR", "VRT", "SMCI", "DELL", "HPE", "ANET", "CRWV", "NBIS"],
  },
  {
    id: "ai_infrastructure",
    label: "AI infrastructure",
    pattern: /ai infra|ai infrastructure|gpu cluster|training cluster|inference rack/i,
    relatedTickers: ["NVDA", "AVGO", "SMCI", "CRWV", "VRT", "ANET", "CRDO", "ALAB"],
  },
  {
    id: "power",
    label: "Power",
    pattern:
      /power purchase|\bppa\b|megawatt|\bmw\b interconnect|behind[- ]the[- ]meter|power contract/i,
    relatedTickers: ["CEG", "VST", "NRG", "TLN", "NEE", "VRT", "GEV", "ETN", "PWR"],
  },
  {
    id: "grid",
    label: "Grid equipment",
    pattern: /grid equipment|substation|transformer|high[- ]voltage|\bt&d\b|transmission/i,
    relatedTickers: ["ETN", "HUBB", "POWL", "PWR", "FIX", "EME", "GEV", "NVT"],
  },
  {
    id: "nuclear",
    label: "Nuclear",
    pattern: /\bnuclear\b|\bsmr\b|small modular|uranium|constellation energy/i,
    relatedTickers: ["CEG", "VST", "CCJ", "LEU", "NNE", "OKLO", "SMR"],
  },
  {
    id: "natural_gas",
    label: "Natural gas",
    pattern: /natural gas|\blng\b|henry hub|gas[- ]fired|pipeline/i,
    relatedTickers: ["EQT", "AR", "LNG", "KMI", "WMB", "TRGP", "DTM"],
  },
  {
    id: "ai_software",
    label: "AI software",
    pattern: /foundation model|\bllm\b|copilot|inference software|generative ai/i,
    relatedTickers: ["MSFT", "PLTR", "NOW", "SNOW", "CRM", "PATH"],
  },
  {
    id: "robotics",
    label: "Robotics",
    pattern: /humanoid|\brobot(?:ic|s)?\b|factory automation|industrial robot/i,
    relatedTickers: ["ISRG", "ROK", "TER", "PATH", "IRBT"],
  },
];

export function themesFromText(text: string): string[] {
  const hits: string[] = [];
  for (const theme of THEMES) {
    if (theme.pattern.test(text)) hits.push(theme.id);
  }
  return hits;
}

export function themeById(id: string): ThemeDef | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function expandThemeQuery(raw: string): string[] {
  const lower = raw.toLowerCase();
  const ids: string[] = [];
  for (const theme of THEMES) {
    if (
      lower.includes(theme.id.replaceAll("_", " ")) ||
      lower.includes(theme.label.toLowerCase()) ||
      theme.pattern.test(raw)
    ) {
      ids.push(theme.id);
    }
  }
  if (/ai power|power contract/.test(lower)) {
    for (const id of ["power", "ai_infrastructure", "data_centers"]) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (/export[- ]control/.test(lower) && !ids.includes("semiconductors")) {
    ids.push("semiconductors");
  }
  return ids;
}
