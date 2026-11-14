export type SupportedDocFormat = 'JSON' | 'CSV' | 'TXT' | 'XML' | 'PDF';

export type DocumentEvidenceLabel =
  | 'Directly stated in source'
  | 'Extracted from source'
  | 'AI-generated interpretation'
  | 'Not verified'
  | 'Not available';

export interface ExtractedDocumentField {
  label: string;
  value: string;
  evidenceLabel: DocumentEvidenceLabel;
  sourceLocation: string;
}

export interface DocumentExtractionResult {
  fileName: string;
  format: SupportedDocFormat;
  byteSize: number;
  title: string;
  metadata: ExtractedDocumentField[];
  abstractText: string | null;
  sections: Array<{ heading: string; lineOrIndex: string; preview: string }>;
  scientificTerms: string[];
  objectives: ExtractedDocumentField[];
  experimentalVariables: ExtractedDocumentField[];
  measurementMethods: ExtractedDocumentField[];
  findings: ExtractedDocumentField[];
  limitations: ExtractedDocumentField[];
  references: ExtractedDocumentField[];
  rawPreview: string;
  warnings: string[];
}

export interface DossierPageMapping {
  page: number;
  sectionTitle: string;
  coveredInvestigations: string[];
  keyContents: string;
}

export const BUNDLED_DOSSIER_PDF_PATH =
  '/assets/aistudio/Project_Research_Dossier__Flame-in-Freefall_Challenge_2026__7dd02da0.pdf';

export const BUNDLED_DATABASE_JSON_PATH =
  '/assets/aistudio/flarex_research_database_def47b9d.json';

export const DOSSIER_PAGE_LOCATOR: DossierPageMapping[] = [
  {
    page: 1,
    sectionTitle: 'Primary NASA Flight Investigations & Early ISS / Cygnus Summaries',
    coveredInvestigations: ['bass-ii', 'saffire', 'same', 'flex-cfi-g'],
    keyContents: 'BASS-II TM (2021), Saffire Cygnus tests, SAME smoke particle findings, FLEX/CFI-G cool flame (600–1000 K) chemistry.',
  },
  {
    page: 2,
    sectionTitle: 'ACME Suite, Shuttle Heritage, Confined Combustion, SoFIE & Battery Studies',
    coveredInvestigations: ['acme-bre', 'acme-efield', 'slice', 'spice', 'daft', 'confined-combustion', 'sofie-mist', 'sofie-offs', 'battery-fire-ul'],
    keyContents: 'ACME BRE/E-FIELD/CLD/Flame Design, SPICE (250 tests, >70 smoke points), DAFT P-Trak (0.1–1 μm), SoFIE planned payloads, UL 1g battery data.',
  },
  {
    page: 3,
    sectionTitle: 'Gaps, Limitations, Partial-Gravity Caveats & Telemetry Boundaries',
    coveredInvestigations: ['bass-ii', 'saffire', 'acme-efield', 'battery-fire-ul', 'sofie-mist'],
    keyContents: 'Absence of partial-gravity combustion data, ACME 5-vs-6 discrepancy, microgravity vs. terrestrial 1g Li-ion boundary.',
  },
  {
    page: 4,
    sectionTitle: 'PSI Dataset Exploration, Data Availability Audit & Quality Checklist',
    coveredInvestigations: ['dossier-literature-review', 'acme-planned', 'sofie-mist', 'sofie-offs'],
    keyContents: '10 strict scientific data-quality rules, PSI login/archive file format distinctions (AVI/MOV/CSV/TXT), in-progress SoFIE/ACME caveats.',
  },
];

const SCIENTIFIC_TERM_PATTERNS: Array<{ term: string; regex: RegExp }> = [
  { term: 'Microgravity (0g)', regex: /\bmicrogravity\b|\b0g\b|\breduced gravity\b/i },
  { term: 'Partial Gravity (Lunar / Mars)', regex: /\bpartial[- ]gravity\b|\blunar\b|\bmars\b/i },
  { term: 'Buoyant Convection', regex: /\bbuoyanc|\bbuoyant\b/i },
  { term: 'Diffusion Flame / Cool Flame', regex: /\bdiffusion flame|\bcool flame|\bflame spread\b/i },
  { term: 'Extinction / Flammability Limit', regex: /\bextinction\b|\bflammability\b|\blimiting oxygen\b/i },
  { term: 'Soot / Smoke / Aerosol Particulate', regex: /\bsoot\b|\bsmoke point|\baerosol|\bparticulate/i },
  { term: 'Oxygen Concentration (O2)', regex: /\boxygen\b|\bo2\b/i },
  { term: 'Heat Release Rate (HRR)', regex: /\bheat release|\bhrr\b|\bwatt|\b<\s*100\s*w\b/i },
  { term: 'Thermal Runaway (Li-Ion)', regex: /\bthermal runaway|\blfp\b|\bnmc\b|\blithium-ion|\bli-ion/i },
  { term: 'Electrostatic Ion Wind', regex: /\belectric field|\bion\b|\bkv\b|\be-field/i },
  { term: 'Pyrolysis / Pyrolysate', regex: /\bpyrolys/i },
  { term: 'CO / CH2O / HF Vent Gases', regex: /\bformaldehyde|\bch2o\b|\bhf\b|\bcarbon monoxide|\bco2\b/i },
];

export function detectScientificTerms(text: string): string[] {
  return SCIENTIFIC_TERM_PATTERNS.filter((p) => p.regex.test(text)).map(
    (p) => p.term
  );
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function extractFromCsv(
  fileName: string,
  content: string,
  byteSize: number
): DocumentExtractionResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return emptyExtraction(fileName, 'CSV', byteSize, 'CSV file is empty.');
  }

  const headers = splitCsvLine(lines[0]);
  const dataRows = lines.slice(1).map(splitCsvLine);
  const samplePreview = lines.slice(0, 12).join('\n');

  const numericCols: string[] = [];
  headers.forEach((h, colIdx) => {
    const sampleVals = dataRows
      .slice(0, 20)
      .map((row) => row[colIdx] ?? '')
      .filter((v) => v.length > 0);
    if (
      sampleVals.length > 0 &&
      sampleVals.every((v) => !Number.isNaN(Number(v)))
    ) {
      numericCols.push(h);
    }
  });

  const variableFields: ExtractedDocumentField[] = headers.map((h, idx) => ({
    label: `Column ${idx + 1}`,
    value: numericCols.includes(h) ? `${h} (numeric values observed)` : h,
    evidenceLabel: 'Directly stated in source',
    sourceLocation: `${fileName} (Header Row, Col ${idx + 1})`,
  }));

  const refMatches = extractReferenceLines(lines);

  return {
    fileName,
    format: 'CSV',
    byteSize,
    title: fileName,
    metadata: [
      {
        label: 'Format & Dimensions',
        value: `CSV · ${headers.length} columns · ${dataRows.length} data rows`,
        evidenceLabel: 'Extracted from source',
        sourceLocation: `${fileName} (Lines 1–${lines.length})`,
      },
      {
        label: 'Numeric Columns Detected',
        value: numericCols.length > 0 ? numericCols.join(', ') : 'None detected in first 20 rows',
        evidenceLabel:
          numericCols.length > 0 ? 'Extracted from source' : 'Not available',
        sourceLocation: `${fileName} (Rows 2–${Math.min(21, lines.length)})`,
      },
    ],
    abstractText: null,
    sections: [
      {
        heading: 'CSV Column Schema',
        lineOrIndex: 'Line 1',
        preview: headers.join(' | '),
      },
      {
        heading: 'First Record Sample',
        lineOrIndex: 'Line 2',
        preview: dataRows[0]?.join(' | ') || 'No data rows',
      },
    ],
    scientificTerms: detectScientificTerms(content.slice(0, 20000)),
    objectives: extractMatchingSentenceFields(content, /\bobjective|\bpurpose|\baim\b/i, fileName),
    experimentalVariables: variableFields,
    measurementMethods: extractMatchingSentenceFields(content, /\bsensor|\bmeasure|\binstrument|\bcamera|\bthermocouple/i, fileName),
    findings: extractMatchingSentenceFields(content, /\bfinding|\bresult|\bobserved|\bconclu/i, fileName),
    limitations: extractMatchingSentenceFields(content, /\blimitation|\bcaveat|\bmissing|\bnot available/i, fileName),
    references: refMatches,
    rawPreview: samplePreview,
    warnings: [],
  };
}

export function extractFromJson(
  fileName: string,
  content: string,
  byteSize: number
): DocumentExtractionResult {
  try {
    const parsed = JSON.parse(content) as unknown;
    const isArray = Array.isArray(parsed);
    const obj =
      !isArray && parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;

    const topKeys = obj ? Object.keys(obj) : [];
    const recordsArr =
      isArray
        ? parsed
        : obj && Array.isArray(obj.records)
        ? obj.records
        : null;

    const title =
      (obj && typeof obj.databaseTitle === 'string' && obj.databaseTitle) ||
      (obj && typeof obj.title === 'string' && obj.title) ||
      (obj && typeof obj.name === 'string' && obj.name) ||
      fileName;

    const metadata: ExtractedDocumentField[] = [
      {
        label: 'JSON Root Structure',
        value: isArray
          ? `Array (${parsed.length} items)`
          : `Object (${topKeys.length} top-level keys)`,
        evidenceLabel: 'Extracted from source',
        sourceLocation: `${fileName} (Root)`,
      },
    ];

    if (recordsArr) {
      metadata.push({
        label: 'Indexed Record Count',
        value: `${recordsArr.length} records`,
        evidenceLabel: 'Extracted from source',
        sourceLocation: `${fileName} (records[])`,
      });
    }

    const flatText = content.slice(0, 50000);
    const sections = topKeys.slice(0, 12).map((k) => {
      const val = obj?.[k];
      const preview = Array.isArray(val)
        ? `Array[${val.length}]`
        : typeof val === 'object' && val !== null
        ? `Object{${Object.keys(val as object).slice(0, 5).join(', ')}}`
        : String(val ?? '').slice(0, 140);
      return {
        heading: k,
        lineOrIndex: `$.${k}`,
        preview,
      };
    });

    return {
      fileName,
      format: 'JSON',
      byteSize,
      title,
      metadata,
      abstractText:
        obj && typeof obj.description === 'string'
          ? obj.description
          : obj && typeof obj.abstract === 'string'
          ? obj.abstract
          : null,
      sections,
      scientificTerms: detectScientificTerms(flatText),
      objectives: extractJsonKeyFields(parsed, ['scientificPurpose', 'objective', 'objectives', 'purpose'], fileName),
      experimentalVariables: extractJsonKeyFields(parsed, ['environmentalVariables', 'variables', 'fuels', 'conditions'], fileName),
      measurementMethods: extractJsonKeyFields(parsed, ['measurementMethods', 'sensors', 'diagnostics', 'methods'], fileName),
      findings: extractJsonKeyFields(parsed, ['reportedFindings', 'findings', 'results', 'conclusions'], fileName),
      limitations: extractJsonKeyFields(parsed, ['limitations', 'caveats', 'dataQualityRules'], fileName),
      references: extractJsonKeyFields(parsed, ['sourceUrl', 'doi', 'ntrsDocumentId', 'psiId', 'publications'], fileName),
      rawPreview: JSON.stringify(parsed, null, 2).slice(0, 2200),
      warnings: [],
    };
  } catch (err) {
    return emptyExtraction(
      fileName,
      'JSON',
      byteSize,
      `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failure'}`
    );
  }
}

export function extractFromXml(
  fileName: string,
  content: string,
  byteSize: number
): DocumentExtractionResult {
  const tagRegex = /<([a-zA-Z0-9_:-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  const selfClosingOrRoot = /<([a-zA-Z0-9_:-]+)(?:\s|>)/g;
  const rootMatch = /<([a-zA-Z0-9_:-]+)(?:\s|>)/.exec(
    content.replace(/<\?[\s\S]*?\?>/g, '').trim()
  );

  const elements: Array<{ tag: string; value: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(content)) !== null && elements.length < 60) {
    const val = m[2].trim();
    if (val) elements.push({ tag: m[1], value: val });
  }

  const allTags = new Set<string>();
  while ((m = selfClosingOrRoot.exec(content)) !== null && allTags.size < 40) {
    if (!m[1].startsWith('?')) allTags.add(m[1]);
  }

  const titleEl = elements.find((e) => /title|name/i.test(e.tag));
  const abstractEl = elements.find((e) => /abstract|summary|description/i.test(e.tag));

  return {
    fileName,
    format: 'XML',
    byteSize,
    title: titleEl?.value ?? fileName,
    metadata: [
      {
        label: 'Root Element',
        value: rootMatch?.[1] ?? 'Unknown XML Root',
        evidenceLabel: 'Extracted from source',
        sourceLocation: `${fileName} (<${rootMatch?.[1] ?? 'root'}>)`,
      },
      {
        label: 'Unique XML Tags Detected',
        value: Array.from(allTags).slice(0, 15).join(', ') || 'None',
        evidenceLabel: 'Extracted from source',
        sourceLocation: fileName,
      },
    ],
    abstractText: abstractEl?.value ?? null,
    sections: elements.slice(0, 10).map((e, i) => ({
      heading: `<${e.tag}>`,
      lineOrIndex: `Element #${i + 1}`,
      preview: e.value.slice(0, 180),
    })),
    scientificTerms: detectScientificTerms(content),
    objectives: elements
      .filter((e) => /purpose|objective|goal/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    experimentalVariables: elements
      .filter((e) => /variable|oxygen|pressure|temp|flow|fuel/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    measurementMethods: elements
      .filter((e) => /sensor|method|instrument|measure/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    findings: elements
      .filter((e) => /finding|result|outcome|conclusion/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    limitations: elements
      .filter((e) => /limit|caveat|note/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    references: elements
      .filter((e) => /ref|doi|url|ntrs|psi|citation/i.test(e.tag))
      .map((e) => ({
        label: e.tag,
        value: e.value,
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (<${e.tag}>)`,
      })),
    rawPreview: content.slice(0, 2200),
    warnings: [],
  };
}

export function extractFromText(
  fileName: string,
  content: string,
  byteSize: number
): DocumentExtractionResult {
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines.map((l) => l.trim()).filter(Boolean);
  const title = nonEmptyLines[0]?.slice(0, 140) || fileName;

  const sections: Array<{ heading: string; lineOrIndex: string; preview: string }> = [];
  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (
      /^#{1,4}\s+/.test(trimmed) ||
      (/^[A-Z][A-Z0-9\s/&-]{4,60}$/.test(trimmed) && trimmed.length < 64)
    ) {
      const nextText = lines
        .slice(idx + 1, idx + 4)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 180);
      sections.push({
        heading: trimmed.replace(/^#+\s+/, ''),
        lineOrIndex: `Line ${idx + 1}`,
        preview: nextText || '(Section header)',
      });
    }
  });

  const abstractMatch = /(?:abstract|summary)\s*[:\n]+([\s\S]{30,900}?)(?:\n\s*\n|\n[A-Z#])/i.exec(
    content
  );

  const findingsMatches = extractMatchingSentenceFields(
    content,
    /\bfinding|\bresult|\bdemonstrated|\bobserved|\bconclu/i,
    fileName
  );
  // Also include sentences directly following a FINDINGS / RESULTS section header
  const findingsSectionIdx = sections.findIndex((s) =>
    /finding|result|conclusion/i.test(s.heading)
  );
  if (findingsMatches.length === 0 && findingsSectionIdx >= 0) {
    findingsMatches.push({
      label: `Section: ${sections[findingsSectionIdx].heading}`,
      value: sections[findingsSectionIdx].preview,
      evidenceLabel: 'Extracted from source',
      sourceLocation: `${fileName} (${sections[findingsSectionIdx].lineOrIndex})`,
    });
  }

  return {
    fileName,
    format: 'TXT',
    byteSize,
    title,
    metadata: [
      {
        label: 'Document Extent',
        value: `${lines.length} lines · ${nonEmptyLines.join(' ').split(/\s+/).length} words`,
        evidenceLabel: 'Extracted from source',
        sourceLocation: `${fileName} (Lines 1–${lines.length})`,
      },
    ],
    abstractText: abstractMatch?.[1]?.trim() ?? null,
    sections: sections.slice(0, 15),
    scientificTerms: detectScientificTerms(content),
    objectives: extractMatchingSentenceFields(content, /\bobjective|\bpurpose|\binvestigate|\baim\b/i, fileName),
    experimentalVariables: extractMatchingSentenceFields(content, /\boxygen|\bpressure|\bairflow|\btemperature|\bgravity|\bfuel\b/i, fileName),
    measurementMethods: extractMatchingSentenceFields(content, /\bthermocouple|\bcamera|\bp-trak|\bmeasurement|\bmethod|\bsensor/i, fileName),
    findings: findingsMatches,
    limitations: extractMatchingSentenceFields(content, /\blimitation|\bcaveat|\bnot available|\bplanned|\b1g only/i, fileName),
    references: extractReferenceLines(nonEmptyLines, fileName),
    rawPreview: content.slice(0, 2200),
    warnings: [],
  };
}

export function extractFromPdfRawText(
  fileName: string,
  rawBinaryAsLatin1: string,
  byteSize: number
): DocumentExtractionResult {
  const titleMatch = /\/Title\s*\(([^)]{2,180})\)/.exec(rawBinaryAsLatin1);
  const authorMatch = /\/Author\s*\(([^)]{2,180})\)/.exec(rawBinaryAsLatin1);
  const creatorMatch = /\/Creator\s*\(([^)]{2,140})\)/.exec(rawBinaryAsLatin1);
  const pageMarkers = rawBinaryAsLatin1.match(/\/Type\s*\/Page\b/g);

  // Extract printable ASCII text literals inside PDF parentheses when uncompressed
  const textChunks: string[] = [];
  const parenRegex = /\(([^()\\]{4,160})\)\s*(?:Tj|TJ)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(rawBinaryAsLatin1)) !== null && textChunks.length < 180) {
    const cleaned = m[1].replace(/[^\x20-\x7E]/g, ' ').trim();
    if (cleaned.length >= 4 && /[a-zA-Z]{2,}/.test(cleaned)) {
      textChunks.push(cleaned);
    }
  }

  const extractedPlainText = textChunks.join(' ');
  const isCompressed = textChunks.length < 5;

  return {
    fileName,
    format: 'PDF',
    byteSize,
    title: titleMatch?.[1] ?? fileName,
    metadata: [
      {
        label: 'PDF Pages Detected',
        value: pageMarkers ? `${pageMarkers.length} page object(s)` : 'Encoded / stream layout',
        evidenceLabel: pageMarkers ? 'Extracted from source' : 'Not available',
        sourceLocation: `${fileName} (PDF Catalog)`,
      },
      {
        label: 'PDF /Author Header',
        value: authorMatch?.[1] ?? 'Not specified in PDF header',
        evidenceLabel: authorMatch ? 'Directly stated in source' : 'Not available',
        sourceLocation: `${fileName} (/Info)`,
      },
      {
        label: 'PDF Producer / Creator',
        value: creatorMatch?.[1] ?? 'Not specified in PDF header',
        evidenceLabel: creatorMatch ? 'Directly stated in source' : 'Not available',
        sourceLocation: `${fileName} (/Info)`,
      },
    ],
    abstractText: extractedPlainText ? extractedPlainText.slice(0, 600) : null,
    sections: [],
    scientificTerms: detectScientificTerms(extractedPlainText),
    objectives: extractMatchingSentenceFields(extractedPlainText, /\bobjective|\bpurpose/i, fileName),
    experimentalVariables: extractMatchingSentenceFields(extractedPlainText, /\boxygen|\bpressure|\bairflow|\btemperature/i, fileName),
    measurementMethods: extractMatchingSentenceFields(extractedPlainText, /\bcamera|\bsensor|\bmeasurement/i, fileName),
    findings: extractMatchingSentenceFields(extractedPlainText, /\bfinding|\bresult|\bobserved/i, fileName),
    limitations: extractMatchingSentenceFields(extractedPlainText, /\blimitation|\bcaveat|\bnot available/i, fileName),
    references: extractReferenceLines(extractedPlainText.split(/\.\s+/), fileName),
    rawPreview: extractedPlainText
      ? extractedPlainText.slice(0, 1800)
      : 'Compressed FlateDecode/object streams detected; open PDF directly in browser viewer for full page text.',
    warnings: isCompressed
      ? [
          'PDF text streams are compressed; metadata and uncompressed strings were extracted safely without guessing hidden text. Open the original PDF directly to inspect pages.',
        ]
      : [],
  };
}

export function extractDocumentIntelligence(
  fileName: string,
  content: string,
  byteSize = content.length
): DocumentExtractionResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return extractFromCsv(fileName, content, byteSize);
  if (lower.endsWith('.json')) return extractFromJson(fileName, content, byteSize);
  if (lower.endsWith('.xml')) return extractFromXml(fileName, content, byteSize);
  if (lower.endsWith('.pdf') || content.startsWith('%PDF-')) {
    return extractFromPdfRawText(fileName, content, byteSize);
  }
  return extractFromText(fileName, content, byteSize);
}

function emptyExtraction(
  fileName: string,
  format: SupportedDocFormat,
  byteSize: number,
  warning: string
): DocumentExtractionResult {
  return {
    fileName,
    format,
    byteSize,
    title: fileName,
    metadata: [],
    abstractText: null,
    sections: [],
    scientificTerms: [],
    objectives: [],
    experimentalVariables: [],
    measurementMethods: [],
    findings: [],
    limitations: [],
    references: [],
    rawPreview: '',
    warnings: [warning],
  };
}

function extractMatchingSentenceFields(
  text: string,
  regex: RegExp,
  fileName: string
): ExtractedDocumentField[] {
  if (!text.trim()) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 280);
  const matches: ExtractedDocumentField[] = [];
  for (const s of sentences) {
    if (regex.test(s)) {
      matches.push({
        label: 'Matched Excerpt',
        value: s,
        evidenceLabel: 'Extracted from source',
        sourceLocation: fileName,
      });
      if (matches.length >= 6) break;
    }
  }
  return matches;
}

function extractReferenceLines(
  lines: string[],
  fileName = 'Document'
): ExtractedDocumentField[] {
  const hits: ExtractedDocumentField[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i].trim();
    if (/https?:\/\/|10\.\d{4,9}\/|ntrs|psi\.nasa\.gov|doi:/i.test(l)) {
      hits.push({
        label: 'Reference / Identifier',
        value: l.slice(0, 220),
        evidenceLabel: 'Directly stated in source',
        sourceLocation: `${fileName} (Entry ${i + 1})`,
      });
      if (hits.length >= 10) break;
    }
  }
  return hits;
}

function extractJsonKeyFields(
  root: unknown,
  keys: string[],
  fileName: string
): ExtractedDocumentField[] {
  const results: ExtractedDocumentField[] = [];
  const keySet = new Set(keys.map((k) => k.toLowerCase()));

  function walk(node: unknown, pathStr: string) {
    if (results.length >= 12 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.slice(0, 16).forEach((item, idx) => walk(item, `${pathStr}[${idx}]`));
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = `${pathStr}.${k}`;
        if (keySet.has(k.toLowerCase()) && v !== null && v !== '') {
          const formatted = Array.isArray(v)
            ? v
                .map((x) =>
                  typeof x === 'object' ? JSON.stringify(x) : String(x)
                )
                .join('; ')
            : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);
          if (formatted.trim()) {
            results.push({
              label: k,
              value: formatted.slice(0, 240),
              evidenceLabel: 'Directly stated in source',
              sourceLocation: `${fileName} (${nextPath})`,
            });
          }
        } else if (typeof v === 'object') {
          walk(v, nextPath);
        }
      }
    }
  }

  walk(root, '$');
  return results;
}
