export type IndicatorKind =
  | "sma"
  | "ema"
  | "wma"
  | "rma"
  | "dema"
  | "tema"
  | "hma"
  | "vwma"
  | "vwap"
  | "bb"
  | "keltner"
  | "donchian"
  | "envelope"
  | "supertrend"
  | "psar"
  | "ichimoku"
  | "rsi"
  | "stoch"
  | "stochRsi"
  | "cci"
  | "williams"
  | "mfi"
  | "roc"
  | "momentum"
  | "macd"
  | "ppo"
  | "trix"
  | "ao"
  | "atr"
  | "adx"
  | "obv"
  | "adl"
  | "cmf"
  | "force"
  | "aroon"
  | "stdev";

export type IndicatorGroup =
  | "Moving averages"
  | "Channels"
  | "Trend"
  | "Momentum"
  | "Volume"
  | "Volatility";

export type IndicatorLineStyle =
  | "solid"
  | "dotted"
  | "dashed"
  | "largeDashed"
  | "sparseDotted";

export type IndicatorLineWidth = 1 | 2 | 3 | 4;

export type IndicatorField = {
  key: "period" | "period2" | "period3" | "multiplier";
  label: string;
  min: number;
  max: number;
  step: number;
};

export type IndicatorInstance = {
  instanceId: string;
  kind: IndicatorKind;
  enabled: boolean;
  color: string;
  lineStyle: IndicatorLineStyle;
  lineWidth: IndicatorLineWidth;
  period: number;
  period2: number;
  period3: number;
  multiplier: number;
};

export type IndicatorDefinition = {
  kind: IndicatorKind;
  label: string;
  shortLabel: string;
  group: IndicatorGroup;
  pane: "overlay" | "oscillator";
  fields: IndicatorField[];
  defaults: Omit<IndicatorInstance, "instanceId" | "kind" | "enabled">;
};

const PERIOD: IndicatorField = {
  key: "period",
  label: "Length",
  min: 1,
  max: 400,
  step: 1,
};

export const INDICATOR_CATALOG: IndicatorDefinition[] = [
  {
    kind: "sma",
    label: "Simple Moving Average",
    shortLabel: "SMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#d7a6af",
      lineStyle: "solid",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "ema",
    label: "Exponential Moving Average",
    shortLabel: "EMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 21,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "wma",
    label: "Weighted Moving Average",
    shortLabel: "WMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#d7a84b",
      lineStyle: "solid",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "rma",
    label: "Smoothed Moving Average",
    shortLabel: "RMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "dema",
    label: "Double EMA",
    shortLabel: "DEMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#69aaa5",
      lineStyle: "solid",
      lineWidth: 2,
      period: 21,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "tema",
    label: "Triple EMA",
    shortLabel: "TEMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#e06666",
      lineStyle: "solid",
      lineWidth: 2,
      period: 21,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "hma",
    label: "Hull Moving Average",
    shortLabel: "HMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#42b883",
      lineStyle: "solid",
      lineWidth: 2,
      period: 16,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "vwma",
    label: "Volume Weighted MA",
    shortLabel: "VWMA",
    group: "Moving averages",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#68a4d8",
      lineStyle: "dashed",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "vwap",
    label: "Volume Weighted Average Price",
    shortLabel: "VWAP",
    group: "Moving averages",
    pane: "overlay",
    fields: [],
    defaults: {
      color: "#69aaa5",
      lineStyle: "solid",
      lineWidth: 2,
      period: 0,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "bb",
    label: "Bollinger Bands",
    shortLabel: "BB",
    group: "Channels",
    pane: "overlay",
    fields: [
      PERIOD,
      { key: "multiplier", label: "StdDev", min: 0.5, max: 6, step: 0.1 },
    ],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 1,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 2,
    },
  },
  {
    kind: "keltner",
    label: "Keltner Channels",
    shortLabel: "KC",
    group: "Channels",
    pane: "overlay",
    fields: [
      PERIOD,
      { key: "multiplier", label: "Mult", min: 0.5, max: 6, step: 0.1 },
    ],
    defaults: {
      color: "#68a4d8",
      lineStyle: "dashed",
      lineWidth: 1,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 1.5,
    },
  },
  {
    kind: "donchian",
    label: "Donchian Channels",
    shortLabel: "DC",
    group: "Channels",
    pane: "overlay",
    fields: [PERIOD],
    defaults: {
      color: "#d7a84b",
      lineStyle: "dotted",
      lineWidth: 1,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "envelope",
    label: "Moving Average Envelope",
    shortLabel: "ENV",
    group: "Channels",
    pane: "overlay",
    fields: [
      PERIOD,
      { key: "multiplier", label: "%", min: 0.1, max: 20, step: 0.1 },
    ],
    defaults: {
      color: "#d7a6af",
      lineStyle: "dashed",
      lineWidth: 1,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 2.5,
    },
  },
  {
    kind: "supertrend",
    label: "Supertrend",
    shortLabel: "ST",
    group: "Trend",
    pane: "overlay",
    fields: [
      PERIOD,
      { key: "multiplier", label: "Mult", min: 0.5, max: 10, step: 0.1 },
    ],
    defaults: {
      color: "#42b883",
      lineStyle: "solid",
      lineWidth: 2,
      period: 10,
      period2: 0,
      period3: 0,
      multiplier: 3,
    },
  },
  {
    kind: "psar",
    label: "Parabolic SAR",
    shortLabel: "SAR",
    group: "Trend",
    pane: "overlay",
    fields: [
      { key: "multiplier", label: "Step", min: 0.005, max: 0.2, step: 0.005 },
      { key: "period2", label: "Max", min: 0.05, max: 0.5, step: 0.01 },
    ],
    defaults: {
      color: "#e06666",
      lineStyle: "dotted",
      lineWidth: 2,
      period: 0,
      period2: 0.2,
      period3: 0,
      multiplier: 0.02,
    },
  },
  {
    kind: "ichimoku",
    label: "Ichimoku Cloud",
    shortLabel: "ICH",
    group: "Trend",
    pane: "overlay",
    fields: [
      { key: "period", label: "Tenkan", min: 2, max: 50, step: 1 },
      { key: "period2", label: "Kijun", min: 2, max: 80, step: 1 },
      { key: "period3", label: "Senkou", min: 2, max: 120, step: 1 },
    ],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 1,
      period: 9,
      period2: 26,
      period3: 52,
      multiplier: 0,
    },
  },
  {
    kind: "rsi",
    label: "Relative Strength Index",
    shortLabel: "RSI",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "stoch",
    label: "Stochastic",
    shortLabel: "STOCH",
    group: "Momentum",
    pane: "oscillator",
    fields: [
      { key: "period", label: "%K", min: 2, max: 80, step: 1 },
      { key: "period2", label: "%D", min: 1, max: 40, step: 1 },
    ],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 3,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "stochRsi",
    label: "Stochastic RSI",
    shortLabel: "SRSI",
    group: "Momentum",
    pane: "oscillator",
    fields: [
      PERIOD,
      { key: "period2", label: "%K", min: 2, max: 40, step: 1 },
      { key: "period3", label: "%D", min: 1, max: 40, step: 1 },
    ],
    defaults: {
      color: "#d7a84b",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 14,
      period3: 3,
      multiplier: 0,
    },
  },
  {
    kind: "cci",
    label: "Commodity Channel Index",
    shortLabel: "CCI",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#69aaa5",
      lineStyle: "solid",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "williams",
    label: "Williams %R",
    shortLabel: "%R",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#e06666",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "roc",
    label: "Rate of Change",
    shortLabel: "ROC",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#d7a6af",
      lineStyle: "solid",
      lineWidth: 2,
      period: 12,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "momentum",
    label: "Momentum",
    shortLabel: "MOM",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 10,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "macd",
    label: "MACD",
    shortLabel: "MACD",
    group: "Momentum",
    pane: "oscillator",
    fields: [
      { key: "period", label: "Fast", min: 2, max: 50, step: 1 },
      { key: "period2", label: "Slow", min: 2, max: 80, step: 1 },
      { key: "period3", label: "Signal", min: 1, max: 40, step: 1 },
    ],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 12,
      period2: 26,
      period3: 9,
      multiplier: 0,
    },
  },
  {
    kind: "ppo",
    label: "Percentage Price Oscillator",
    shortLabel: "PPO",
    group: "Momentum",
    pane: "oscillator",
    fields: [
      { key: "period", label: "Fast", min: 2, max: 50, step: 1 },
      { key: "period2", label: "Slow", min: 2, max: 80, step: 1 },
      { key: "period3", label: "Signal", min: 1, max: 40, step: 1 },
    ],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 12,
      period2: 26,
      period3: 9,
      multiplier: 0,
    },
  },
  {
    kind: "trix",
    label: "TRIX",
    shortLabel: "TRIX",
    group: "Momentum",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#d7a84b",
      lineStyle: "solid",
      lineWidth: 2,
      period: 15,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "ao",
    label: "Awesome Oscillator",
    shortLabel: "AO",
    group: "Momentum",
    pane: "oscillator",
    fields: [
      { key: "period", label: "Fast", min: 2, max: 20, step: 1 },
      { key: "period2", label: "Slow", min: 5, max: 80, step: 1 },
    ],
    defaults: {
      color: "#42b883",
      lineStyle: "solid",
      lineWidth: 2,
      period: 5,
      period2: 34,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "aroon",
    label: "Aroon",
    shortLabel: "AROON",
    group: "Trend",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#42b883",
      lineStyle: "solid",
      lineWidth: 2,
      period: 25,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "adx",
    label: "Average Directional Index",
    shortLabel: "ADX",
    group: "Trend",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#d7a84b",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "mfi",
    label: "Money Flow Index",
    shortLabel: "MFI",
    group: "Volume",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#69aaa5",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "obv",
    label: "On Balance Volume",
    shortLabel: "OBV",
    group: "Volume",
    pane: "oscillator",
    fields: [],
    defaults: {
      color: "#68a4d8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 0,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "adl",
    label: "Accumulation / Distribution",
    shortLabel: "ADL",
    group: "Volume",
    pane: "oscillator",
    fields: [],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 0,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "cmf",
    label: "Chaikin Money Flow",
    shortLabel: "CMF",
    group: "Volume",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#d7a6af",
      lineStyle: "solid",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "force",
    label: "Force Index",
    shortLabel: "FI",
    group: "Volume",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#e06666",
      lineStyle: "solid",
      lineWidth: 2,
      period: 13,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "atr",
    label: "Average True Range",
    shortLabel: "ATR",
    group: "Volatility",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#d7a84b",
      lineStyle: "solid",
      lineWidth: 2,
      period: 14,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
  {
    kind: "stdev",
    label: "Standard Deviation",
    shortLabel: "SD",
    group: "Volatility",
    pane: "oscillator",
    fields: [PERIOD],
    defaults: {
      color: "#8e83c8",
      lineStyle: "solid",
      lineWidth: 2,
      period: 20,
      period2: 0,
      period3: 0,
      multiplier: 0,
    },
  },
];

export const INDICATOR_GROUPS: IndicatorGroup[] = [
  "Moving averages",
  "Channels",
  "Trend",
  "Momentum",
  "Volume",
  "Volatility",
];

const BY_KIND = new Map(
  INDICATOR_CATALOG.map((item) => [item.kind, item] as const),
);

let indicatorSeq = 0;

export function definitionFor(kind: IndicatorKind) {
  return BY_KIND.get(kind)!;
}

export function createIndicatorInstance(kind: IndicatorKind): IndicatorInstance {
  const def = definitionFor(kind);
  indicatorSeq += 1;
  return {
    instanceId: `${kind}-${indicatorSeq}`,
    kind,
    enabled: true,
    ...def.defaults,
  };
}

export function defaultIndicatorInstances(): IndicatorInstance[] {
  return [createIndicatorInstance("sma"), createIndicatorInstance("vwap")];
}

export function instanceLabel(instance: IndicatorInstance) {
  const def = definitionFor(instance.kind);
  if (def.fields.some((field) => field.key === "period") && instance.period > 0) {
    return `${def.shortLabel} ${instance.period}`;
  }
  return def.shortLabel;
}
