export function sma(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) {
      count = 0;
      sum = 0;
      continue;
    }
    sum += value;
    count += 1;
    if (count > period) {
      const evicted = values[index - period];
      if (evicted != null) sum -= evicted;
      count = period;
    }
    if (count === period) out[index] = sum / period;
  }
  return out;
}

export function ema(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  let seen = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) continue;
    if (prev == null) {
      seed += value;
      seen += 1;
      if (seen === period) {
        prev = seed / period;
        out[index] = prev;
      }
      continue;
    }
    prev = value * k + prev * (1 - k);
    out[index] = prev;
  }
  return out;
}

export function bollinger(
  values: Array<number | null>,
  period = 20,
  multiplier = 2,
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
} {
  const mid = sma(values, period);
  const upper: Array<number | null> = Array.from({ length: values.length }, () => null);
  const lower: Array<number | null> = Array.from({ length: values.length }, () => null);
  for (let index = period - 1; index < values.length; index += 1) {
    if (mid[index] == null) continue;
    let sumSq = 0;
    let ok = true;
    for (let offset = 0; offset < period; offset += 1) {
      const value = values[index - period + 1 + offset];
      if (value == null) {
        ok = false;
        break;
      }
      const delta = value - (mid[index] as number);
      sumSq += delta * delta;
    }
    if (!ok) continue;
    const dev = Math.sqrt(sumSq / period) * multiplier;
    upper[index] = (mid[index] as number) + dev;
    lower[index] = (mid[index] as number) - dev;
  }
  return { mid, upper, lower };
}

export function rsi(
  values: Array<number | null>,
  period = 14,
): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  let avgGain = 0;
  let avgLoss = 0;
  let prev: number | null = null;
  let ready = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null || prev == null) {
      prev = value;
      continue;
    }
    const change = value - prev;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    prev = value;
    if (ready < period) {
      avgGain += gain;
      avgLoss += loss;
      ready += 1;
      if (ready === period) {
        avgGain /= period;
        avgLoss /= period;
        out[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function sessionVwap(
  bars: Array<{
    barStart: string;
    high: number | null;
    low: number | null;
    close: number | null;
    volume?: number | null;
    sessionKey: string;
  }>,
): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: bars.length }, () => null);
  let session: string | null = null;
  let pv = 0;
  let vol = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar.sessionKey !== session) {
      session = bar.sessionKey;
      pv = 0;
      vol = 0;
    }
    const typical =
      bar.high != null && bar.low != null && bar.close != null
        ? (bar.high + bar.low + bar.close) / 3
        : null;
    const volume = bar.volume ?? 0;
    if (typical == null || volume <= 0) continue;
    pv += typical * volume;
    vol += volume;
    out[index] = vol > 0 ? pv / vol : null;
  }
  return out;
}

function empty(length: number): Array<number | null> {
  return Array.from({ length }, () => null);
}

function highest(
  values: Array<number | null>,
  period: number,
  index: number,
): number | null {
  let max = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < period; offset += 1) {
    const value = values[index - offset];
    if (value == null) return null;
    max = Math.max(max, value);
  }
  return max;
}

function lowest(
  values: Array<number | null>,
  period: number,
  index: number,
): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < period; offset += 1) {
    const value = values[index - offset];
    if (value == null) return null;
    min = Math.min(min, value);
  }
  return min;
}

export function wma(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const out = empty(values.length);
  const denom = (period * (period + 1)) / 2;
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0;
    let ok = true;
    for (let weight = 1; weight <= period; weight += 1) {
      const value = values[index - period + weight];
      if (value == null) {
        ok = false;
        break;
      }
      sum += value * weight;
    }
    if (ok) out[index] = sum / denom;
  }
  return out;
}

export function rma(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const out = empty(values.length);
  const seed = sma(values, period);
  let prev: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (prev == null) {
      if (seed[index] == null) continue;
      prev = seed[index];
      out[index] = prev;
      continue;
    }
    if (value == null) continue;
    prev = (prev * (period - 1) + value) / period;
    out[index] = prev;
  }
  return out;
}

export function dema(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const first = ema(values, period);
  const second = ema(first, period);
  return first.map((value, index) =>
    value == null || second[index] == null ? null : 2 * value - (second[index] as number),
  );
}

export function tema(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const first = ema(values, period);
  const second = ema(first, period);
  const third = ema(second, period);
  return first.map((value, index) => {
    if (value == null || second[index] == null || third[index] == null) return null;
    return 3 * value - 3 * (second[index] as number) + (third[index] as number);
  });
}

export function hma(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const half = Math.max(1, Math.floor(period / 2));
  const raw = wma(values, period).map((slow, index) => {
    const fast = wma(values, half)[index];
    if (slow == null || fast == null) return null;
    return 2 * fast - slow;
  });
  return wma(raw, Math.max(1, Math.round(Math.sqrt(period))));
}

export function vwma(
  closes: Array<number | null>,
  volumes: number[],
  period: number,
): Array<number | null> {
  const out = empty(closes.length);
  for (let index = period - 1; index < closes.length; index += 1) {
    let pv = 0;
    let vol = 0;
    let ok = true;
    for (let offset = 0; offset < period; offset += 1) {
      const close = closes[index - offset];
      const volume = volumes[index - offset] ?? 0;
      if (close == null) {
        ok = false;
        break;
      }
      pv += close * volume;
      vol += volume;
    }
    if (ok && vol > 0) out[index] = pv / vol;
  }
  return out;
}

export function trueRange(
  highs: number[],
  lows: number[],
  closes: number[],
): Array<number | null> {
  const out = empty(closes.length);
  for (let index = 0; index < closes.length; index += 1) {
    if (index === 0) {
      out[index] = highs[index]! - lows[index]!;
      continue;
    }
    const prevClose = closes[index - 1]!;
    out[index] = Math.max(
      highs[index]! - lows[index]!,
      Math.abs(highs[index]! - prevClose),
      Math.abs(lows[index]! - prevClose),
    );
  }
  return out;
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): Array<number | null> {
  return rma(trueRange(highs, lows, closes), period);
}

export function keltner(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20,
  multiplier = 1.5,
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
} {
  const mid = ema(closes, period);
  const range = atr(highs, lows, closes, period);
  const upper = mid.map((value, index) =>
    value == null || range[index] == null
      ? null
      : value + (range[index] as number) * multiplier,
  );
  const lower = mid.map((value, index) =>
    value == null || range[index] == null
      ? null
      : value - (range[index] as number) * multiplier,
  );
  return { mid, upper, lower };
}

export function donchian(
  highs: number[],
  lows: number[],
  period: number,
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
} {
  const upper = empty(highs.length);
  const lower = empty(highs.length);
  const mid = empty(highs.length);
  for (let index = period - 1; index < highs.length; index += 1) {
    const hi = highest(highs, period, index);
    const lo = lowest(lows, period, index);
    if (hi == null || lo == null) continue;
    upper[index] = hi;
    lower[index] = lo;
    mid[index] = (hi + lo) / 2;
  }
  return { mid, upper, lower };
}

export function envelope(
  values: Array<number | null>,
  period: number,
  percent: number,
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
} {
  const mid = sma(values, period);
  const factor = percent / 100;
  return {
    mid,
    upper: mid.map((value) => (value == null ? null : value * (1 + factor))),
    lower: mid.map((value) => (value == null ? null : value * (1 - factor))),
  };
}

export function stdev(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const mid = sma(values, period);
  const out = empty(values.length);
  for (let index = period - 1; index < values.length; index += 1) {
    if (mid[index] == null) continue;
    let sumSq = 0;
    let ok = true;
    for (let offset = 0; offset < period; offset += 1) {
      const value = values[index - period + 1 + offset];
      if (value == null) {
        ok = false;
        break;
      }
      const delta = value - (mid[index] as number);
      sumSq += delta * delta;
    }
    if (ok) out[index] = Math.sqrt(sumSq / period);
  }
  return out;
}

export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number,
  dPeriod: number,
): { k: Array<number | null>; d: Array<number | null> } {
  const k = empty(closes.length);
  for (let index = kPeriod - 1; index < closes.length; index += 1) {
    const hi = highest(highs, kPeriod, index);
    const lo = lowest(lows, kPeriod, index);
    if (hi == null || lo == null || hi === lo) continue;
    k[index] = ((closes[index]! - lo) / (hi - lo)) * 100;
  }
  return { k, d: sma(k, dPeriod) };
}

export function stochRsi(
  values: Array<number | null>,
  period: number,
  kPeriod: number,
  dPeriod: number,
): { k: Array<number | null>; d: Array<number | null> } {
  const rsiLine = rsi(values, period);
  const k = empty(rsiLine.length);
  for (let index = kPeriod - 1; index < rsiLine.length; index += 1) {
    const hi = highest(rsiLine, kPeriod, index);
    const lo = lowest(rsiLine, kPeriod, index);
    const current = rsiLine[index];
    if (hi == null || lo == null || current == null || hi === lo) continue;
    k[index] = ((current - lo) / (hi - lo)) * 100;
  }
  return { k, d: sma(k, dPeriod) };
}

export function cci(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): Array<number | null> {
  const tp = closes.map((close, index) => (highs[index]! + lows[index]! + close) / 3);
  const mid = sma(tp, period);
  const out = empty(closes.length);
  for (let index = period - 1; index < closes.length; index += 1) {
    if (mid[index] == null) continue;
    let dev = 0;
    for (let offset = 0; offset < period; offset += 1) {
      dev += Math.abs(tp[index - offset]! - (mid[index] as number));
    }
    const meanDev = dev / period;
    if (meanDev === 0) continue;
    out[index] = (tp[index]! - (mid[index] as number)) / (0.015 * meanDev);
  }
  return out;
}

export function williamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): Array<number | null> {
  const out = empty(closes.length);
  for (let index = period - 1; index < closes.length; index += 1) {
    const hi = highest(highs, period, index);
    const lo = lowest(lows, period, index);
    if (hi == null || lo == null || hi === lo) continue;
    out[index] = ((hi - closes[index]!) / (hi - lo)) * -100;
  }
  return out;
}

export function roc(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  return values.map((value, index) => {
    const prior = values[index - period];
    if (value == null || prior == null || prior === 0) return null;
    return ((value - prior) / prior) * 100;
  });
}

export function momentum(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  return values.map((value, index) => {
    const prior = values[index - period];
    if (value == null || prior == null) return null;
    return value - prior;
  });
}

export function macd(
  values: Array<number | null>,
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  hist: Array<number | null>;
} {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = fastEma.map((value, index) =>
    value == null || slowEma[index] == null
      ? null
      : value - (slowEma[index] as number),
  );
  const signalLine = ema(line, signal);
  const hist = line.map((value, index) =>
    value == null || signalLine[index] == null
      ? null
      : value - (signalLine[index] as number),
  );
  return { macd: line, signal: signalLine, hist };
}

export function ppo(
  values: Array<number | null>,
  fast = 12,
  slow = 26,
  signal = 9,
): {
  ppo: Array<number | null>;
  signal: Array<number | null>;
  hist: Array<number | null>;
} {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = fastEma.map((value, index) => {
    const slowValue = slowEma[index];
    if (value == null || slowValue == null || slowValue === 0) return null;
    return ((value - slowValue) / slowValue) * 100;
  });
  const signalLine = ema(line, signal);
  return {
    ppo: line,
    signal: signalLine,
    hist: line.map((value, index) =>
      value == null || signalLine[index] == null
        ? null
        : value - (signalLine[index] as number),
    ),
  };
}

export function trix(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const triple = ema(ema(ema(values, period), period), period);
  return roc(triple, 1);
}

export function awesomeOscillator(
  highs: number[],
  lows: number[],
  fast = 5,
  slow = 34,
): Array<number | null> {
  const hl2 = highs.map((high, index) => (high + lows[index]!) / 2);
  const fastSma = sma(hl2, fast);
  const slowSma = sma(hl2, slow);
  return fastSma.map((value, index) =>
    value == null || slowSma[index] == null
      ? null
      : value - (slowSma[index] as number),
  );
}

export function mfi(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number,
): Array<number | null> {
  const out = empty(closes.length);
  const tp = closes.map((close, index) => (highs[index]! + lows[index]! + close) / 3);
  const raw = tp.map((value, index) => {
    if (index === 0) return 0;
    const prev = tp[index - 1]!;
    if (value > prev) return value * volumes[index]!;
    if (value < prev) return -value * volumes[index]!;
    return 0;
  });
  for (let index = period; index < closes.length; index += 1) {
    let pos = 0;
    let neg = 0;
    for (let offset = 0; offset < period; offset += 1) {
      const flow = raw[index - offset]!;
      if (flow > 0) pos += flow;
      else neg -= flow;
    }
    if (neg === 0) out[index] = 100;
    else out[index] = 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function obv(closes: number[], volumes: number[]): Array<number | null> {
  const out = empty(closes.length);
  let total = 0;
  for (let index = 0; index < closes.length; index += 1) {
    if (index > 0) {
      if (closes[index]! > closes[index - 1]!) total += volumes[index]!;
      else if (closes[index]! < closes[index - 1]!) total -= volumes[index]!;
    }
    out[index] = total;
  }
  return out;
}

export function adl(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): Array<number | null> {
  const out = empty(closes.length);
  let total = 0;
  for (let index = 0; index < closes.length; index += 1) {
    const range = highs[index]! - lows[index]!;
    const clv =
      range === 0
        ? 0
        : (closes[index]! - lows[index]! - (highs[index]! - closes[index]!)) /
          range;
    total += clv * volumes[index]!;
    out[index] = total;
  }
  return out;
}

export function cmf(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number,
): Array<number | null> {
  const out = empty(closes.length);
  const mfv = closes.map((close, index) => {
    const range = highs[index]! - lows[index]!;
    if (range === 0) return 0;
    return (
      ((close - lows[index]! - (highs[index]! - close)) / range) *
      volumes[index]!
    );
  });
  for (let index = period - 1; index < closes.length; index += 1) {
    let flow = 0;
    let vol = 0;
    for (let offset = 0; offset < period; offset += 1) {
      flow += mfv[index - offset]!;
      vol += volumes[index - offset]!;
    }
    if (vol !== 0) out[index] = flow / vol;
  }
  return out;
}

export function forceIndex(
  closes: number[],
  volumes: number[],
  period: number,
): Array<number | null> {
  const raw = closes.map((close, index) =>
    index === 0 ? null : (close - closes[index - 1]!) * volumes[index]!,
  );
  return ema(raw, period);
}

export function aroon(
  highs: number[],
  lows: number[],
  period: number,
): { up: Array<number | null>; down: Array<number | null> } {
  const up = empty(highs.length);
  const down = empty(highs.length);
  for (let index = period; index < highs.length; index += 1) {
    let hiOffset = 0;
    let loOffset = 0;
    let hi = Number.NEGATIVE_INFINITY;
    let lo = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset <= period; offset += 1) {
      const high = highs[index - offset]!;
      const low = lows[index - offset]!;
      if (high >= hi) {
        hi = high;
        hiOffset = offset;
      }
      if (low <= lo) {
        lo = low;
        loOffset = offset;
      }
    }
    up[index] = ((period - hiOffset) / period) * 100;
    down[index] = ((period - loOffset) / period) * 100;
  }
  return { up, down };
}

export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): {
  adx: Array<number | null>;
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
} {
  const plusDm = empty(closes.length);
  const minusDm = empty(closes.length);
  for (let index = 1; index < closes.length; index += 1) {
    const upMove = highs[index]! - highs[index - 1]!;
    const downMove = lows[index - 1]! - lows[index]!;
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const atrLine = atr(highs, lows, closes, period);
  const plusDi = rma(plusDm, period).map((value, index) =>
    value == null || atrLine[index] == null || atrLine[index] === 0
      ? null
      : (100 * value) / (atrLine[index] as number),
  );
  const minusDi = rma(minusDm, period).map((value, index) =>
    value == null || atrLine[index] == null || atrLine[index] === 0
      ? null
      : (100 * value) / (atrLine[index] as number),
  );
  const dx = plusDi.map((plus, index) => {
    const minus = minusDi[index];
    if (plus == null || minus == null || plus + minus === 0) return null;
    return (100 * Math.abs(plus - minus)) / (plus + minus);
  });
  return { adx: rma(dx, period), plusDi, minusDi };
}

export function supertrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
  multiplier: number,
): Array<number | null> {
  const range = atr(highs, lows, closes, period);
  const out = empty(closes.length);
  let trend = 1;
  let finalUpper = Number.NaN;
  let finalLower = Number.NaN;
  for (let index = 0; index < closes.length; index += 1) {
    if (range[index] == null) continue;
    const hl2 = (highs[index]! + lows[index]!) / 2;
    const basicUpper = hl2 + multiplier * (range[index] as number);
    const basicLower = hl2 - multiplier * (range[index] as number);
    finalUpper =
      Number.isNaN(finalUpper) ||
      basicUpper < finalUpper ||
      closes[index - 1]! > finalUpper
        ? basicUpper
        : finalUpper;
    finalLower =
      Number.isNaN(finalLower) ||
      basicLower > finalLower ||
      closes[index - 1]! < finalLower
        ? basicLower
        : finalLower;
    if (trend === 1 && closes[index]! < finalLower) trend = -1;
    else if (trend === -1 && closes[index]! > finalUpper) trend = 1;
    out[index] = trend === 1 ? finalLower : finalUpper;
  }
  return out;
}

export function parabolicSar(
  highs: number[],
  lows: number[],
  step = 0.02,
  max = 0.2,
): Array<number | null> {
  const out = empty(highs.length);
  if (highs.length < 2) return out;
  let up = highs[1]! > highs[0]!;
  let af = step;
  let sar = up ? lows[0]! : highs[0]!;
  let ep = up ? highs[1]! : lows[1]!;
  out[0] = sar;
  for (let index = 1; index < highs.length; index += 1) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, lows[index - 1]!, lows[index - 2] ?? lows[index - 1]!);
      if (lows[index]! < sar) {
        up = false;
        sar = ep;
        ep = lows[index]!;
        af = step;
      } else if (highs[index]! > ep) {
        ep = highs[index]!;
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, highs[index - 1]!, highs[index - 2] ?? highs[index - 1]!);
      if (highs[index]! > sar) {
        up = true;
        sar = ep;
        ep = highs[index]!;
        af = step;
      } else if (lows[index]! < ep) {
        ep = lows[index]!;
        af = Math.min(max, af + step);
      }
    }
    out[index] = sar;
  }
  return out;
}

export function ichimoku(
  highs: number[],
  lows: number[],
  conversion = 9,
  base = 26,
  span = 52,
): {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
} {
  const midpoint = (period: number) => {
    const out = empty(highs.length);
    for (let index = period - 1; index < highs.length; index += 1) {
      const hi = highest(highs, period, index);
      const lo = lowest(lows, period, index);
      if (hi != null && lo != null) out[index] = (hi + lo) / 2;
    }
    return out;
  };
  const tenkan = midpoint(conversion);
  const kijun = midpoint(base);
  const senkouB = midpoint(span);
  const senkouA = tenkan.map((value, index) =>
    value == null || kijun[index] == null
      ? null
      : (value + (kijun[index] as number)) / 2,
  );
  return { tenkan, kijun, senkouA, senkouB };
}

export function heikinAshi(
  bars: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
  }>,
): Array<{ open: number; high: number; low: number; close: number }> {
  const out: Array<{ open: number; high: number; low: number; close: number }> =
    [];
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]!;
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const open =
      index === 0
        ? (bar.open + bar.close) / 2
        : (out[index - 1]!.open + out[index - 1]!.close) / 2;
    out.push({
      open,
      close,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
    });
  }
  return out;
}
