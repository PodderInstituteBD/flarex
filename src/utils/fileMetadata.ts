import {
  extractUnitFromHeader,
  isMissingCellValue,
  parseStrictNumericValue,
  TabularFormat,
} from './scientificIngestion.ts';

export type DetectedDelimiter = ',' | '\t' | ';' | 'JSON';

export interface ColumnPreviewDiagnostic {
  originalName: string;
  detectedUnit: string | null;
  isTemporalCandidate: boolean;
  sampleValues: string[];
  missingInSample: number;
  invalidNumericInSample: number;
}

export interface FileImportPreviewReport {
  filename: string;
  format: TabularFormat;
  byteSize: number;
  detectedEncoding: 'UTF-8 (with BOM)' | 'UTF-8 / ASCII';
  detectedDelimiter: DetectedDelimiter;
  delimiterLabel: string;
  estimatedDataRowCount: number;
  columnCount: number;
  duplicateRowsInPreview: number;
  warnings: string[];
  errors: string[];
  headers: string[];
  columns: ColumnPreviewDiagnostic[];
  previewRows: Array<Record<string, string>>;
  canProceedWithImport: boolean;
}

function detectDelimiterFromLine(line: string, format: TabularFormat): ',' | '\t' | ';' {
  if (format === 'TSV') return '\t';
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas && semis > tabs) return ';';
  return ',';
}

function splitPreviewLine(line: string, delimiter: ',' | '\t' | ';'): string[] {
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

export function inspectRawFileMetadata(
  filename: string,
  rawContent: string,
  maxPreviewRows = 10
): FileImportPreviewReport {
  const lower = filename.toLowerCase();
  const format: TabularFormat = lower.endsWith('.json')
    ? 'JSON'
    : lower.endsWith('.tsv')
    ? 'TSV'
    : lower.endsWith('.txt')
    ? 'TXT'
    : 'CSV';

  const hasBom = rawContent.startsWith('\uFEFF');
  const content = hasBom ? rawContent.slice(1) : rawContent;
  const detectedEncoding = hasBom ? 'UTF-8 (with BOM)' : 'UTF-8 / ASCII';
  const byteSize = rawContent.length;

  const warnings: string[] = [];
  const errors: string[] = [];
  let headers: string[] = [];
  let sampleMatrix: string[][] = [];
  let estimatedDataRowCount = 0;
  let detectedDelimiter: DetectedDelimiter = format === 'JSON' ? 'JSON' : ',';

  if (hasBom) {
    warnings.push('UTF-8 Byte Order Mark (BOM) detected and stripped safely during header preview.');
  }

  if (!content.trim()) {
    errors.push('Selected file is empty.');
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
        errors.push('JSON must contain a non-empty array of row objects.');
      } else {
        const objRows = arr.filter(
          (r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && !Array.isArray(r)
        );
        estimatedDataRowCount = objRows.length;
        const keySet = new Set<string>();
        for (const r of objRows.slice(0, 50)) {
          Object.keys(r).forEach((k) => keySet.add(k));
        }
        headers = Array.from(keySet);
        sampleMatrix = objRows.slice(0, maxPreviewRows).map((r) =>
          headers.map((h) => (r[h] === null || r[h] === undefined ? '' : String(r[h])))
        );
      }
    } catch (err) {
      errors.push(
        `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failure'}`
      );
    }
  } else {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

    if (lines.length < 2) {
      errors.push('Delimited file needs a header row and at least 1 data row.');
    } else {
      const delim = detectDelimiterFromLine(lines[0], format);
      detectedDelimiter = delim;
      headers = splitPreviewLine(lines[0], delim).map((h, i) => h || `Column_${i + 1}`);
      estimatedDataRowCount = lines.length - 1;
      sampleMatrix = lines
        .slice(1, 1 + maxPreviewRows)
        .map((line) => {
          const cells = splitPreviewLine(line, delim);
          return headers.map((_, idx) => cells[idx] ?? '');
        });
    }
  }

  const delimiterLabel =
    detectedDelimiter === 'JSON'
      ? 'JSON Object Array'
      : detectedDelimiter === '\t'
      ? 'Tab-Separated (\\t)'
      : detectedDelimiter === ';'
      ? 'Semicolon-Delimited (;)'
      : 'Comma-Separated (,)';

  const sigSeen = new Set<string>();
  let duplicateRowsInPreview = 0;
  for (const row of sampleMatrix) {
    const sig = row.map((c) => c.trim()).join('\u0001');
    if (sigSeen.has(sig)) duplicateRowsInPreview += 1;
    sigSeen.add(sig);
  }
  if (duplicateRowsInPreview > 0) {
    warnings.push(`${duplicateRowsInPreview} duplicate row(s) observed in preview slice.`);
  }

  const columns: ColumnPreviewDiagnostic[] = headers.map((h, colIdx) => {
    const { unit } = extractUnitFromHeader(h);
    const sampleValues = sampleMatrix.map((row) => row[colIdx] ?? '');
    let missingInSample = 0;
    let numericHits = 0;
    let nonEmptyNonNumeric = 0;

    for (const v of sampleValues) {
      if (isMissingCellValue(v)) missingInSample += 1;
      else if (parseStrictNumericValue(v) !== null) numericHits += 1;
      else nonEmptyNonNumeric += 1;
    }

    const invalidNumericInSample =
      numericHits > 0 && nonEmptyNonNumeric > 0 ? nonEmptyNonNumeric : 0;
    if (invalidNumericInSample > 0) {
      warnings.push(
        `Column "${h}" shows ${invalidNumericInSample} non-numeric token(s) in preview rows (mapped safely to null on import).`
      );
    }

    return {
      originalName: h,
      detectedUnit: unit,
      isTemporalCandidate: /time|year|date|timestamp|elapsed|sec/i.test(h),
      sampleValues: sampleValues.slice(0, 4),
      missingInSample,
      invalidNumericInSample,
    };
  });

  const previewRows = sampleMatrix.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });

  if (estimatedDataRowCount > 50_000) {
    warnings.push(
      `Large dataset detected (~${estimatedDataRowCount.toLocaleString()} rows): Web Worker chunked processing recommended.`
    );
  }

  return {
    filename,
    format,
    byteSize,
    detectedEncoding,
    detectedDelimiter,
    delimiterLabel,
    estimatedDataRowCount,
    columnCount: headers.length,
    duplicateRowsInPreview,
    warnings: Array.from(new Set(warnings)),
    errors,
    headers,
    columns,
    previewRows,
    canProceedWithImport: errors.length === 0 && headers.length > 0 && estimatedDataRowCount > 0,
  };
}
