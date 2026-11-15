import type { IngestedDatasetPackage } from './scientificIngestion.ts';

export type ValidationCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT APPLICABLE';

export interface DataValidationCheckResult {
  checkNumber: number;
  checkName: string;
  status: ValidationCheckStatus;
  summary: string;
  affectedColumns: string[];
}

export interface RawValidationDiagnostics {
  totalRows: number;
  totalCells: number;
  validNumericObservations: number;
  missingObservations: number;
  invalidNumericObservations: number;
  duplicateRowCount: number;
  numericalColumnCount: number;
  detectedUnits: Record<string, string | null>;
  outlierCountsByColumn: Record<string, number>;
  checks: DataValidationCheckResult[];
  warnings: string[];
  errors: string[];
}

function computeQuartiles(sorted: number[]): { q1: number; q3: number } {
  const quantile = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return { q1: quantile(0.25), q3: quantile(0.75) };
}

export function runTwelveDataValidationChecks(
  dataset: IngestedDatasetPackage
): RawValidationDiagnostics {
  const totalRows = dataset.summary.rowCount;
  const totalCells = totalRows * dataset.summary.columnCount;
  const warnings: string[] = [...dataset.summary.warnings];
  const errors: string[] = [...dataset.summary.errors];
  const checks: DataValidationCheckResult[] = [];

  let validNumericObservations = 0;
  const detectedUnits: Record<string, string | null> = {};
  const outlierCountsByColumn: Record<string, number> = {};

  for (const col of dataset.columns) {
    validNumericObservations += col.validNumericCount;
    detectedUnits[col.originalName] = col.detectedUnit;
  }

  // 1. Missing-value analysis
  const missingCols = dataset.columns
    .filter((c) => c.missingCount > 0)
    .map((c) => `${c.originalName} (${c.missingPct}%)`);
  checks.push({
    checkNumber: 1,
    checkName: 'Missing-value analysis',
    status:
      dataset.summary.totalMissingCells === 0
        ? 'PASS'
        : dataset.summary.missingPctOverall > 35
        ? 'FAIL'
        : 'WARNING',
    summary:
      dataset.summary.totalMissingCells === 0
        ? 'Zero missing observations across all columns.'
        : `${dataset.summary.totalMissingCells} missing cells (${dataset.summary.missingPctOverall}% overall) mapped to null without zero substitution.`,
    affectedColumns: missingCols,
  });

  // 2. Duplicate observations
  checks.push({
    checkNumber: 2,
    checkName: 'Duplicate observations',
    status: dataset.summary.duplicateRowCount > 0 ? 'WARNING' : 'PASS',
    summary:
      dataset.summary.duplicateRowCount > 0
        ? `${dataset.summary.duplicateRowCount} exact duplicate row(s) detected and retained unmodified in originalRows.`
        : 'No duplicate rows detected.',
    affectedColumns: [],
  });

  // 3. Invalid numerical values
  const invalidCols = dataset.columns
    .filter((c) => c.invalidNumericCount > 0)
    .map((c) => `${c.originalName} (${c.invalidNumericCount})`);
  checks.push({
    checkNumber: 3,
    checkName: 'Invalid numerical values',
    status: dataset.summary.totalInvalidNumericCells > 0 ? 'WARNING' : 'PASS',
    summary:
      dataset.summary.totalInvalidNumericCells > 0
        ? `${dataset.summary.totalInvalidNumericCells} malformed/non-numeric token(s) inside numeric fields preserved as null.`
        : 'All numeric field entries parse cleanly as finite numbers or explicit missing tokens.',
    affectedColumns: invalidCols,
  });

  // 4. Unit consistency
  const numericCols = dataset.columns.filter(
    (c) =>
      c.inferredType === 'numeric' ||
      c.inferredType === 'mixed' ||
      (c.inferredType === 'temporal' && c.validNumericCount > 0)
  );
  const missingUnitCols = numericCols
    .filter((c) => !c.detectedUnit && !/count|id|year|index|trial/i.test(c.originalName))
    .map((c) => c.originalName);
  const unitMismatchCols = dataset.columns
    .filter((c) => /celsius|degc/i.test(c.originalName) && c.detectedUnit === 'K')
    .map((c) => c.originalName);
  const unitIssues = [...missingUnitCols, ...unitMismatchCols];
  if (missingUnitCols.length > 0) {
    warnings.push(`Numeric column(s) lack explicit header unit tags: ${missingUnitCols.join(', ')}.`);
  }
  checks.push({
    checkNumber: 4,
    checkName: 'Unit consistency',
    status:
      numericCols.length === 0
        ? 'NOT APPLICABLE'
        : unitMismatchCols.length > 0
        ? 'FAIL'
        : missingUnitCols.length > 0
        ? 'WARNING'
        : 'PASS',
    summary:
      numericCols.length === 0
        ? 'No numeric columns present for unit audit.'
        : unitIssues.length === 0
        ? 'All physical numeric columns declare consistent unit metadata.'
        : `Unit ambiguity or missing unit tag in: ${unitIssues.join(', ')}.`,
    affectedColumns: unitIssues,
  });

  // 5. Unexpected measurement ranges
  const rangeIssues: string[] = [];
  for (const col of numericCols) {
    const vals = dataset.normalizedRows
      .map((r) => r[col.normalizedName])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length === 0) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const lowerName = col.originalName.toLowerCase();
    if (
      (col.detectedUnit === 'K' || /kelvin/.test(lowerName)) &&
      min < 0
    ) {
      rangeIssues.push(`${col.originalName}: negative Kelvin (${min} K)`);
      errors.push(`Physical range error: negative Kelvin in ${col.originalName} (${min}).`);
    }
    if (
      (col.detectedUnit === '%' || /o2|oxygen/.test(lowerName)) &&
      (min < 0 || max > 100)
    ) {
      rangeIssues.push(`${col.originalName}: percentage out of [0,100] (${min}..${max})`);
      warnings.push(`Unexpected O2/% range in ${col.originalName}: [${min}, ${max}].`);
    }
    if (/pressure|atm|kpa|psi/i.test(lowerName) && min < 0) {
      rangeIssues.push(`${col.originalName}: negative pressure (${min})`);
      errors.push(`Physical range error: negative pressure in ${col.originalName} (${min}).`);
    }
  }
  checks.push({
    checkNumber: 5,
    checkName: 'Unexpected measurement ranges',
    status:
      numericCols.length === 0
        ? 'NOT APPLICABLE'
        : errors.some((e) => e.startsWith('Physical range error'))
        ? 'FAIL'
        : rangeIssues.length > 0
        ? 'WARNING'
        : 'PASS',
    summary:
      numericCols.length === 0
        ? 'No numeric measurements to bounds-check.'
        : rangeIssues.length > 0
        ? rangeIssues.join('; ')
        : 'All numeric magnitudes fall within plausible physical bounds.',
    affectedColumns: rangeIssues,
  });

  // 6 & 7. Timestamp ordering & Sampling interval consistency
  const temporalCols = dataset.columns.filter(
    (c) => c.inferredType === 'temporal' && c.validNumericCount >= 2
  );
  let orderingIssueCols: string[] = [];
  let intervalIssueCols: string[] = [];

  for (const tCol of temporalCols) {
    const seq = dataset.normalizedRows
      .map((r) => r[tCol.normalizedName])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    let nonMonotonic = false;
    const deltas: number[] = [];
    for (let i = 1; i < seq.length; i += 1) {
      const diff = seq[i] - seq[i - 1];
      if (diff < 0) nonMonotonic = true;
      if (diff > 0) deltas.push(diff);
    }
    if (nonMonotonic) {
      orderingIssueCols.push(tCol.originalName);
      warnings.push(`Timestamp column "${tCol.originalName}" is not monotonically ordered.`);
    }
    if (deltas.length >= 2) {
      const meanDelta = deltas.reduce((s, v) => s + v, 0) / deltas.length;
      const maxDev = Math.max(...deltas.map((d) => Math.abs(d - meanDelta)));
      if (meanDelta > 0 && maxDev / meanDelta > 0.5) {
        intervalIssueCols.push(tCol.originalName);
        warnings.push(`Sampling intervals in "${tCol.originalName}" vary by >50% around mean step.`);
      }
    }
  }

  checks.push({
    checkNumber: 6,
    checkName: 'Timestamp ordering',
    status:
      temporalCols.length === 0
        ? 'NOT APPLICABLE'
        : orderingIssueCols.length > 0
        ? 'FAIL'
        : 'PASS',
    summary:
      temporalCols.length === 0
        ? 'No numeric temporal column detected.'
        : orderingIssueCols.length > 0
        ? `Out-of-order or decreasing timestamps in: ${orderingIssueCols.join(', ')}.`
        : `Monotonic non-decreasing order verified on ${temporalCols.map((c) => c.originalName).join(', ')}.`,
    affectedColumns: orderingIssueCols,
  });

  checks.push({
    checkNumber: 7,
    checkName: 'Sampling interval consistency',
    status:
      temporalCols.length === 0
        ? 'NOT APPLICABLE'
        : intervalIssueCols.length > 0
        ? 'WARNING'
        : 'PASS',
    summary:
      temporalCols.length === 0
        ? 'No numeric temporal column detected.'
        : intervalIssueCols.length > 0
        ? `Irregular sampling intervals detected in: ${intervalIssueCols.join(', ')}.`
        : 'Sampling intervals remain uniform across temporal sequence.',
    affectedColumns: intervalIssueCols,
  });

  // 8. Constant columns
  const constantCols: string[] = [];
  for (const col of dataset.columns) {
    const distinct = new Set(
      dataset.normalizedRows
        .map((r) => r[col.normalizedName])
        .filter((v) => v !== null && v !== '')
        .map((v) => String(v))
    );
    if (totalRows >= 2 && distinct.size === 1) {
      constantCols.push(col.originalName);
    }
  }
  checks.push({
    checkNumber: 8,
    checkName: 'Constant columns',
    status: constantCols.length > 0 ? 'WARNING' : 'PASS',
    summary:
      constantCols.length > 0
        ? `Zero-variance / constant column(s) detected: ${constantCols.join(', ')}.`
        : 'All columns contain varying values across rows.',
    affectedColumns: constantCols,
  });

  // 9. Potential outliers (IQR rule — strictly flagged, never deleted)
  const outlierCols: string[] = [];
  for (const col of numericCols) {
    const vals = dataset.normalizedRows
      .map((r) => r[col.normalizedName])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length < 4) continue;
    const { q1, q3 } = computeQuartiles(vals);
    const iqr = q3 - q1;
    if (iqr <= 0) continue;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const count = vals.filter((v) => v < lo || v > hi).length;
    outlierCountsByColumn[col.originalName] = count;
    if (count > 0) {
      outlierCols.push(`${col.originalName} (${count})`);
      warnings.push(
        `Potential statistical outliers (1.5×IQR) in "${col.originalName}": ${count} point(s) flagged and retained intact.`
      );
    }
  }
  checks.push({
    checkNumber: 9,
    checkName: 'Potential outliers (non-destructive 1.5×IQR)',
    status:
      numericCols.length === 0
        ? 'NOT APPLICABLE'
        : outlierCols.length > 0
        ? 'WARNING'
        : 'PASS',
    summary:
      numericCols.length === 0
        ? 'No numeric columns available for outlier inspection.'
        : outlierCols.length > 0
        ? `Potential outliers retained intact (never auto-deleted): ${outlierCols.join(', ')}.`
        : 'No extreme IQR outliers detected.',
    affectedColumns: outlierCols,
  });

  // 10. Dataset metadata completeness
  const metaMissing: string[] = [];
  if (!dataset.provenance.originalFilename) metaMissing.push('filename');
  if (!dataset.provenance.datasetDescription || dataset.provenance.datasetDescription.length < 10) {
    metaMissing.push('description');
  }
  if (!dataset.provenance.retrievalDate) metaMissing.push('retrievalDate');
  checks.push({
    checkNumber: 10,
    checkName: 'Dataset metadata completeness',
    status: metaMissing.length > 0 ? 'WARNING' : 'PASS',
    summary:
      metaMissing.length > 0
        ? `Missing metadata field(s): ${metaMissing.join(', ')}.`
        : 'Filename, retrieval date, format, and dataset description are populated.',
    affectedColumns: metaMissing,
  });

  // 11. Column type consistency
  const mixedCols = dataset.columns
    .filter((c) => c.inferredType === 'mixed')
    .map((c) => c.originalName);
  checks.push({
    checkNumber: 11,
    checkName: 'Column type consistency',
    status: mixedCols.length > 0 ? 'WARNING' : 'PASS',
    summary:
      mixedCols.length > 0
        ? `Mixed numeric + text tokens detected in: ${mixedCols.join(', ')}.`
        : 'All column data types are consistent across rows.',
    affectedColumns: mixedCols,
  });

  // 12. Source attribution completeness
  const hasRealSource =
    Boolean(dataset.provenance.sourceUrl) &&
    dataset.provenance.sourceUrl !== 'Local user upload' &&
    Boolean(dataset.provenance.repository);
  checks.push({
    checkNumber: 12,
    checkName: 'Source attribution completeness',
    status: hasRealSource ? 'PASS' : 'WARNING',
    summary: hasRealSource
      ? `Attributed to ${dataset.provenance.repository} (${dataset.provenance.sourceUrl}).`
      : 'Local upload lacks an external NASA PSI / NTRS repository URL; attach origin citation before formal reporting.',
    affectedColumns: [],
  });

  return {
    totalRows,
    totalCells,
    validNumericObservations,
    missingObservations: dataset.summary.totalMissingCells,
    invalidNumericObservations: dataset.summary.totalInvalidNumericCells,
    duplicateRowCount: dataset.summary.duplicateRowCount,
    numericalColumnCount: numericCols.length,
    detectedUnits,
    outlierCountsByColumn,
    checks,
    warnings: Array.from(new Set(warnings)),
    errors: Array.from(new Set(errors)),
  };
}
