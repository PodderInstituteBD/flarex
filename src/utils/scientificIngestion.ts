export type TabularFormat = 'CSV' | 'TSV' | 'TXT' | 'JSON';

export type ProvenanceLayer =
  | 'ORIGINAL_MEASUREMENT'
  | 'NORMALIZED_VALUE'
  | 'DERIVED_STATISTICS'
  | 'AI_INTERPRETATION';

export interface IngestedColumnSchema {
  originalName: string;
  normalizedName: string;
  detectedUnit: string | null;
  inferredType: 'numeric' | 'categorical' | 'temporal' | 'mixed';
  validNumericCount: number;
  missingCount: number;
  invalidNumericCount: number;
  missingPct: number;
}

export interface IngestedDatasetProvenance {
  datasetId: string;
  originalFilename: string;
  sourceUrl: string;
  repository: string;
  investigationId: string | null;
  retrievalDate: string;
  datasetDescription: string;
  measurementUnits: Record<string, string | null>;
  originalColumnNames: string[];
  importStatus: 'IMPORTED' | 'IMPORTED_WITH_WARNINGS' | 'FAILED';
  transformationHistory: string[];
  format: TabularFormat;
  byteSize: number;
}

export interface IngestedDatasetPackage {
  provenance: IngestedDatasetProvenance;
  columns: IngestedColumnSchema[];
  /** Preserved raw rows exactly as parsed from the source file (never mutated). */
  originalRows: Array<Record<string, string>>;
  /** Normalized rows stored separately from originalRows; missing/invalid values are null (never zero). */
  normalizedRows: Array<Record<string, number | string | null>>;
  summary: {
    rowCount: number;
    columnCount: number;
    numericColumnCount: number;
    duplicateRowCount: number;
    totalMissingCells: number;
    totalInvalidNumericCells: number;
    missingPctOverall: number;
    warnings: string[];
    errors: string[];
  };
}

const MISSING_TOKENS = new Set([
  '',
  'na',
  'n/a',
  'nan',
  'null',
  'none',
  '--',
  '-',
  'nd',
  'not available',
  'not specified',
]);

export function extractUnitFromHeader(header: string): {
  cleanName: string;
  unit: string | null;
} {
  const bracketMatch = /^(.*?)\s*[\[(]([^)\]]{1,24})[\])]\s*$/.exec(header.trim());
  if (bracketMatch) {
    return {
      cleanName: bracketMatch[1].trim(),
      unit: bracketMatch[2].trim(),
    };
  }
  const suffixPatterns: Array<[RegExp, string]> = [
    [/_pct$|_percent$/i, '%'],
    [/_cm_s$/i, 'cm/s'],
    [/_m_s$/i, 'm/s'],
    [/_atm$/i, 'atm'],
    [/_psi$/i, 'psi'],
    [/_kpa$/i, 'kPa'],
    [/_kv$/i, 'kV'],
    [/_kelvin$|_k$/i, 'K'],
    [/_c$|_degc$/i, '°C'],
    [/_mm$/i, 'mm'],
    [/_um$/i, 'μm'],
    [/_sec$|_s$/i, 's'],
    [/_mw$|_w$/i, 'W'],
  ];
  for (const [regex, unit] of suffixPatterns) {
    if (regex.test(header.trim())) {
      return { cleanName: header.trim(), unit };
    }
  }
  return { cleanName: header.trim(), unit: null };
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t' | ';'): string[] {
  if (delimiter !== ',') {
    return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
  }
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function detectDelimiter(firstLine: string, format: TabularFormat): ',' | '\t' | ';' {
  if (format === 'TSV') return '\t';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas && semis > tabs) return ';';
  return ',';
}

function normalizeColumnKey(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `col_${index + 1}`;
}

export function isMissingCellValue(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  return MISSING_TOKENS.has(String(raw).trim().toLowerCase());
}

export function parseStrictNumericValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || isMissingCellValue(trimmed)) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function ingestScientificTabularData(input: {
  filename: string;
  content: string;
  sourceUrl?: string;
  repository?: string;
  investigationId?: string | null;
  retrievalDate?: string;
  description?: string;
}): IngestedDatasetPackage {
  const { filename, content } = input;
  const lower = filename.toLowerCase();
  const format: TabularFormat = lower.endsWith('.json')
    ? 'JSON'
    : lower.endsWith('.tsv')
    ? 'TSV'
    : lower.endsWith('.txt')
    ? 'TXT'
    : 'CSV';

  const retrievalDate = input.retrievalDate ?? new Date().toISOString();
  const datasetId = `ds-${filename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}-${Date.now()}`;
  const warnings: string[] = [];
  const errors: string[] = [];

  let headers: string[] = [];
  let rawRowsMatrix: string[][] = [];

  if (!content || !content.trim()) {
    errors.push('Input dataset content is empty.');
  } else if (format === 'JSON') {
    try {
      const parsed = JSON.parse(content) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { records?: unknown[] }).records)
        ? (parsed as { records: unknown[] }).records
        : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { rows?: unknown[] }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : null;

      if (!arr || arr.length === 0) {
        errors.push('JSON must be a non-empty array of row objects or contain a records/rows array.');
      } else {
        const objRows = arr.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        );
        if (objRows.length === 0) {
          errors.push('JSON array does not contain tabular row objects.');
        } else {
          const keySet = new Set<string>();
          for (const row of objRows.slice(0, 200)) {
            Object.keys(row).forEach((k) => keySet.add(k));
          }
          headers = Array.from(keySet);
          rawRowsMatrix = objRows.map((row) =>
            headers.map((h) => {
              const v = row[h];
              return v === null || v === undefined ? '' : String(v);
            })
          );
        }
      }
    } catch (err) {
      errors.push(
        `Invalid JSON payload: ${err instanceof Error ? err.message : 'parse failure'}`
      );
    }
  } else {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

    if (lines.length < 2) {
      errors.push('Tabular file requires a header row and at least 1 data row.');
    } else {
      const delimiter = detectDelimiter(lines[0], format);
      headers = splitDelimitedLine(lines[0], delimiter);
      if (headers.some((h) => !h)) {
        warnings.push('One or more blank column headers were auto-named.');
      }
      rawRowsMatrix = lines.slice(1).map((line) => {
        const cells = splitDelimitedLine(line, delimiter);
        if (cells.length !== headers.length) {
          warnings.push(
            `Row length mismatch detected (expected ${headers.length} columns, found ${cells.length}); missing trailing cells preserved as empty.`
          );
        }
        return headers.map((_, idx) => cells[idx] ?? '');
      });
    }
  }

  if (errors.length > 0 || headers.length === 0) {
    return {
      provenance: {
        datasetId,
        originalFilename: filename,
        sourceUrl: input.sourceUrl ?? 'Local user upload',
        repository: input.repository ?? 'Local Browser Session',
        investigationId: input.investigationId ?? null,
        retrievalDate,
        datasetDescription:
          input.description ?? 'User-provided dataset (failed validation).',
        measurementUnits: {},
        originalColumnNames: [],
        importStatus: 'FAILED',
        transformationHistory: ['Validation failed before normalization.'],
        format,
        byteSize: content.length,
      },
      columns: [],
      originalRows: [],
      normalizedRows: [],
      summary: {
        rowCount: 0,
        columnCount: 0,
        numericColumnCount: 0,
        duplicateRowCount: 0,
        totalMissingCells: 0,
        totalInvalidNumericCells: 0,
        missingPctOverall: 0,
        warnings,
        errors,
      },
    };
  }

  // Deduplicate header names safely while keeping original names intact
  const seenKeys = new Set<string>();
  const colSpecs = headers.map((origHeader, idx) => {
    const displayHeader = origHeader || `Column_${idx + 1}`;
    let norm = normalizeColumnKey(displayHeader, idx);
    while (seenKeys.has(norm)) {
      norm = `${norm}_${idx + 1}`;
    }
    seenKeys.add(norm);
    const { unit } = extractUnitFromHeader(displayHeader);
    return { originalName: displayHeader, normalizedName: norm, detectedUnit: unit };
  });

  // Preserve original rows verbatim
  const originalRows: Array<Record<string, string>> = [];
  const rowSignatures = new Map<string, number>();
  let duplicateRowCount = 0;

  for (const rowCells of rawRowsMatrix) {
    const rawObj: Record<string, string> = {};
    colSpecs.forEach((spec, idx) => {
      rawObj[spec.originalName] = rowCells[idx] ?? '';
    });
    originalRows.push(rawObj);

    const sig = rowCells.map((c) => c.trim()).join('\u0001');
    const prev = rowSignatures.get(sig) ?? 0;
    if (prev > 0) duplicateRowCount += 1;
    rowSignatures.set(sig, prev + 1);
  }

  if (duplicateRowCount > 0) {
    warnings.push(
      `${duplicateRowCount} duplicate data row(s) detected and preserved unmodified in originalRows.`
    );
  }

  // Analyze columns + build normalizedRows separately without mutating originalRows
  let totalMissingCells = 0;
  let totalInvalidNumericCells = 0;

  const columnStats = colSpecs.map((spec, colIdx) => {
    let missingCount = 0;
    let validNumericCount = 0;
    let nonEmptyNonNumericCount = 0;

    for (const rowCells of rawRowsMatrix) {
      const cell = rowCells[colIdx] ?? '';
      if (isMissingCellValue(cell)) {
        missingCount += 1;
      } else if (parseStrictNumericValue(cell) !== null) {
        validNumericCount += 1;
      } else {
        nonEmptyNonNumericCount += 1;
      }
    }

    const isMostlyNumeric =
      validNumericCount > 0 &&
      (validNumericCount >= nonEmptyNonNumericCount || spec.detectedUnit !== null);
    const isTemporalCol = /time|year|date|timestamp|elapsed|sec/i.test(
      spec.originalName
    );

    const inferredType: IngestedColumnSchema['inferredType'] =
      isMostlyNumeric && nonEmptyNonNumericCount === 0
        ? isTemporalCol
          ? 'temporal'
          : 'numeric'
        : isMostlyNumeric && nonEmptyNonNumericCount > 0
        ? 'mixed'
        : isTemporalCol
        ? 'temporal'
        : 'categorical';

    const invalidNumericCount = isMostlyNumeric ? nonEmptyNonNumericCount : 0;
    totalMissingCells += missingCount;
    totalInvalidNumericCells += invalidNumericCount;

    if (invalidNumericCount > 0) {
      warnings.push(
        `Column "${spec.originalName}" has ${invalidNumericCount} non-numeric string(s) in a predominantly numeric field; preserved as null in normalized view.`
      );
    }

    return {
      originalName: spec.originalName,
      normalizedName: spec.normalizedName,
      detectedUnit: spec.detectedUnit,
      inferredType,
      validNumericCount,
      missingCount,
      invalidNumericCount,
      missingPct:
        rawRowsMatrix.length > 0
          ? Number(((missingCount / rawRowsMatrix.length) * 100).toFixed(1))
          : 0,
    } satisfies IngestedColumnSchema;
  });

  const normalizedRows: Array<Record<string, number | string | null>> =
    rawRowsMatrix.map((rowCells) => {
      const normObj: Record<string, number | string | null> = {};
      columnStats.forEach((col, idx) => {
        const rawCell = rowCells[idx] ?? '';
        if (isMissingCellValue(rawCell)) {
          normObj[col.normalizedName] = null;
        } else if (
          col.inferredType === 'numeric' ||
          col.inferredType === 'mixed' ||
          (col.inferredType === 'temporal' && col.validNumericCount > 0)
        ) {
          normObj[col.normalizedName] = parseStrictNumericValue(rawCell);
        } else {
          normObj[col.normalizedName] = rawCell.trim();
        }
      });
      return normObj;
    });

  const measurementUnits: Record<string, string | null> = {};
  columnStats.forEach((c) => {
    measurementUnits[c.originalName] = c.detectedUnit;
  });

  const totalCells = rawRowsMatrix.length * columnStats.length;
  const missingPctOverall =
    totalCells > 0
      ? Number(((totalMissingCells / totalCells) * 100).toFixed(1))
      : 0;

  return {
    provenance: {
      datasetId,
      originalFilename: filename,
      sourceUrl: input.sourceUrl ?? 'Local user upload',
      repository: input.repository ?? 'Local Browser Session',
      investigationId: input.investigationId ?? null,
      retrievalDate,
      datasetDescription:
        input.description ??
        `Ingested ${format} dataset (${rawRowsMatrix.length} rows × ${columnStats.length} columns).`,
      measurementUnits,
      originalColumnNames: colSpecs.map((c) => c.originalName),
      importStatus:
        warnings.length > 0 ? 'IMPORTED_WITH_WARNINGS' : 'IMPORTED',
      transformationHistory: [
        `Parsed ${format} source (${content.length} bytes) preserving originalRows verbatim.`,
        'Detected units from column headers without altering numeric magnitudes.',
        'Mapped NA/null/non-numeric tokens in numeric columns strictly to null in normalizedRows (zero never substituted).',
      ],
      format,
      byteSize: content.length,
    },
    columns: columnStats,
    originalRows,
    normalizedRows,
    summary: {
      rowCount: rawRowsMatrix.length,
      columnCount: columnStats.length,
      numericColumnCount: columnStats.filter(
        (c) =>
          c.inferredType === 'numeric' ||
          c.inferredType === 'mixed' ||
          (c.inferredType === 'temporal' && c.validNumericCount > 0)
      ).length,
      duplicateRowCount,
      totalMissingCells,
      totalInvalidNumericCells,
      missingPctOverall,
      warnings: Array.from(new Set(warnings)),
      errors,
    },
  };
}
