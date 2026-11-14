import type { InvestigationRecord } from '../types/research.ts';
import type { EvidenceClaimRecord } from './evidenceEngine.ts';
import { validateResearchDatabase } from './databaseValidator.ts';

export type QualitySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface DataQualityIssue {
  id: string;
  severity: QualitySeverity;
  category:
    | 'Missing / Invalid Source URL'
    | 'Duplicate Entry Candidate'
    | 'Inconsistent Identifier'
    | 'Missing Publication Date'
    | 'Unclassified Evidence'
    | 'Unsupported / Unverified Claim'
    | 'Integrity Rule Check';
  targetId: string;
  targetName: string;
  message: string;
}

export interface LinkCheckResult {
  url: string;
  investigationId: string;
  label: string;
  status: number | null;
  ok: boolean;
  checkedAt: string;
  note?: string;
}

export interface DataQualityAuditReport {
  totalRecords: number;
  totalChecksEvaluated: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  averageCompletenessPct: number;
  issues: DataQualityIssue[];
  uniqueCheckableUrls: Array<{
    url: string;
    investigationId: string;
    label: string;
  }>;
}

export function runDataQualityAudit(
  records: InvestigationRecord[],
  claims: EvidenceClaimRecord[] = []
): DataQualityAuditReport {
  const dbAudit = validateResearchDatabase(records);
  const issues: DataQualityIssue[] = [];

  // 1. Duplicate IDs, slugs, or titles
  for (const dupId of dbAudit.duplicateIds) {
    issues.push({
      id: `dq-dup-id-${dupId}`,
      severity: 'CRITICAL',
      category: 'Duplicate Entry Candidate',
      targetId: dupId,
      targetName: dupId,
      message: `Duplicate record id "${dupId}" detected.`,
    });
  }
  for (const dupSlug of dbAudit.duplicateSlugs) {
    issues.push({
      id: `dq-dup-slug-${dupSlug}`,
      severity: 'CRITICAL',
      category: 'Duplicate Entry Candidate',
      targetId: dupSlug,
      targetName: dupSlug,
      message: `Duplicate record slug "${dupSlug}" detected.`,
    });
  }

  const titleCounts = new Map<string, string[]>();
  for (const r of records) {
    const key = r.shortName.trim().toLowerCase();
    const list = titleCounts.get(key) ?? [];
    list.push(r.id);
    titleCounts.set(key, list);
  }
  for (const [titleKey, ids] of titleCounts.entries()) {
    if (ids.length > 1) {
      issues.push({
        id: `dq-dup-title-${titleKey}`,
        severity: 'WARNING',
        category: 'Duplicate Entry Candidate',
        targetId: ids[0],
        targetName: titleKey,
        message: `Multiple records share normalized shortName (${ids.join(', ')}).`,
      });
    }
  }

  // 2. Per-record metadata, URL, identifier, date, and classification checks
  const urlSeen = new Set<string>();
  const uniqueCheckableUrls: Array<{
    url: string;
    investigationId: string;
    label: string;
  }> = [];

  for (const r of records) {
    if (
      !r.sourceUrl ||
      (!r.sourceUrl.startsWith('https://') &&
        !r.sourceUrl.startsWith('http://') &&
        !r.sourceUrl.startsWith('/assets/'))
    ) {
      issues.push({
        id: `dq-url-${r.id}`,
        severity: 'CRITICAL',
        category: 'Missing / Invalid Source URL',
        targetId: r.id,
        targetName: r.shortName,
        message: `Invalid or missing primary sourceUrl: "${r.sourceUrl || '(empty)'}".`,
      });
    } else if (r.sourceUrl.startsWith('https://') && !urlSeen.has(r.sourceUrl)) {
      urlSeen.add(r.sourceUrl);
      uniqueCheckableUrls.push({
        url: r.sourceUrl,
        investigationId: r.id,
        label: `${r.shortName} Primary Source`,
      });
    }

    for (const sec of r.secondaryUrls) {
      if (sec.url.startsWith('https://') && !urlSeen.has(sec.url)) {
        urlSeen.add(sec.url);
        uniqueCheckableUrls.push({
          url: sec.url,
          investigationId: r.id,
          label: `${r.shortName} — ${sec.label}`,
        });
      }
    }

    if (
      r.psiId &&
      !/^(?:1[0-9]{7}|[0-9]{5,8})$/.test(r.psiId)
    ) {
      issues.push({
        id: `dq-psi-${r.id}`,
        severity: 'WARNING',
        category: 'Inconsistent Identifier',
        targetId: r.id,
        targetName: r.shortName,
        message: `PSI ID "${r.psiId}" has an atypical format; verify against psi.nasa.gov.`,
      });
    }

    if (r.doi && !/^10\.\d{4,9}\/\S+$/.test(r.doi)) {
      issues.push({
        id: `dq-doi-${r.id}`,
        severity: 'WARNING',
        category: 'Inconsistent Identifier',
        targetId: r.id,
        targetName: r.shortName,
        message: `DOI "${r.doi}" does not match standard Crossref pattern (10.xxxx/...).`,
      });
    }

    if (!r.publicationDate?.trim()) {
      issues.push({
        id: `dq-pubdate-${r.id}`,
        severity: 'INFO',
        category: 'Missing Publication Date',
        targetId: r.id,
        targetName: r.shortName,
        message: `Exact publicationDate not specified in source dossier (campaign timeframe: ${r.timeframe}).`,
      });
    }

    if (!r.evidenceType || r.evidenceTypes.length === 0) {
      issues.push({
        id: `dq-ev-${r.id}`,
        severity: 'CRITICAL',
        category: 'Unclassified Evidence',
        targetId: r.id,
        targetName: r.shortName,
        message: 'Record lacks explicit evidenceType classification.',
      });
    }

    if (!r.isMicrogravity && r.gravityContext === 'Microgravity') {
      issues.push({
        id: `dq-grav-${r.id}`,
        severity: 'CRITICAL',
        category: 'Integrity Rule Check',
        targetId: r.id,
        targetName: r.shortName,
        message: 'Contradictory gravity flags (isMicrogravity=false vs Microgravity context).',
      });
    }
  }

  // 3. Unsupported / Unverified claims check
  for (const c of claims) {
    if (c.category === 'Unverified information' || !c.sourceUrl) {
      issues.push({
        id: `dq-claim-${c.id}`,
        severity: c.sourceUrl ? 'INFO' : 'CRITICAL',
        category: 'Unsupported / Unverified Claim',
        targetId: c.investigationId,
        targetName: c.investigationShortName,
        message: c.sourceUrl
          ? `Flagged for upstream verification: ${c.claimText.slice(0, 120)}`
          : `Claim lacks source URL: ${c.claimText.slice(0, 100)}`,
      });
    }
  }

  return {
    totalRecords: records.length,
    totalChecksEvaluated: records.length * 6 + claims.length,
    criticalCount: issues.filter((i) => i.severity === 'CRITICAL').length,
    warningCount: issues.filter((i) => i.severity === 'WARNING').length,
    infoCount: issues.filter((i) => i.severity === 'INFO').length,
    averageCompletenessPct: dbAudit.averageCompletenessPct,
    issues,
    uniqueCheckableUrls,
  };
}
