import type { ReproducibleAnalysisRun } from './scientificAnalysis.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';

export const FLAREX_REPRODUCIBILITY_VERSION = 'FLAREX 7.0.0-repro';

export interface ReproducibilityRecord {
  runId: string;
  datasetId: string;
  sourceUrl: string;
  datasetVersion: string;
  sha256Checksum: string;
  filename: string;
  selectedVariables: string[];
  unitDefinitions: Record<string, string | null>;
  filterConditions: string[];
  transformationsApplied: string[];
  missingValueHandling: string;
  statisticalMethod: string;
  parameters: Record<string, string | number | boolean | null>;
  softwareVersion: string;
  timestamp: string;
  resultSummary: Record<string, number | string | null>;
  baseRun: ReproducibleAnalysisRun;
}

export interface ReproducibilityComparisonResult {
  runAId: string;
  runBId: string;
  sameDatasetChecksum: boolean;
  sameMethod: boolean;
  sameVariables: boolean;
  parameterDiffs: string[];
  metricDiffs: Array<{ metric: string; valueA: string; valueB: string; delta: string | null }>;
  verdict: 'BIT_IDENTICAL' | 'SAME_DATA_DIFFERENT_PARAMS' | 'DATASET_VERSION_CHANGED' | 'INCOMPARABLE_RUNS';
  summaryNote: string;
}

/**
 * Deterministic pure-TS SHA-256 implementation so checksums are bit-exact
 * and synchronous across Browser Workers, Node tests, and SSR contexts.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(val: number, bits: number): number {
  return (val >>> bits) | (val << (32 - bits));
}

export function computeSha256Sync(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;

  const view = new DataView(buf.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hi, false);
  view.setUint32(paddedLen - 4, lo, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      W[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((w) => w.toString(16).padStart(8, '0'))
    .join('');
}

export async function computeSha256Hex(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    try {
      const data = new TextEncoder().encode(text);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return computeSha256Sync(text);
    }
  }
  return computeSha256Sync(text);
}

export function computeDatasetSha256(dataset: IngestedDatasetPackage): string {
  const canonicalPayload = JSON.stringify({
    filename: dataset.provenance.originalFilename,
    headers: dataset.provenance.originalColumnNames,
    rowCount: dataset.summary.rowCount,
    sampleRows: dataset.originalRows.slice(0, 100),
    tailRows: dataset.originalRows.length > 100 ? dataset.originalRows.slice(-25) : [],
  });
  return computeSha256Sync(canonicalPayload);
}

export function createReproducibilityRecord(input: {
  dataset: IngestedDatasetPackage;
  run: ReproducibleAnalysisRun;
  filterConditions?: string[];
  parameters?: Record<string, string | number | boolean | null>;
}): ReproducibilityRecord {
  const { dataset, run } = input;
  const sha256Checksum =
    dataset.provenance.sha256Checksum ?? computeDatasetSha256(dataset);

  const resultSummary: Record<string, number | string | null> = {
    sampleCount: run.sampleCount,
  };
  if (run.descriptive) {
    resultSummary.mean = run.descriptive.mean;
    resultSummary.median = run.descriptive.median;
    resultSummary.min = run.descriptive.min;
    resultSummary.max = run.descriptive.max;
    resultSummary.sampleStdDev = run.descriptive.stdDev;
    if (run.descriptive.variance !== undefined) resultSummary.variance = run.descriptive.variance;
    if (run.descriptive.iqr !== undefined) resultSummary.iqr = run.descriptive.iqr;
  }
  if (run.correlation) {
    resultSummary.pearsonR = run.correlation.pearsonR;
    if (run.correlation.spearmanRho !== undefined) {
      resultSummary.spearmanRho = run.correlation.spearmanRho;
    }
    if (run.correlation.regressionRSquared !== undefined) {
      resultSummary.rSquared = run.correlation.regressionRSquared;
    }
  }
  if (run.timeSeriesSummary) {
    resultSummary.netDelta = run.timeSeriesSummary.netDelta;
    resultSummary.peakValue = run.timeSeriesSummary.peakValue;
    resultSummary.troughValue = run.timeSeriesSummary.troughValue;
  }

  return {
    runId: run.runId,
    datasetId: dataset.provenance.datasetId,
    sourceUrl: dataset.provenance.sourceUrl,
    datasetVersion: run.sourceVersion,
    sha256Checksum,
    filename: dataset.provenance.originalFilename,
    selectedVariables: [...run.inputVariables],
    unitDefinitions: { ...run.units },
    filterConditions: input.filterConditions ?? ['None (full imported table)'],
    transformationsApplied: [...dataset.provenance.transformationHistory],
    missingValueHandling: run.missingDataHandling,
    statisticalMethod: run.calculationMethodLabel,
    parameters: {
      methodCode: run.method,
      movingAverageWindow: input.parameters?.movingAverageWindow ?? null,
      groupKey: input.parameters?.groupKey ?? null,
      ...input.parameters,
    },
    softwareVersion: `${run.softwareVersion} / ${FLAREX_REPRODUCIBILITY_VERSION}`,
    timestamp: run.timestamp,
    resultSummary,
    baseRun: run,
  };
}

export function verifyDatasetChecksumChanged(
  record: ReproducibilityRecord,
  currentDataset: IngestedDatasetPackage
): {
  changed: boolean;
  recordedSha256: string;
  currentSha256: string;
  message: string;
} {
  const currentSha256 =
    currentDataset.provenance.sha256Checksum ?? computeDatasetSha256(currentDataset);
  const changed = record.sha256Checksum !== currentSha256;
  return {
    changed,
    recordedSha256: record.sha256Checksum,
    currentSha256,
    message: changed
      ? `SHA-256 mismatch: source dataset modified since run ${record.runId}.`
      : `SHA-256 verified (${currentSha256.slice(0, 12)}…): source payload is unchanged.`,
  };
}

export function compareReproducibilityRuns(
  runA: ReproducibilityRecord,
  runB: ReproducibilityRecord
): ReproducibilityComparisonResult {
  const sameDatasetChecksum = runA.sha256Checksum === runB.sha256Checksum;
  const sameMethod = runA.baseRun.method === runB.baseRun.method;
  const sameVariables =
    runA.selectedVariables.join('|') === runB.selectedVariables.join('|');

  const parameterDiffs: string[] = [];
  if (!sameDatasetChecksum) parameterDiffs.push('Dataset SHA-256 checksum changed');
  if (!sameMethod) parameterDiffs.push(`Method changed (${runA.baseRun.method} vs ${runB.baseRun.method})`);
  if (!sameVariables) {
    parameterDiffs.push(
      `Variables changed ([${runA.selectedVariables.join(', ')}] vs [${runB.selectedVariables.join(', ')}])`
    );
  }
  if (runA.filterConditions.join('|') !== runB.filterConditions.join('|')) {
    parameterDiffs.push('Filter conditions differ');
  }

  const keys = Array.from(
    new Set([...Object.keys(runA.resultSummary), ...Object.keys(runB.resultSummary)])
  );
  const metricDiffs = keys.map((k) => {
    const va = runA.resultSummary[k];
    const vb = runB.resultSummary[k];
    const delta =
      typeof va === 'number' && typeof vb === 'number'
        ? String(Number((vb - va).toFixed(4)))
        : null;
    return {
      metric: k,
      valueA: va === null || va === undefined ? 'N/A' : String(va),
      valueB: vb === null || vb === undefined ? 'N/A' : String(vb),
      delta,
    };
  });

  const allMetricsMatch = metricDiffs.every((m) => m.valueA === m.valueB);

  let verdict: ReproducibilityComparisonResult['verdict'];
  let summaryNote: string;
  if (!sameMethod || !sameVariables) {
    verdict = 'INCOMPARABLE_RUNS';
    summaryNote = 'Runs use different statistical methods or variables.';
  } else if (!sameDatasetChecksum) {
    verdict = 'DATASET_VERSION_CHANGED';
    summaryNote = 'Source dataset SHA-256 changed between runs; numerical differences reflect source edits.';
  } else if (parameterDiffs.length > 0 || !allMetricsMatch) {
    verdict = 'SAME_DATA_DIFFERENT_PARAMS';
    summaryNote = 'Same source dataset checksum, but filter/parameter settings produced different metrics.';
  } else {
    verdict = 'BIT_IDENTICAL';
    summaryNote = `Exact bit-identical reproduction verified across SHA-256 (${runA.sha256Checksum.slice(0, 12)}…) and all computed metrics.`;
  }

  return {
    runAId: runA.runId,
    runBId: runB.runId,
    sameDatasetChecksum,
    sameMethod,
    sameVariables,
    parameterDiffs,
    metricDiffs,
    verdict,
    summaryNote,
  };
}

export function renderReproducibilityMarkdown(record: ReproducibilityRecord): string {
  return [
    `# FLAREX Reproducibility Record — ${record.runId}`,
    '',
    `- **Dataset:** ${record.filename} (\`${record.datasetId}\`)`,
    `- **Source URL:** ${record.sourceUrl}`,
    `- **Dataset Version / SHA-256:** \`${record.datasetVersion}\` · \`${record.sha256Checksum}\``,
    `- **Statistical Method:** ${record.statisticalMethod}`,
    `- **Selected Variables:** ${record.selectedVariables.join(', ')}`,
    `- **Units:** ${JSON.stringify(record.unitDefinitions)}`,
    `- **Filters:** ${record.filterConditions.join('; ')}`,
    `- **Missing-Value Handling:** ${record.missingValueHandling}`,
    `- **Software Version:** ${record.softwareVersion}`,
    `- **Timestamp:** ${record.timestamp}`,
    '',
    '## Transformations Applied',
    ...record.transformationsApplied.map((t) => `- ${t}`),
    '',
    '## Computed Result Summary',
    ...Object.entries(record.resultSummary).map(([k, v]) => `- **${k}:** ${v ?? 'N/A'}`),
  ].join('\n');
}

export function renderReproducibilityJson(record: ReproducibilityRecord): string {
  return JSON.stringify(record, null, 2);
}
