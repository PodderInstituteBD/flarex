/// <reference lib="webworker" />
import {
  extractUnitFromHeader,
  ingestScientificTabularData,
  type IngestedDatasetPackage,
  isMissingCellValue,
  parseStrictNumericValue,
} from '../utils/scientificIngestion.ts';
import { computeSha256Sync } from '../utils/reproducibilityEngine.ts';

export interface WorkerProcessRequest {
  type: 'PROCESS_DATASET';
  jobId: string;
  filename: string;
  content: string;
  sourceUrl?: string;
  repository?: string;
  investigationId?: string | null;
  chunkSize?: number;
}

export type WorkerOutboundMessage =
  | {
      type: 'PROGRESS';
      jobId: string;
      processedRows: number;
      estimatedTotalRows: number;
      percent: number;
    }
  | {
      type: 'COMPLETE';
      jobId: string;
      dataset: IngestedDatasetPackage;
      elapsedMs: number;
      chunkCount: number;
    }
  | {
      type: 'ERROR';
      jobId: string;
      message: string;
    };

function processDelimitedChunked(req: WorkerProcessRequest): {
  dataset: IngestedDatasetPackage;
  chunkCount: number;
} {
  const chunkSize = Math.max(1000, Math.min(25_000, req.chunkSize ?? 5000));
  const lower = req.filename.toLowerCase();
  if (lower.endsWith('.json') || req.content.length < 512_000) {
    const ds = ingestScientificTabularData({
      filename: req.filename,
      content: req.content,
      sourceUrl: req.sourceUrl,
      repository: req.repository,
      investigationId: req.investigationId,
    });
    return { dataset: ds, chunkCount: 1 };
  }

  const hasBom = req.content.startsWith('\uFEFF');
  const content = hasBom ? req.content.slice(1) : req.content;
  const sha256Checksum = computeSha256Sync(req.content);
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

  if (lines.length < 2) {
    return {
      dataset: ingestScientificTabularData({
        filename: req.filename,
        content: req.content,
        sourceUrl: req.sourceUrl,
        repository: req.repository,
        investigationId: req.investigationId,
      }),
      chunkCount: 1,
    };
  }

  const headerLine = lines[0];
  const delim: ',' | '\t' | ';' = lower.endsWith('.tsv')
    ? '\t'
    : (headerLine.match(/\t/g) ?? []).length > (headerLine.match(/,/g) ?? []).length
    ? '\t'
    : (headerLine.match(/;/g) ?? []).length > (headerLine.match(/,/g) ?? []).length
    ? ';'
    : ',';

  const splitLine = (line: string) =>
    delim !== ','
      ? line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))
      : line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

  const rawHeaders = splitLine(headerLine);
  const seenKeys = new Set<string>();
  const colSpecs = rawHeaders.map((orig, idx) => {
    const originalName = orig || `Column_${idx + 1}`;
    let norm =
      originalName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || `col_${idx + 1}`;
    while (seenKeys.has(norm)) norm = `${norm}_${idx + 1}`;
    seenKeys.add(norm);
    return {
      originalName,
      normalizedName: norm,
      detectedUnit: extractUnitFromHeader(originalName).unit,
      validNumericCount: 0,
      missingCount: 0,
      nonEmptyNonNumericCount: 0,
    };
  });

  const totalDataLines = lines.length - 1;
  const originalRows: Array<Record<string, string>> = [];
  const rawMatrix: string[][] = [];
  let chunkCount = 0;

  for (let start = 1; start < lines.length; start += chunkSize) {
    chunkCount += 1;
    const end = Math.min(lines.length, start + chunkSize);
    for (let r = start; r < end; r += 1) {
      const cells = splitLine(lines[r]);
      const rowSlice = colSpecs.map((_, idx) => cells[idx] ?? '');
      rawMatrix.push(rowSlice);

      // Retain full originalRows up to 100k rows cleanly
      const rawObj: Record<string, string> = {};
      for (let c = 0; c < colSpecs.length; c += 1) {
        const val = rowSlice[c];
        rawObj[colSpecs[c].originalName] = val;
        if (isMissingCellValue(val)) {
          colSpecs[c].missingCount += 1;
        } else if (parseStrictNumericValue(val) !== null) {
          colSpecs[c].validNumericCount += 1;
        } else {
          colSpecs[c].nonEmptyNonNumericCount += 1;
        }
      }
      originalRows.push(rawObj);
    }

    const processedRows = Math.min(totalDataLines, end - 1);
    self.postMessage({
      type: 'PROGRESS',
      jobId: req.jobId,
      processedRows,
      estimatedTotalRows: totalDataLines,
      percent: Math.round((processedRows / totalDataLines) * 100),
    } satisfies WorkerOutboundMessage);
  }

  let totalMissing = 0;
  let totalInvalid = 0;
  const columns = colSpecs.map((spec) => {
    const isMostlyNumeric =
      spec.validNumericCount > 0 &&
      (spec.validNumericCount >= spec.nonEmptyNonNumericCount || spec.detectedUnit !== null);
    const isTemporal = /time|year|date|timestamp|elapsed|sec/i.test(spec.originalName);
    const inferredType =
      isMostlyNumeric && spec.nonEmptyNonNumericCount === 0
        ? isTemporal
          ? ('temporal' as const)
          : ('numeric' as const)
        : isMostlyNumeric
        ? ('mixed' as const)
        : isTemporal
        ? ('temporal' as const)
        : ('categorical' as const);
    const invalidNumericCount = isMostlyNumeric ? spec.nonEmptyNonNumericCount : 0;
    totalMissing += spec.missingCount;
    totalInvalid += invalidNumericCount;
    return {
      originalName: spec.originalName,
      normalizedName: spec.normalizedName,
      detectedUnit: spec.detectedUnit,
      inferredType,
      validNumericCount: spec.validNumericCount,
      missingCount: spec.missingCount,
      invalidNumericCount,
      missingPct:
        totalDataLines > 0
          ? Number(((spec.missingCount / totalDataLines) * 100).toFixed(1))
          : 0,
    };
  });

  const normalizedRows: Array<Record<string, number | string | null>> = new Array(totalDataLines);
  const analysisRows: Array<Record<string, number | string | null>> = [];
  for (let r = 0; r < rawMatrix.length; r += 1) {
    const cells = rawMatrix[r];
    const normObj: Record<string, number | string | null> = {};
    let hasValue = false;
    for (let c = 0; c < columns.length; c += 1) {
      const col = columns[c];
      const cell = cells[c];
      if (isMissingCellValue(cell)) {
        normObj[col.normalizedName] = null;
      } else if (
        col.inferredType === 'numeric' ||
        col.inferredType === 'mixed' ||
        (col.inferredType === 'temporal' && col.validNumericCount > 0)
      ) {
        const parsed = parseStrictNumericValue(cell);
        normObj[col.normalizedName] = parsed;
        if (parsed !== null) hasValue = true;
      } else {
        const trimmed = cell.trim();
        normObj[col.normalizedName] = trimmed;
        if (trimmed) hasValue = true;
      }
    }
    normalizedRows[r] = normObj;
    if (hasValue) analysisRows.push(normObj);
  }

  const measurementUnits: Record<string, string | null> = {};
  columns.forEach((c) => {
    measurementUnits[c.originalName] = c.detectedUnit;
  });

  const totalCells = totalDataLines * columns.length;
  const warnings: string[] = [];
  if (totalDataLines > 50_000) {
    warnings.push(
      `Large dataset (${totalDataLines.toLocaleString()} rows) streamed in ${chunkCount} chunk(s) inside Web Worker.`
    );
  }

  const format = lower.endsWith('.tsv') ? 'TSV' : lower.endsWith('.txt') ? 'TXT' : 'CSV';
  const dataset: IngestedDatasetPackage = {
    provenance: {
      datasetId: `ds-wk-${req.filename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)}-${Date.now()}`,
      originalFilename: req.filename,
      sourceUrl: req.sourceUrl ?? 'Local user upload',
      repository: req.repository ?? 'Local Browser Session (Web Worker)',
      investigationId: req.investigationId ?? null,
      retrievalDate: new Date().toISOString(),
      datasetDescription: `Streamed ${format} dataset (${totalDataLines.toLocaleString()} rows × ${columns.length} columns).`,
      measurementUnits,
      originalColumnNames: columns.map((c) => c.originalName),
      importStatus: warnings.length > 0 ? 'IMPORTED_WITH_WARNINGS' : 'IMPORTED',
      transformationHistory: [
        `Streamed in ${chunkCount} chunk(s) with SHA-256 ${sha256Checksum.slice(0, 12)}…`,
        'Preserved Layer 1 (originalRows), Layer 2 (normalizedRows null-safe), Layer 3 (analysisRows).',
      ],
      format,
      byteSize: req.content.length,
      sha256Checksum,
      detectedEncoding: hasBom ? 'UTF-8 (with BOM)' : 'UTF-8 / ASCII',
      detectedDelimiter: delim,
    },
    columns,
    originalRows,
    normalizedRows,
    analysisRows,
    summary: {
      rowCount: totalDataLines,
      columnCount: columns.length,
      numericColumnCount: columns.filter(
        (c) =>
          c.inferredType === 'numeric' ||
          c.inferredType === 'mixed' ||
          (c.inferredType === 'temporal' && c.validNumericCount > 0)
      ).length,
      duplicateRowCount: 0,
      totalMissingCells: totalMissing,
      totalInvalidNumericCells: totalInvalid,
      missingPctOverall:
        totalCells > 0 ? Number(((totalMissing / totalCells) * 100).toFixed(1)) : 0,
      warnings,
      errors: [],
    },
  };

  return { dataset, chunkCount };
}

self.onmessage = (ev: MessageEvent<WorkerProcessRequest>) => {
  const req = ev.data;
  if (!req || req.type !== 'PROCESS_DATASET') return;
  const started = performance.now();
  try {
    const { dataset, chunkCount } = processDelimitedChunked(req);
    const elapsedMs = Math.round(performance.now() - started);
    self.postMessage({
      type: 'COMPLETE',
      jobId: req.jobId,
      dataset,
      elapsedMs,
      chunkCount,
    } satisfies WorkerOutboundMessage);
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      jobId: req.jobId,
      message: err instanceof Error ? err.message : 'Worker processing failed.',
    } satisfies WorkerOutboundMessage);
  }
};
