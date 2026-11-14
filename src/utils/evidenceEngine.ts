import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';

export type EvidenceClaimCategory =
  | 'Experimental observation'
  | 'Published research conclusion'
  | 'NASA investigation description'
  | 'Review-based conclusion'
  | 'Secondary-source statement'
  | 'AI interpretation'
  | 'Unverified information';

export type ClaimVerificationStatus =
  | 'Verified in primary dossier / NASA catalog'
  | 'Peer-reviewed publication citation'
  | 'Pending flight release / planned'
  | 'Cross-source interpretation'
  | 'Requires upstream verification';

export type EvidenceStrengthLabel =
  | 'Direct flight telemetry / Technical Memorandum'
  | 'Peer-reviewed journal / NASA status summary'
  | 'Ground terrestrial analog (1g only)'
  | 'Planned experiment objective (pre-data)'
  | 'Synthesis / unverified';

export interface EvidenceClaimRecord {
  id: string;
  claimText: string;
  category: EvidenceClaimCategory;
  verificationStatus: ClaimVerificationStatus;
  evidenceStrength: EvidenceStrengthLabel;
  investigationId: string;
  investigationShortName: string;
  sourceLabel: string;
  sourceUrl: string;
  doiOrId: string | null;
  limitations: string[];
  relatedClaimIds: string[];
}

export const EVIDENCE_CLAIM_CATEGORIES: EvidenceClaimCategory[] = [
  'Experimental observation',
  'Published research conclusion',
  'NASA investigation description',
  'Review-based conclusion',
  'Secondary-source statement',
  'AI interpretation',
  'Unverified information',
];

function classifyPrimaryCategory(rec: InvestigationRecord): EvidenceClaimCategory {
  if (rec.isPlannedOrOngoing) return 'NASA investigation description';
  if (rec.recordCategory === 'REVIEW_PAPER') return 'Review-based conclusion';
  if (rec.evidenceType === 'PEER-REVIEWED PAPER') return 'Published research conclusion';
  if (
    rec.sourceUrl.includes('phys.org') ||
    rec.evidenceType === 'PRESENTATION / ABSTRACT'
  ) {
    return 'Secondary-source statement';
  }
  if (rec.hasRawNumericalDataset || rec.evidenceType === 'RAW DATA') {
    return 'Experimental observation';
  }
  return 'NASA investigation description';
}

function classifyStrength(rec: InvestigationRecord): EvidenceStrengthLabel {
  if (!rec.isMicrogravity) return 'Ground terrestrial analog (1g only)';
  if (rec.isPlannedOrOngoing) return 'Planned experiment objective (pre-data)';
  if (
    rec.hasRawNumericalDataset ||
    Boolean(rec.ntrsDocumentId) ||
    rec.evidenceType === 'RAW DATA'
  ) {
    return 'Direct flight telemetry / Technical Memorandum';
  }
  if (
    rec.evidenceType === 'PEER-REVIEWED PAPER' ||
    (rec.publications && rec.publications.length > 0)
  ) {
    return 'Peer-reviewed journal / NASA status summary';
  }
  return 'Synthesis / unverified';
}

function classifyVerification(rec: InvestigationRecord): ClaimVerificationStatus {
  if (rec.isPlannedOrOngoing) return 'Pending flight release / planned';
  if (rec.evidenceType === 'PEER-REVIEWED PAPER') {
    return 'Peer-reviewed publication citation';
  }
  if (rec.recordCategory === 'REVIEW_PAPER') {
    return 'Cross-source interpretation';
  }
  if (
    rec.sourceUrl.startsWith('https://') &&
    (rec.sourceUrl.includes('nasa.gov') || rec.doi || rec.psiId)
  ) {
    return 'Verified in primary dossier / NASA catalog';
  }
  return 'Requires upstream verification';
}

export function buildEvidenceClaims(
  records: InvestigationRecord[],
  gaps: ResearchGapRecord[] = []
): EvidenceClaimRecord[] {
  const claims: EvidenceClaimRecord[] = [];

  for (const rec of records) {
    const idBadge =
      rec.ntrsDocumentId
        ? `NTRS ${rec.ntrsDocumentId}`
        : rec.psiId
        ? `PSI ${rec.psiId}`
        : rec.doi
        ? `DOI ${rec.doi}`
        : null;

    // 1. Primary finding or purpose claim
    if (rec.reportedFindings) {
      claims.push({
        id: `claim-${rec.id}-finding`,
        claimText: rec.reportedFindings,
        category: classifyPrimaryCategory(rec),
        verificationStatus: classifyVerification(rec),
        evidenceStrength: classifyStrength(rec),
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceLabel: rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        doiOrId: idBadge,
        limitations: rec.limitations,
        relatedClaimIds: [],
      });
    } else if (rec.scientificPurpose) {
      claims.push({
        id: `claim-${rec.id}-purpose`,
        claimText: rec.scientificPurpose,
        category: 'NASA investigation description',
        verificationStatus: rec.isPlannedOrOngoing
          ? 'Pending flight release / planned'
          : classifyVerification(rec),
        evidenceStrength: rec.isPlannedOrOngoing
          ? 'Planned experiment objective (pre-data)'
          : classifyStrength(rec),
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceLabel: rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        doiOrId: idBadge,
        limitations: rec.limitations,
        relatedClaimIds: [],
      });
    }

    // 2. Quantitative figure / range claims (strictly source-backed)
    for (const q of rec.quantitativeData) {
      claims.push({
        id: `claim-${rec.id}-quant-${q.id}`,
        claimText: `${q.label}: ${q.valueDisplay} (${q.conditionContext}). ${q.qualityNote}`,
        category:
          rec.evidenceType === 'PEER-REVIEWED PAPER'
            ? 'Published research conclusion'
            : rec.isMicrogravity
            ? 'Experimental observation'
            : 'Secondary-source statement',
        verificationStatus: classifyVerification(rec),
        evidenceStrength: classifyStrength(rec),
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceLabel: q.sourceCitation || rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        doiOrId: idBadge,
        limitations: [q.qualityNote, ...rec.limitations.slice(0, 1)],
        relatedClaimIds: [],
      });
    }

    // 3. Peer-reviewed publication claims
    if (rec.publications) {
      for (const pub of rec.publications) {
        claims.push({
          id: `claim-${rec.id}-pub-${pub.doi}`,
          claimText: `Peer-reviewed publication documenting ${rec.shortName}: "${pub.title}" (${pub.journal}, ${pub.date}).`,
          category: 'Published research conclusion',
          verificationStatus: 'Peer-reviewed publication citation',
          evidenceStrength: 'Peer-reviewed journal / NASA status summary',
          investigationId: rec.id,
          investigationShortName: rec.shortName,
          sourceLabel: `${pub.journal} (${pub.date})`,
          sourceUrl: `https://doi.org/${pub.doi}`,
          doiOrId: `DOI ${pub.doi}`,
          limitations: rec.limitations.slice(0, 2),
          relatedClaimIds: [],
        });
      }
    }

    // 4. Explicit unverified/historical ambiguity notes where documented
    if (rec.historicalNotes && rec.historicalNotes.length > 0) {
      for (let i = 0; i < rec.historicalNotes.length; i += 1) {
        const note = rec.historicalNotes[i];
        claims.push({
          id: `claim-${rec.id}-hist-${i}`,
          claimText: note,
          category: 'Unverified information',
          verificationStatus: 'Requires upstream verification',
          evidenceStrength: 'Synthesis / unverified',
          investigationId: rec.id,
          investigationShortName: rec.shortName,
          sourceLabel: rec.sourceLabel,
          sourceUrl: rec.sourceUrl,
          doiOrId: idBadge,
          limitations: rec.limitations,
          relatedClaimIds: [],
        });
      }
    }
  }

  // 5. Research gap synthesis claims clearly separated
  for (const gap of gaps) {
    const primaryInv = records.find((r) => gap.relatedInvestigationIds.includes(r.id));
    claims.push({
      id: `claim-gap-${gap.id}`,
      claimText: `${gap.title}: ${gap.description}`,
      category: gap.isAiSynthesis ? 'AI interpretation' : 'Review-based conclusion',
      verificationStatus: 'Cross-source interpretation',
      evidenceStrength: 'Synthesis / unverified',
      investigationId: primaryInv?.id ?? records[0]?.id ?? 'bass-ii',
      investigationShortName: gap.relatedInvestigationIds
        .map((id) => records.find((r) => r.id === id)?.shortName ?? id)
        .slice(0, 3)
        .join(', '),
      sourceLabel: gap.supportingSources[0] ?? 'FLAREX Curated Dossier',
      sourceUrl: primaryInv?.sourceUrl ?? '/assets/aistudio/Project_Research_Dossier__Flame-in-Freefall_Challenge_2026__7dd02da0.pdf',
      doiOrId: null,
      limitations: gap.limitations,
      relatedClaimIds: [],
    });
  }

  // Link claims belonging to the same investigation
  const byInv = new Map<string, string[]>();
  for (const c of claims) {
    const arr = byInv.get(c.investigationId) ?? [];
    arr.push(c.id);
    byInv.set(c.investigationId, arr);
  }
  for (const c of claims) {
    c.relatedClaimIds = (byInv.get(c.investigationId) ?? [])
      .filter((id) => id !== c.id)
      .slice(0, 4);
  }

  return claims;
}

export function filterEvidenceClaims(
  claims: EvidenceClaimRecord[],
  options: {
    query: string;
    category: EvidenceClaimCategory | 'ALL';
    investigationId: string;
    verificationStatus: ClaimVerificationStatus | 'ALL';
  }
): EvidenceClaimRecord[] {
  const q = options.query.trim().toLowerCase();
  return claims.filter((c) => {
    if (options.category !== 'ALL' && c.category !== options.category) {
      return false;
    }
    if (
      options.investigationId !== 'ALL' &&
      c.investigationId !== options.investigationId
    ) {
      return false;
    }
    if (
      options.verificationStatus !== 'ALL' &&
      c.verificationStatus !== options.verificationStatus
    ) {
      return false;
    }
    if (!q) return true;
    return [
      c.claimText,
      c.category,
      c.verificationStatus,
      c.evidenceStrength,
      c.investigationShortName,
      c.sourceLabel,
      c.doiOrId ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}
