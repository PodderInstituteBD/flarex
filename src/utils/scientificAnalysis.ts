import type {
  IngestedDatasetPackage,
  ProvenanceLayer,
} from './scientificIngestion.ts';

export type AnalysisMethodType =
  | 'DESCRIPTIVE_STATS'
  | 'HISTOGRAM_DISTRIBUTION'
  | 'PEARSON_CORRELATION'
  | 'TIME_SERIES_SUMMARY';

export interface DescriptiveStatsOutput {
  variable: string;
  normalizedKey: string;
  unit: string | null;
  sampleCount: number;
  missingCount: number;
  missingPct: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number | null;
}

export interface HistogramBinOutput {
  binLabel: string;
  minInclusive: number;
  maxInclusive: number;
  count: number;
}

export interface CorrelationOutput {
  xVariable: string;
  xUnit: string | null;
  yVariable: string;
  yUnit: string | null;
  pairCount: number;
  pearsonR: number;
  interpretationNote: string;
}

export interface TimeSeriesSummaryOutput {
  timeVariable: string;
  timeUnit: string | null;
  valueVariable: string;
  valueUnit: string | null;
  pointCount: number;
  timeStart: number;
  timeEnd: number;
  isMonotonicIncreasing: boolean;
  startValue: number;
  endValue: number;
  netDelta: number;
  peakValue: number;
  troughValue: number;
}

export interface ReproducibleAnalysisRun {
  runId: string;
  datasetId: string;
  datasetFilename: string;
  sourceUrl: string;
  sourceVersion: string;
  dataLayer: ProvenanceLayer;
  method: AnalysisMethodType;
  calculationMethodLabel: string;
  inputVariables: string[];
  units: Record<string, string | null>;
  sampleCount: number;
  missingDataHandling: string;
  processingSteps: string[];
  softwareVersion: string;
  timestamp: string;
  limitations: string[];
  descriptive?: DescriptiveStatsOutput;
  histogram?: HistogramBinOutput[];
  correlation?: CorrelationOutput;
  timeSeriesSummary?: TimeSeriesSummaryOutput;
  errorMessage?: string;
}

export const FLAREX_ANALYSIS_SOFTWARE_VERSION = 'FLAREX 5.0.0-science';

function computeDatasetFingerprint(dataset: IngestedDatasetPackage): string {
  return `v1-${dataset.summary.rowCount}x${dataset.summary.columnCount}-${dataset.provenance.byteSize}B`;
}

function roundStat(val: number): number {
  return Number(val.toFixed(4));
}

function extractNumericSeries(
  dataset: IngestedDatasetPackage,
  normalizedKey: string
): { values: number[]; missingCount: number } {
  const values: number[] = [];
  let missingCount = 0;
  for (const row of dataset.normalizedRows) {
    const v = row[normalizedKey];
    if (typeof v === 'number' && Number.isFinite(v)) {
      values.push(v);
    } else {
      missingCount += 1;
    }
  }
  return { values, missingCount };
}

export function runDescriptiveAnalysis(
  dataset: IngestedDatasetPackage,
  normalizedKey: string,
  timestamp = new Date().toISOString()
): ReproducibleAnalysisRun {
  const col = dataset.columns.find((c) => c.normalizedName === normalizedKey);
  const varName = col?.originalName ?? normalizedKey;
  const unit = col?.detectedUnit ?? null;
  const { values, missingCount } = extractNumericSeries(dataset, normalizedKey);
  const total = values.length + missingCount;
  const missingPct = total > 0 ? Number(((missingCount / total) * 100).toFixed(1)) : 0;

  const baseRun: Omit<ReproducibleAnalysisRun, 'sampleCount'> = {
    runId: `run-desc-${normalizedKey}-${Date.now()}`,
    datasetId: dataset.provenance.datasetId,
    datasetFilename: dataset.provenance.originalFilename,
    sourceUrl: dataset.provenance.sourceUrl,
    sourceVersion: computeDatasetFingerprint(dataset),
    dataLayer: 'DERIVED_STATISTICS',
    method: 'DESCRIPTIVE_STATS',
    calculationMethodLabel: 'Descriptive Statistics (Mean, Median, Min/Max, Sample StdDev n-1)',
    inputVariables: [varName],
    units: { [varName]: unit },
    missingDataHandling: 'Pairwise/column exclusion of null & non-numeric values (no zero substitution or imputation).',
    processingSteps: [
      `Selected normalized numeric column "${varName}" (${normalizedKey}) from ${dataset.provenance.originalFilename}.`,
      `Excluded ${missingCount} missing/invalid cell(s); retained ${values.length} valid numeric observations.`,
      'Computed arithmetic mean, sorted median, sample minimum/maximum, and Bessel-corrected sample standard deviation (n-1).',
    ],
    softwareVersion: FLAREX_ANALYSIS_SOFTWARE_VERSION,
    timestamp,
    limitations: [
      'Calculated summary metrics ONLY — must not be cited as raw NASA measurements.',
      unit ? `All outputs share unit "${unit}".` : 'Unit not explicitly specified in source header; verify original metadata.',
    ],
  };

  if (values.length === 0) {
    return {
      ...baseRun,
      sampleCount: 0,
      errorMessage: `No valid numeric observations exist for "${varName}" to calculate descriptive statistics.`,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const stdDev =
    sorted.length >= 2
      ? Math.sqrt(
          sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
            (sorted.length - 1)
        )
      : null;

  // Build 6-bin histogram when span > 0
  const histogram: HistogramBinOutput[] = [];
  if (max > min && sorted.length >= 3) {
    const binCount = Math.min(6, sorted.length);
    const width = (max - min) / binCount;
    for (let i = 0; i < binCount; i += 1) {
      const bMin = min + i * width;
      const bMax = i === binCount - 1 ? max : min + (i + 1) * width;
      const count = sorted.filter((v) =>
        i === binCount - 1 ? v >= bMin && v <= bMax : v >= bMin && v < bMax
      ).length;
      histogram.push({
        binLabel: `${roundStat(bMin)}–${roundStat(bMax)}`,
        minInclusive: roundStat(bMin),
        maxInclusive: roundStat(bMax),
        count,
      });
    }
  }

  return {
    ...baseRun,
    sampleCount: sorted.length,
    descriptive: {
      variable: varName,
      normalizedKey,
      unit,
      sampleCount: sorted.length,
      missingCount,
      missingPct,
      mean: roundStat(mean),
      median: roundStat(median),
      min: roundStat(min),
      max: roundStat(max),
      stdDev: stdDev !== null ? roundStat(stdDev) : null,
    },
    histogram,
  };
}

export function runCorrelationAnalysis(
  dataset: IngestedDatasetPackage,
  xKey: string,
  yKey: string,
  timestamp = new Date().toISOString()
): ReproducibleAnalysisRun {
  const xCol = dataset.columns.find((c) => c.normalizedName === xKey);
  const yCol = dataset.columns.find((c) => c.normalizedName === yKey);
  const xName = xCol?.originalName ?? xKey;
  const yName = yCol?.originalName ?? yKey;
  const xUnit = xCol?.detectedUnit ?? null;
  const yUnit = yCol?.detectedUnit ?? null;

  const pairs: Array<{ x: number; y: number }> = [];
  let droppedPairs = 0;
  for (const row of dataset.normalizedRows) {
    const xv = row[xKey];
    const yv = row[yKey];
    if (
      typeof xv === 'number' &&
      Number.isFinite(xv) &&
      typeof yv === 'number' &&
      Number.isFinite(yv)
    ) {
      pairs.push({ x: xv, y: yv });
    } else {
      droppedPairs += 1;
    }
  }

  const baseRun: ReproducibleAnalysisRun = {
    runId: `run-corr-${xKey}-${yKey}-${Date.now()}`,
    datasetId: dataset.provenance.datasetId,
    datasetFilename: dataset.provenance.originalFilename,
    sourceUrl: dataset.provenance.sourceUrl,
    sourceVersion: computeDatasetFingerprint(dataset),
    dataLayer: 'DERIVED_STATISTICS',
    method: 'PEARSON_CORRELATION',
    calculationMethodLabel: 'Pearson Linear Correlation Coefficient (r)',
    inputVariables: [xName, yName],
    units: { [xName]: xUnit, [yName]: yUnit },
    sampleCount: pairs.length,
    missingDataHandling: `Listwise pair deletion: excluded ${droppedPairs} row(s) with missing or non-numeric X/Y values.`,
    processingSteps: [
      `Extracted paired numeric observations for "${xName}" and "${yName}".`,
      `Evaluated ${pairs.length} complete pair(s) (excluded ${droppedPairs} incomplete row(s)).`,
      'Computed covariance normalized by sample standard deviations.',
    ],
    softwareVersion: FLAREX_ANALYSIS_SOFTWARE_VERSION,
    timestamp,
    limitations: [
      'Correlation measures linear co-variation ONLY and does NOT establish physical causation.',
      'Small sample sizes or uncontrolled experimental variables (O2, airflow, pressure) can confound apparent linear trends.',
    ],
  };

  if (xKey === yKey) {
    return {
      ...baseRun,
      errorMessage: 'Select two distinct numeric variables to calculate correlation.',
    };
  }
  if (pairs.length < 3) {
    return {
      ...baseRun,
      errorMessage: `Correlation requires at least 3 valid paired numeric observations (found ${pairs.length}).`,
    };
  }

  const n = pairs.length;
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const p of pairs) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) {
    return {
      ...baseRun,
      errorMessage: 'Pearson correlation is undefined when either variable has zero variance across selected pairs.',
    };
  }

  const r = Math.max(-1, Math.min(1, num / Math.sqrt(denX * denY)));
  const absR = Math.abs(r);
  const strength =
    absR >= 0.8 ? 'strong' : absR >= 0.5 ? 'moderate' : absR >= 0.3 ? 'weak' : 'negligible';

  return {
    ...baseRun,
    correlation: {
      xVariable: xName,
      xUnit,
      yVariable: yName,
      yUnit,
      pairCount: n,
      pearsonR: roundStat(r),
      interpretationNote: `Observed ${strength} ${r >= 0 ? 'positive' : 'negative'} linear association (r = ${roundStat(r)}, n = ${n}). Does NOT imply causation.`,
    },
  };
}

export function runTimeSeriesSummaryAnalysis(
  dataset: IngestedDatasetPackage,
  timeKey: string,
  valueKey: string,
  timestamp = new Date().toISOString()
): ReproducibleAnalysisRun {
  const tCol = dataset.columns.find((c) => c.normalizedName === timeKey);
  const vCol = dataset.columns.find((c) => c.normalizedName === valueKey);
  const tName = tCol?.originalName ?? timeKey;
  const vName = vCol?.originalName ?? valueKey;

  const series: Array<{ t: number; v: number }> = [];
  let dropped = 0;
  for (const row of dataset.normalizedRows) {
    const tv = row[timeKey];
    const vv = row[valueKey];
    if (
      typeof tv === 'number' &&
      Number.isFinite(tv) &&
      typeof vv === 'number' &&
      Number.isFinite(vv)
    ) {
      series.push({ t: tv, v: vv });
    } else {
      dropped += 1;
    }
  }

  const baseRun: ReproducibleAnalysisRun = {
    runId: `run-ts-${timeKey}-${valueKey}-${Date.now()}`,
    datasetId: dataset.provenance.datasetId,
    datasetFilename: dataset.provenance.originalFilename,
    sourceUrl: dataset.provenance.sourceUrl,
    sourceVersion: computeDatasetFingerprint(dataset),
    dataLayer: 'DERIVED_STATISTICS',
    method: 'TIME_SERIES_SUMMARY',
    calculationMethodLabel: 'Ordered Sequence / Time-Series Range Summary',
    inputVariables: [tName, vName],
    units: {
      [tName]: tCol?.detectedUnit ?? null,
      [vName]: vCol?.detectedUnit ?? null,
    },
    sampleCount: series.length,
    missingDataHandling: `Excluded ${dropped} incomplete row(s) lacking numeric sequence/value pairs.`,
    processingSteps: [
      `Paired numeric ordering column "${tName}" with response variable "${vName}".`,
      'Checked monotonicity before computing start/end/peak/trough metrics.',
    ],
    softwareVersion: FLAREX_ANALYSIS_SOFTWARE_VERSION,
    timestamp,
    limitations: [
      'Time-series summaries describe observed discrete samples only; no continuous interpolation is fabricated between samples.',
    ],
  };

  if (series.length < 2) {
    return {
      ...baseRun,
      errorMessage: 'Time-series summary requires at least 2 valid numeric (time, value) pairs.',
    };
  }

  let isMonotonicIncreasing = true;
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].t < series[i - 1].t) {
      isMonotonicIncreasing = false;
      break;
    }
  }

  const ordered = isMonotonicIncreasing
    ? series
    : [...series].sort((a, b) => a.t - b.t);
  const vals = ordered.map((p) => p.v);

  return {
    ...baseRun,
    timeSeriesSummary: {
      timeVariable: tName,
      timeUnit: tCol?.detectedUnit ?? null,
      valueVariable: vName,
      valueUnit: vCol?.detectedUnit ?? null,
      pointCount: ordered.length,
      timeStart: roundStat(ordered[0].t),
      timeEnd: roundStat(ordered[ordered.length - 1].t),
      isMonotonicIncreasing,
      startValue: roundStat(ordered[0].v),
      endValue: roundStat(ordered[ordered.length - 1].v),
      netDelta: roundStat(ordered[ordered.length - 1].v - ordered[0].v),
      peakValue: roundStat(Math.max(...vals)),
      troughValue: roundStat(Math.min(...vals)),
    },
  };
}

export function reproduceAnalysisRun(
  priorRun: ReproducibleAnalysisRun,
  dataset: IngestedDatasetPackage
): ReproducibleAnalysisRun {
  const varKeys = priorRun.inputVariables.map(
    (origName) =>
      dataset.columns.find((c) => c.originalName === origName)?.normalizedName ??
      origName
  );
  if (priorRun.method === 'PEARSON_CORRELATION' && varKeys.length >= 2) {
    return runCorrelationAnalysis(dataset, varKeys[0], varKeys[1]);
  }
  if (priorRun.method === 'TIME_SERIES_SUMMARY' && varKeys.length >= 2) {
    return runTimeSeriesSummaryAnalysis(dataset, varKeys[0], varKeys[1]);
  }
  return runDescriptiveAnalysis(dataset, varKeys[0] ?? '');
}
