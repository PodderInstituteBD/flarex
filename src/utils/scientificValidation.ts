import {
  DataValidationCheckResult,
  RawValidationDiagnostics,
  runTwelveDataValidationChecks,
} from './dataValidation.ts';
import type { ReproducibleAnalysisRun } from './scientificAnalysis.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';

export type DatasetReadinessLevel =
  | 'READY_FOR_ANALYSIS'
  | 'USABLE_WITH_CAVEATS'
  | 'REQUIRES_CLEANING'
  | 'NOT_SUITABLE_FOR_NUMERICAL_ANALYSIS';

export interface DatasetQualityReport {
  datasetId: string;
  filename: string;
  generatedAt: string;
  totalRows: number;
  validObservations: number;
  missingObservations: number;
  invalidObservations: number;
  duplicateObservations: number;
  numericalColumns: string[];
  detectedUnits: Record<string, string | null>;
  checks: DataValidationCheckResult[];
  validationWarnings: string[];
  validationErrors: string[];
  readinessAssessment: DatasetReadinessLevel;
  readinessRationale: string;
  statisticalGuardrails: string[];
}

export function buildDatasetQualityReport(
  dataset: IngestedDatasetPackage,
  runsForDataset: ReproducibleAnalysisRun[] = [],
  generatedAt = new Date().toISOString()
): DatasetQualityReport {
  const diag: RawValidationDiagnostics = runTwelveDataValidationChecks(dataset);
  const numericalColumns = dataset.columns
    .filter(
      (c) =>
        c.inferredType === 'numeric' ||
        c.inferredType === 'mixed' ||
        (c.inferredType === 'temporal' && c.validNumericCount > 0)
    )
    .map((c) => c.originalName);

  const failCount = diag.checks.filter((c) => c.status === 'FAIL').length;
  const warnCount = diag.checks.filter((c) => c.status === 'WARNING').length;

  let readinessAssessment: DatasetReadinessLevel;
  let readinessRationale: string;

  if (
    dataset.provenance.importStatus === 'FAILED' ||
    dataset.summary.rowCount === 0 ||
    numericalColumns.length === 0
  ) {
    readinessAssessment = 'NOT_SUITABLE_FOR_NUMERICAL_ANALYSIS';
    readinessRationale =
      numericalColumns.length === 0
        ? 'Criteria failure: 0 numeric columns detected in imported file.'
        : 'Criteria failure: dataset import failed or contains 0 rows.';
  } else if (failCount > 0 || diag.errors.length > 0) {
    readinessAssessment = 'REQUIRES_CLEANING';
    readinessRationale = `Criteria alert: ${failCount} validation check(s) failed (e.g., physical range, >35% missing, unit mismatch, or out-of-order timestamps).`;
  } else if (warnCount > 0 || diag.warnings.length > 0 || dataset.summary.rowCount < 5) {
    readinessAssessment = 'USABLE_WITH_CAVEATS';
    readinessRationale = `Explicit criteria: no critical errors, but ${warnCount} warning check(s) (missing cells, duplicates, small sample n, or outlier flags) must be disclosed alongside statistics.`;
  } else {
    readinessAssessment = 'READY_FOR_ANALYSIS';
    readinessRationale =
      'Explicit criteria met: zero missing/invalid values, zero duplicates, consistent units, valid ranges, and n >= 5 observations.';
  }

  const statisticalGuardrails = [
    'Original uploaded strings remain immutable in originalRows; missing/invalid numeric tokens are stored as null (never 0).',
    'Standard deviation uses Bessel-corrected sample formula (n - 1) and returns null when n < 2.',
    'Pearson correlation quantifies linear co-variation only and never establishes physical causation.',
    'Potential IQR outliers are flagged for inspection and never automatically deleted.',
  ];

  if (dataset.summary.rowCount < 5) {
    statisticalGuardrails.push(
      `Small sample size caveat: n=${dataset.summary.rowCount} rows limits distributional and correlation inference.`
    );
  }
  for (const run of runsForDataset) {
    if (run.sampleCount < 5) {
      statisticalGuardrails.push(
        `Analysis run ${run.runId} used n=${run.sampleCount} valid observations — treat summary metrics as descriptive only.`
      );
    }
  }

  return {
    datasetId: dataset.provenance.datasetId,
    filename: dataset.provenance.originalFilename,
    generatedAt,
    totalRows: diag.totalRows,
    validObservations: diag.validNumericObservations,
    missingObservations: diag.missingObservations,
    invalidObservations: diag.invalidNumericObservations,
    duplicateObservations: diag.duplicateRowCount,
    numericalColumns,
    detectedUnits: diag.detectedUnits,
    checks: diag.checks,
    validationWarnings: diag.warnings,
    validationErrors: diag.errors,
    readinessAssessment,
    readinessRationale,
    statisticalGuardrails: Array.from(new Set(statisticalGuardrails)),
  };
}
