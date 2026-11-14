import type { InvestigationRecord } from '../types/research.ts';

export const NOT_AVAILABLE_IN_SOURCE = 'Not available in the reviewed source.';

export interface ExtractedEnvironmentalParams {
  acronym: string;
  oxygenConcentration: string | null;
  pressure: string | null;
  temperature: string | null;
  airflow: string | null;
}

export interface RecordValidationResult {
  id: string;
  shortName: string;
  isValid: boolean;
  issues: string[];
  missingFields: string[];
  completenessPct: number;
  qualityTier: 'High Coverage' | 'Moderate Coverage' | 'Descriptive / Sparse';
}

export interface DatabaseValidationAudit {
  totalRecords: number;
  validRecords: number;
  duplicateIds: string[];
  duplicateSlugs: string[];
  recordsWithIssues: RecordValidationResult[];
  averageCompletenessPct: number;
  fieldCoverage: Array<{ field: string; label: string; populatedCount: number }>;
  allPassedIntegrityChecks: boolean;
}

export function extractAcronym(record: InvestigationRecord): string {
  const short = record.shortName.trim();
  const parenMatch = /\(([^)]+)\)/.exec(record.name);
  if (short.length <= 24) return short;
  if (parenMatch?.[1] && parenMatch[1].length <= 20) return parenMatch[1];
  return short;
}

function findMatchingLines(lines: string[], pattern: RegExp): string | null {
  const matched = lines.filter((line) => pattern.test(line));
  return matched.length > 0 ? matched.join('; ') : null;
}

/**
 * Extracts structured Oxygen, Pressure, Temperature, and Airflow fields
 * STRICTLY from documented dossier fields without fabricating values.
 */
export function extractEnvironmentalParams(
  record: InvestigationRecord
): ExtractedEnvironmentalParams {
  const pool = [
    ...record.environmentalVariables,
    ...record.fuels,
    ...record.quantitativeData.map((q) => `${q.label}: ${q.valueDisplay}`),
  ];

  const oxygenConcentration = findMatchingLines(
    pool,
    /\bo2\b|oxygen|mole fraction/i
  );
  const pressure = findMatchingLines(
    pool,
    /\bpressure\b|\bpsi\b|\batm\b|\bbar\b|\bkpa\b/i
  );
  const temperature = findMatchingLines(
    pool,
    /\btemperature\b|\b\d+\s*[kK]\b|\bthermal runaway\b|\bheat flux\b|\bradiant\b|\bfire resistance\b/i
  );
  const airflow = findMatchingLines(
    pool,
    /\bairflow\b|\bcoflow\b|\bopposed\b|\bconcurrent\b|\bflow\b|\bventilation\b|\bcm\/s\b|\bblower\b|\bfan\b/i
  );

  return {
    acronym: extractAcronym(record),
    oxygenConcentration,
    pressure,
    temperature,
    airflow,
  };
}

const AUDITED_FIELDS: Array<{
  key: string;
  label: string;
  check: (r: InvestigationRecord) => boolean;
}> = [
  { key: 'scientificPurpose', label: 'Research Objectives', check: (r) => Boolean(r.scientificPurpose?.trim()) },
  { key: 'hardware', label: 'Platform / Hardware', check: (r) => Boolean(r.hardware?.trim()) },
  { key: 'fuels', label: 'Fuels / Materials', check: (r) => r.fuels.length > 0 },
  { key: 'materialsAndGeometry', label: 'Materials & Geometry', check: (r) => Boolean(r.materialsAndGeometry?.trim()) },
  { key: 'environmentalVariables', label: 'Environmental Conditions', check: (r) => r.environmentalVariables.length > 0 },
  { key: 'sensors', label: 'Sensors', check: (r) => Boolean(r.sensors && r.sensors.length > 0) },
  { key: 'measurementMethods', label: 'Measurement Methods', check: (r) => Boolean(r.measurementMethods?.trim()) },
  { key: 'reportedFindings', label: 'Documented Findings', check: (r) => Boolean(r.reportedFindings?.trim()) },
  { key: 'psiId', label: 'NASA PSI ID', check: (r) => Boolean(r.psiId?.trim()) },
  { key: 'quantitativeData', label: 'Published Figures / Ranges', check: (r) => r.quantitativeData.length > 0 },
];

export function validateInvestigationRecord(
  record: InvestigationRecord
): RecordValidationResult {
  const issues: string[] = [];

  if (!record.id?.trim()) issues.push('Missing unique id');
  if (!record.name?.trim()) issues.push('Missing investigation name');
  if (!record.sourceUrl || (!record.sourceUrl.startsWith('http') && !record.sourceUrl.startsWith('/'))) {
    issues.push('Invalid or missing primary sourceUrl');
  }
  if (!record.sourceLabel?.trim()) issues.push('Missing sourceLabel');
  if (!record.evidenceType) issues.push('Missing evidenceType classification');
  if (!record.overview?.trim()) issues.push('Missing overview description');
  if (!record.limitations || record.limitations.length === 0) {
    issues.push('Missing documented limitations');
  }
  if (!record.isMicrogravity && record.gravityContext === 'Microgravity') {
    issues.push('Contradictory gravity provenance flags');
  }

  const missingFields = AUDITED_FIELDS.filter((f) => !f.check(record)).map(
    (f) => f.label
  );
  const populatedCount = AUDITED_FIELDS.length - missingFields.length;
  const completenessPct = Math.round(
    (populatedCount / AUDITED_FIELDS.length) * 100
  );

  const qualityTier: RecordValidationResult['qualityTier'] =
    completenessPct >= 80
      ? 'High Coverage'
      : completenessPct >= 55
      ? 'Moderate Coverage'
      : 'Descriptive / Sparse';

  return {
    id: record.id,
    shortName: record.shortName,
    isValid: issues.length === 0,
    issues,
    missingFields,
    completenessPct,
    qualityTier,
  };
}

export function validateResearchDatabase(
  records: InvestigationRecord[]
): DatabaseValidationAudit {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const seenSlugs = new Set<string>();
  const duplicateSlugs: string[] = [];

  for (const r of records) {
    if (seenIds.has(r.id)) duplicateIds.push(r.id);
    seenIds.add(r.id);
    if (seenSlugs.has(r.slug)) duplicateSlugs.push(r.slug);
    seenSlugs.add(r.slug);
  }

  const perRecord = records.map(validateInvestigationRecord);
  const validRecords = perRecord.filter((r) => r.isValid).length;
  const avg =
    perRecord.length > 0
      ? Math.round(
          perRecord.reduce((acc, r) => acc + r.completenessPct, 0) /
            perRecord.length
        )
      : 0;

  const fieldCoverage = AUDITED_FIELDS.map((f) => ({
    field: f.key,
    label: f.label,
    populatedCount: records.filter((r) => f.check(r)).length,
  }));

  return {
    totalRecords: records.length,
    validRecords,
    duplicateIds,
    duplicateSlugs,
    recordsWithIssues: perRecord.filter((r) => !r.isValid),
    averageCompletenessPct: avg,
    fieldCoverage,
    allPassedIntegrityChecks:
      records.length > 0 &&
      duplicateIds.length === 0 &&
      duplicateSlugs.length === 0 &&
      validRecords === records.length,
  };
}
