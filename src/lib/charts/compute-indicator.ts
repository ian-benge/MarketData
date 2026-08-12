import {
  adl,
  adx,
  aroon,
  atr,
  awesomeOscillator,
  bollinger,
  cci,
  cmf,
  dema,
  donchian,
  ema,
  envelope,
  forceIndex,
  hma,
  ichimoku,
  keltner,
  macd,
  mfi,
  momentum,
  obv,
  parabolicSar,
  ppo,
  rma,
  roc,
  rsi,
  sessionVwap,
  sma,
  stdev,
  stochastic,
  stochRsi,
  supertrend,
  tema,
  trix,
  vwma,
  williamsR,
  wma,
} from "@/lib/charts/indicators";
import type { IndicatorInstance } from "@/lib/charts/indicator-catalog";
import { instanceLabel } from "@/lib/charts/indicator-catalog";
import { chicagoDateKey } from "@/lib/market-data/bars-window";

export type PlotBarLike = {
  barStart: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorPlot = {
  title: string;
  values: Array<number | null>;
  pane: "overlay" | "oscillator";
  kind: "line" | "histogram";
  tone: "primary" | "secondary" | "tertiary";
};

export function computeIndicatorPlots(
  instance: IndicatorInstance,
  bars: PlotBarLike[],
): IndicatorPlot[] {
  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);
  const title = instanceLabel(instance);
  const p = Math.max(1, Math.round(instance.period || 1));
  const p2 = Math.max(1, Math.round(instance.period2 || 1));
  const p3 = Math.max(1, Math.round(instance.period3 || 1));
  const m = instance.multiplier;

  const line = (
    values: Array<number | null>,
    pane: IndicatorPlot["pane"] = "overlay",
    nextTitle = title,
    tone: IndicatorPlot["tone"] = "primary",
    kind: IndicatorPlot["kind"] = "line",
  ): IndicatorPlot => ({ title: nextTitle, values, pane, kind, tone });

  switch (instance.kind) {
    case "sma":
      return [line(sma(closes, p))];
    case "ema":
      return [line(ema(closes, p))];
    case "wma":
      return [line(wma(closes, p))];
    case "rma":
      return [line(rma(closes, p))];
    case "dema":
      return [line(dema(closes, p))];
    case "tema":
      return [line(tema(closes, p))];
    case "hma":
      return [line(hma(closes, p))];
    case "vwma":
      return [line(vwma(closes, volumes, p))];
    case "vwap":
      return [
        line(
          sessionVwap(
            bars.map((bar) => ({
              ...bar,
              sessionKey: chicagoDateKey(bar.barStart),
            })),
          ),
        ),
      ];
    case "bb": {
      const bands = bollinger(closes, p, m || 2);
      return [
        line(bands.upper, "overlay", `${title} up`),
        line(bands.mid, "overlay", `${title} mid`, "secondary"),
        line(bands.lower, "overlay", `${title} low`, "tertiary"),
      ];
    }
    case "keltner": {
      const bands = keltner(highs, lows, closes, p, m || 1.5);
      return [
        line(bands.upper, "overlay", `${title} up`),
        line(bands.mid, "overlay", `${title} mid`, "secondary"),
        line(bands.lower, "overlay", `${title} low`, "tertiary"),
      ];
    }
    case "donchian": {
      const bands = donchian(highs, lows, p);
      return [
        line(bands.upper, "overlay", `${title} up`),
        line(bands.mid, "overlay", `${title} mid`, "secondary"),
        line(bands.lower, "overlay", `${title} low`, "tertiary"),
      ];
    }
    case "envelope": {
      const bands = envelope(closes, p, m || 2.5);
      return [
        line(bands.upper, "overlay", `${title} up`),
        line(bands.mid, "overlay", `${title} mid`, "secondary"),
        line(bands.lower, "overlay", `${title} low`, "tertiary"),
      ];
    }
    case "supertrend":
      return [line(supertrend(highs, lows, closes, p, m || 3))];
    case "psar":
      return [line(parabolicSar(highs, lows, m || 0.02, instance.period2 || 0.2))];
    case "ichimoku": {
      const cloud = ichimoku(highs, lows, p, p2, p3);
      return [
        line(cloud.tenkan, "overlay", "Tenkan"),
        line(cloud.kijun, "overlay", "Kijun", "secondary"),
        line(cloud.senkouA, "overlay", "Senkou A", "secondary"),
        line(cloud.senkouB, "overlay", "Senkou B", "tertiary"),
      ];
    }
    case "rsi":
      return [line(rsi(closes, p), "oscillator")];
    case "stoch": {
      const stoch = stochastic(highs, lows, closes, p, p2);
      return [
        line(stoch.k, "oscillator", `${title} %K`),
        line(stoch.d, "oscillator", `${title} %D`, "secondary"),
      ];
    }
    case "stochRsi": {
      const stoch = stochRsi(closes, p, p2, p3);
      return [
        line(stoch.k, "oscillator", `${title} %K`),
        line(stoch.d, "oscillator", `${title} %D`, "secondary"),
      ];
    }
    case "cci":
      return [line(cci(highs, lows, closes, p), "oscillator")];
    case "williams":
      return [line(williamsR(highs, lows, closes, p), "oscillator")];
    case "mfi":
      return [line(mfi(highs, lows, closes, volumes, p), "oscillator")];
    case "roc":
      return [line(roc(closes, p), "oscillator")];
    case "momentum":
      return [line(momentum(closes, p), "oscillator")];
    case "macd": {
      const values = macd(closes, p, p2, p3);
      return [
        line(values.macd, "oscillator", title),
        line(values.signal, "oscillator", `${title} sig`, "secondary"),
        line(values.hist, "oscillator", `${title} hist`, "tertiary", "histogram"),
      ];
    }
    case "ppo": {
      const values = ppo(closes, p, p2, p3);
      return [
        line(values.ppo, "oscillator", title),
        line(values.signal, "oscillator", `${title} sig`, "secondary"),
        line(values.hist, "oscillator", `${title} hist`, "tertiary", "histogram"),
      ];
    }
    case "trix":
      return [line(trix(closes, p), "oscillator")];
    case "ao":
      return [
        line(
          awesomeOscillator(highs, lows, p, p2),
          "oscillator",
          title,
          "primary",
          "histogram",
        ),
      ];
    case "atr":
      return [line(atr(highs, lows, closes, p), "oscillator")];
    case "adx": {
      const values = adx(highs, lows, closes, p);
      return [
        line(values.adx, "oscillator", title),
        line(values.plusDi, "oscillator", "+DI", "secondary"),
        line(values.minusDi, "oscillator", "−DI", "tertiary"),
      ];
    }
    case "obv":
      return [line(obv(closes, volumes), "oscillator")];
    case "adl":
      return [line(adl(highs, lows, closes, volumes), "oscillator")];
    case "cmf":
      return [line(cmf(highs, lows, closes, volumes, p), "oscillator")];
    case "force":
      return [line(forceIndex(closes, volumes, p), "oscillator")];
    case "aroon": {
      const values = aroon(highs, lows, p);
      return [
        line(values.up, "oscillator", "Aroon Up"),
        line(values.down, "oscillator", "Aroon Down", "secondary"),
      ];
    }
    case "stdev":
      return [line(stdev(closes, p), "oscillator")];
    default:
      return [];
  }
}
