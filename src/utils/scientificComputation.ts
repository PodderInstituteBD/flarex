export interface ExtendedDescriptiveMetrics {
  variable: string;
  unit: string | null;
  count: number;
  missingCount: number;
  missingPct: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  sampleVariance: number | null;
  sampleStdDev: number | null;
  q1: number;
  q2: number;
  q3: number;
  iqr: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  outlierLowFence: number;
  outlierHighFence: number;
  outlierCount: number;
  outlierValues: number[];
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  residualStdDev: number | null;
  equationLabel: string;
}

export interface SpearmanCorrelationResult {
  rho: number;
  pairCount: number;
}

export interface ExtendedBivariateMetrics {
  xVariable: string;
  xUnit: string | null;
  yVariable: string;
  yUnit: string | null;
  pairCount: number;
  pearsonR: number;
  spearmanRho: number;
  linearRegression: LinearRegressionResult;
  unitCompatibility: UnitCompatibilityResult;
  disclaimer: string;
}

export type UnitCompatibilityStatus =
  | 'COMPATIBLE_SAME_UNIT'
  | 'BOTH_DIMENSIONLESS'
  | 'DISTINCT_PHYSICAL_UNITS'
  | 'SCALE_MISMATCH_SAME_DIMENSION'
  | 'MISSING_UNIT_METADATA';

export interface UnitCompatibilityResult {
  status: UnitCompatibilityStatus;
  compatibleForDirectComparison: boolean;
  allowedForRelationalPlot: boolean;
  warningMessage: string | null;
}

export interface GroupedSummaryRow {
  groupValue: string;
  count: number;
  missingCount: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sampleStdDev: number | null;
  iqr: number;
}

export interface MovingAveragePoint {
  index: number;
  x: number | null;
  value: number;
  movingAvg: number;
}

function roundStat(val: number): number {
  return Number(val.toFixed(4));
}

export function computePercentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.max(0, Math.min(1, p));
  const idx = (sortedAsc.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

const UNIT_DIMENSION_MAP: Record<string, string> = {
  k: 'temperature',
  kelvin: 'temperature',
  '°c': 'temperature',
  c: 'temperature',
  degc: 'temperature',
  f: 'temperature',
  pa: 'pressure',
  kpa: 'pressure',
  atm: 'pressure',
  psi: 'pressure',
  bar: 'pressure',
  s: 'time',
  sec: 'time',
  ms: 'time',
  min: 'time',
  'cm/s': 'velocity',
  'm/s': 'velocity',
  'mm/s': 'velocity',
  mm: 'length',
  cm: 'length',
  m: 'length',
  'μm': 'length',
  um: 'length',
  w: 'power',
  mw: 'power',
  kw: 'power',
  kv: 'voltage',
  v: 'voltage',
  '%': 'fraction',
  pct: 'fraction',
};

export function checkUnitCompatibility(
  unitA: string | null | undefined,
  unitB: string | null | undefined,
  operation: 'DIRECT_COMPARISON' | 'CORRELATION_OR_SCATTER' = 'DIRECT_COMPARISON'
): UnitCompatibilityResult {
  const normA = unitA?.trim() ?? '';
  const normB = unitB?.trim() ?? '';

  if (!normA && !normB) {
    return {
      status: 'MISSING_UNIT_METADATA',
      compatibleForDirectComparison: operation !== 'DIRECT_COMPARISON',
      allowedForRelationalPlot: true,
      warningMessage:
        'Neither variable declares explicit physical unit headers; verify source documentation before numeric comparison.',
    };
  }
  if (!normA || !normB) {
    return {
      status: 'MISSING_UNIT_METADATA',
      compatibleForDirectComparison: false,
      allowedForRelationalPlot: operation === 'CORRELATION_OR_SCATTER',
      warningMessage: `Unit metadata is asymmetric ("${normA || 'unspecified'}" vs "${normB || 'unspecified'}").`,
    };
  }

  if (normA.toLowerCase() === normB.toLowerCase()) {
    return {
      status: 'COMPATIBLE_SAME_UNIT',
      compatibleForDirectComparison: true,
      allowedForRelationalPlot: true,
      warningMessage: null,
    };
  }

  const dimA = UNIT_DIMENSION_MAP[normA.toLowerCase()];
  const dimB = UNIT_DIMENSION_MAP[normB.toLowerCase()];

  if (dimA && dimB && dimA === dimB) {
    return {
      status: 'SCALE_MISMATCH_SAME_DIMENSION',
      compatibleForDirectComparison: false,
      allowedForRelationalPlot: operation === 'CORRELATION_OR_SCATTER',
      warningMessage: `Incompatible unit scale within ${dimA} (${normA} vs ${normB}); normalize units explicitly before subtraction or overlay.`,
    };
  }

  return {
    status: 'DISTINCT_PHYSICAL_UNITS',
    compatibleForDirectComparison: false,
    allowedForRelationalPlot: operation === 'CORRELATION_OR_SCATTER',
    warningMessage: `Distinct physical dimensions (${normA} vs ${normB}): direct numerical subtraction/averaging is blocked, while XY regression/scatter tracks relational association only.`,
  };
}

export function computeExtendedDescriptiveStats(
  rawValues: Array<number | null | undefined>,
  variableName: string,
  unit: string | null = null
): ExtendedDescriptiveMetrics | null {
  const valid: number[] = [];
  let missingCount = 0;

  for (const v of rawValues) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      valid.push(v);
    } else {
      missingCount += 1;
    }
  }

  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;
  const total = n + missingCount;
  const missingPct = total > 0 ? Number(((missingCount / total) * 100).toFixed(1)) : 0;

  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sorted[i];
  const mean = sum / n;

  const q1 = computePercentile(sorted, 0.25);
  const q2 = computePercentile(sorted, 0.5);
  const q3 = computePercentile(sorted, 0.75);
  const iqr = q3 - q1;

  const p10 = computePercentile(sorted, 0.1);
  const p90 = computePercentile(sorted, 0.9);

  let sampleVariance: number | null = null;
  let sampleStdDev: number | null = null;
  if (n >= 2) {
    let sq = 0;
    for (let i = 0; i < n; i += 1) {
      const d = sorted[i] - mean;
      sq += d * d;
    }
    sampleVariance = sq / (n - 1);
    sampleStdDev = Math.sqrt(sampleVariance);
  }

  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const outlierValues =
    iqr > 0 ? sorted.filter((v) => v < loFence || v > hiFence).slice(0, 50) : [];
  const outlierCount =
    iqr > 0 ? sorted.filter((v) => v < loFence || v > hiFence).length : 0;

  const min = sorted[0];
  const max = sorted[n - 1];

  return {
    variable: variableName,
    unit,
    count: n,
    missingCount,
    missingPct,
    mean: roundStat(mean),
    median: roundStat(q2),
    min: roundStat(min),
    max: roundStat(max),
    range: roundStat(max - min),
    sampleVariance: sampleVariance !== null ? roundStat(sampleVariance) : null,
    sampleStdDev: sampleStdDev !== null ? roundStat(sampleStdDev) : null,
    q1: roundStat(q1),
    q2: roundStat(q2),
    q3: roundStat(q3),
    iqr: roundStat(iqr),
    p10: roundStat(p10),
    p25: roundStat(q1),
    p50: roundStat(q2),
    p75: roundStat(q3),
    p90: roundStat(p90),
    outlierLowFence: roundStat(loFence),
    outlierHighFence: roundStat(hiFence),
    outlierCount,
    outlierValues: outlierValues.map(roundStat),
  };
}

function assignAverageRanks(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(vals.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j += 1;
    }
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function computePearsonR(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return Math.max(-1, Math.min(1, num / Math.sqrt(dx2 * dy2)));
}

export function computeSpearmanRankCorrelation(
  x: number[],
  y: number[]
): SpearmanCorrelationResult | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const rx = assignAverageRanks(x.slice(0, n));
  const ry = assignAverageRanks(y.slice(0, n));
  const rho = computePearsonR(rx, ry);
  if (rho === null) return null;
  return { rho: roundStat(rho), pairCount: n };
}

export function computeSimpleLinearRegression(
  x: number[],
  y: number[]
): LinearRegressionResult | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let denX = 0;
  let totY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denX += dx * dx;
    totY += dy * dy;
  }
  if (denX === 0) return null;
  const slope = num / denX;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = slope * x[i] + intercept;
    const err = y[i] - pred;
    sse += err * err;
  }
  const rSquared = totY > 0 ? Math.max(0, Math.min(1, 1 - sse / totY)) : 1;
  const residualStdDev = n > 2 ? Math.sqrt(sse / (n - 2)) : null;

  const sRound = roundStat(slope);
  const iRound = roundStat(intercept);
  const sign = iRound >= 0 ? '+' : '-';

  return {
    slope: sRound,
    intercept: iRound,
    rSquared: roundStat(rSquared),
    residualStdDev: residualStdDev !== null ? roundStat(residualStdDev) : null,
    equationLabel: `y = ${sRound}x ${sign} ${Math.abs(iRound)} (R² = ${roundStat(rSquared)})`,
  };
}

export function computeMovingAverage(
  points: Array<{ x: number | null; y: number }>,
  windowSize = 3
): MovingAveragePoint[] {
  const w = Math.max(1, Math.min(50, Math.floor(windowSize)));
  const out: MovingAveragePoint[] = [];
  let runningSum = 0;
  for (let i = 0; i < points.length; i += 1) {
    runningSum += points[i].y;
    if (i >= w) {
      runningSum -= points[i - w].y;
    }
    const denom = Math.min(w, i + 1);
    out.push({
      index: i,
      x: points[i].x,
      value: roundStat(points[i].y),
      movingAvg: roundStat(runningSum / denom),
    });
  }
  return out;
}

export function computeGroupedComparison(
  rows: Array<Record<string, number | string | null>>,
  groupKey: string,
  valueKey: string
): GroupedSummaryRow[] {
  const buckets = new Map<string, Array<number | null>>();
  for (const row of rows) {
    const rawGroup = row[groupKey];
    const label =
      rawGroup === null || rawGroup === undefined || rawGroup === ''
        ? '(Missing Group)'
        : String(rawGroup);
    const list = buckets.get(label) ?? [];
    const val = row[valueKey];
    list.push(typeof val === 'number' && Number.isFinite(val) ? val : null);
    buckets.set(label, list);
  }

  const out: GroupedSummaryRow[] = [];
  for (const [groupValue, vals] of buckets.entries()) {
    const desc = computeExtendedDescriptiveStats(vals, valueKey);
    if (!desc) continue;
    out.push({
      groupValue,
      count: desc.count,
      missingCount: desc.missingCount,
      mean: desc.mean,
      median: desc.median,
      min: desc.min,
      max: desc.max,
      sampleStdDev: desc.sampleStdDev,
      iqr: desc.iqr,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 20);
}
