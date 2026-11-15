import type { InvestigationRecord } from '../types/research.ts';
import type { ScientificEvidenceItem } from './evidenceIntelligence.ts';

export type ClaimCitationStatus =
  | 'Supported by direct evidence'
  | 'Supported by multiple sources'
  | 'Partially supported'
  | 'Conflicting evidence'
  | 'Insufficient evidence'
  | 'AI interpretation only';

export interface ClaimSourceLink {
  evidenceId: string;
  investigationId: string;
  investigationShortName: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  locationReference: string | null;
  excerpt: string;
  isDirectResult: boolean;
}

export interface VerifiedScientificClaim {
  claimId: string;
  claimText: string;
  topicTag: string;
  verificationStatus: ClaimCitationStatus;
  origin: 'DOSSIER_FACT' | 'USER_CLAIM' | 'AI_GENERATED';
  supportingSources: ClaimSourceLink[];
  conflictingNotes: string[];
  missingEvidenceNotes: string[];
  explanation: string;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'have',
  'were',
  'been',
  'about',
  'does',
  'what',
  'when',
  'where',
  'which',
  'their',
  'only',
  'more',
  'than',
  'over',
  'under',
]);

function extractClaimTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    )
  );
}

function detectTopicTag(text: string): string {
  const lower = text.toLowerCase();
  if (/e-field|electric|ion wind|acme/.test(lower)) return 'Electric-Field Flame Control';
  if (/cool flame|cfi-g|flex|droplet/.test(lower)) return 'Droplet & Cool Diffusion Flames';
  if (/saffire|cygnus|large-scale/.test(lower)) return 'Large-Scale Spacecraft Fire Safety';
  if (/battery|li-ion|nmc|lfp|ul 9540/.test(lower)) return 'Battery Thermal Runaway (1g Baseline)';
  if (/smoke|soot|aerosol|same|daft|spice|p-trak/.test(lower)) return 'Smoke & Aerosol Detection';
  if (/lunar|mars|martian|partial gravity/.test(lower)) return 'Partial-Gravity Extrapolation';
  if (/sofie|pmma|bass|solid|flame structure|microgravity/.test(lower)) return 'Microgravity Flame Structure & Solid Fuels';
  return 'Microgravity Combustion';
}

export function verifyClaimAgainstEvidence(
  claimText: string,
  evidenceCatalog: ScientificEvidenceItem[],
  options?: {
    claimId?: string;
    origin?: 'DOSSIER_FACT' | 'USER_CLAIM' | 'AI_GENERATED';
    targetInvestigationId?: string;
  }
): VerifiedScientificClaim {
  const cleanClaim = claimText.trim();
  const origin = options?.origin ?? 'USER_CLAIM';
  const claimId =
    options?.claimId ??
    `claim-${cleanClaim.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36)}`;
  const topicTag = detectTopicTag(cleanClaim);
  const tokens = extractClaimTokens(cleanClaim);
  const lowerClaim = cleanClaim.toLowerCase();

  // Check if claim comes purely from AI without specifying factual grounding
  if (origin === 'AI_GENERATED') {
    const aiOnlyEvidence = evidenceCatalog.filter(
      (e) =>
        e.category !== 'AI_INTERPRETATION' &&
        e.category !== 'RESEARCH_GAP' &&
        tokens.some((t) => e.valueOrText.toLowerCase().includes(t))
    );
    if (aiOnlyEvidence.length === 0) {
      return {
        claimId,
        claimText: cleanClaim,
        topicTag,
        verificationStatus: 'AI interpretation only',
        origin,
        supportingSources: [],
        conflictingNotes: [],
        missingEvidenceNotes: [
          'This statement originated from AI synthesis with no matching SOURCE_FACT or PUBLISHED_RESULT in FLAREX.',
        ],
        explanation:
          'Tagged strictly as AI interpretation only because no primary NASA record or publication supports it.',
      };
    }
  }

  // Explicit scientific boundary / conflict checks
  const conflictingNotes: string[] = [];
  const missingEvidenceNotes: string[] = [];

  if (
    (/\b(lunar|mars|martian|partial gravity|partial-gravity)\b/.test(lowerClaim) &&
      /\b(proves?|measured|flight data|tested on|experimental dataset)\b/.test(lowerClaim)) ||
    (/acme|e-field/.test(lowerClaim) && /partial gravity|lunar|mars/.test(lowerClaim))
  ) {
    conflictingNotes.push(
      'Reviewed FLAREX records document microgravity (0g) and E-FIELD electrostatic ion winds—NOT lunar (0.16g) or Martian (0.38g) flight measurements.'
    );
  }

  if (
    /battery|li-ion|nmc|lfp/.test(lowerClaim) &&
    /\b(microgravity|0g|iss|spaceflight)\b/.test(lowerClaim) &&
    !/not microgravity|terrestrial|1g/.test(lowerClaim)
  ) {
    conflictingNotes.push(
      'UL battery fire tests in the dossier were conducted in terrestrial 1g laboratory atmosphere, NOT ISS microgravity.'
    );
  }

  if (
    /sofie|flame design|s-flame|cld/.test(lowerClaim) &&
    /\b(completed|flight results|raw csv|telemetry available)\b/.test(lowerClaim)
  ) {
    conflictingNotes.push(
      'SoFIE and selected ACME/planned records are marked as planned/ongoing or pending PSI data release in the reviewed dossier.'
    );
  }

  // Score candidate factual / result / methodology evidence items
  const factualPool = evidenceCatalog.filter(
    (e) =>
      e.category === 'PUBLISHED_RESULT' ||
      e.category === 'SOURCE_FACT' ||
      e.category === 'METHODOLOGY' ||
      e.category === 'RAW_MEASUREMENT'
  );

  const scoredMatches = factualPool
    .map((ev) => {
      if (
        options?.targetInvestigationId &&
        ev.investigationId !== options.targetInvestigationId
      ) {
        return { ev, hits: 0, isDirect: false };
      }
      const haystack = `${ev.investigationShortName} ${ev.valueOrText} ${ev.originalSourceReference}`.toLowerCase();
      let hits = 0;
      for (const tok of tokens) {
        if (haystack.includes(tok)) hits += 1;
      }
      const isDirect =
        ev.category === 'PUBLISHED_RESULT' || ev.category === 'RAW_MEASUREMENT';
      return { ev, hits, isDirect };
    })
    .filter((m) => m.hits >= Math.min(2, Math.max(1, tokens.length)))
    .sort((a, b) => {
      const plannedPenaltyA = a.ev.verificationStatus === 'Pending Flight Release / Planned' ? -1.5 : 0;
      const plannedPenaltyB = b.ev.verificationStatus === 'Pending Flight Release / Planned' ? -1.5 : 0;
      const scoreA = a.hits + (a.isDirect ? 2 : 0) + plannedPenaltyA;
      const scoreB = b.hits + (b.isDirect ? 2 : 0) + plannedPenaltyB;
      return scoreB - scoreA;
    });

  const uniqueSourceIds = new Set<string>();
  const countPerSource = new Map<string, number>();
  const supportingSources: ClaimSourceLink[] = [];
  for (const { ev, isDirect } of scoredMatches) {
    if (supportingSources.length >= 6) break;
    const prevCount = countPerSource.get(ev.sourceId) ?? 0;
    if (prevCount >= 2 && scoredMatches.length > 6) continue;
    countPerSource.set(ev.sourceId, prevCount + 1);
    uniqueSourceIds.add(ev.sourceId);
    supportingSources.push({
      evidenceId: ev.evidenceId,
      investigationId: ev.investigationId,
      investigationShortName: ev.investigationShortName,
      sourceId: ev.sourceId,
      sourceLabel: ev.originalSourceReference,
      sourceUrl: ev.sourceUrl,
      locationReference: ev.locationReference,
      excerpt: ev.valueOrText.slice(0, 260) + (ev.valueOrText.length > 260 ? '…' : ''),
      isDirectResult: isDirect,
    });
  }

  // Check if all matched records are planned/unlaunched
  const onlyPlannedMatches =
    supportingSources.length > 0 &&
    scoredMatches
      .slice(0, supportingSources.length)
      .every((m) => m.ev.verificationStatus === 'Pending Flight Release / Planned');

  if (supportingSources.length === 0) {
    missingEvidenceNotes.push(
      'No directly matching published result or source fact found in the loaded FLAREX dossier for these claim terms.'
    );
  }
  if (onlyPlannedMatches) {
    missingEvidenceNotes.push(
      'Matched sources describe planned/ongoing investigations prior to published flight findings.'
    );
  }

  let verificationStatus: ClaimCitationStatus;
  let explanation: string;

  if (conflictingNotes.length > 0) {
    verificationStatus = 'Conflicting evidence';
    explanation =
      'Claim conflicts with gravity-context, facility-condition, or publication-maturity boundaries documented in primary FLAREX sources.';
  } else if (origin === 'AI_GENERATED' && supportingSources.length === 0) {
    verificationStatus = 'AI interpretation only';
    explanation = 'Originates from AI text without direct dossier corroboration.';
  } else if (supportingSources.length === 0) {
    verificationStatus = 'Insufficient evidence';
    explanation =
      'Topic may relate broadly to combustion, but no specific evidence record substantiates this claim.';
  } else if (onlyPlannedMatches) {
    verificationStatus = 'Partially supported';
    explanation =
      'Referenced in planned NASA investigation descriptions, but experimental flight results are not yet published in reviewed sources.';
  } else if (
    uniqueSourceIds.size >= 2 &&
    supportingSources.some((s) => s.isDirectResult)
  ) {
    verificationStatus = 'Supported by multiple sources';
    explanation = `Corroborated across ${uniqueSourceIds.size} distinct dossier/NASA source identifiers with published findings or quantitative bounds.`;
  } else if (supportingSources.some((s) => s.isDirectResult)) {
    verificationStatus = 'Supported by direct evidence';
    explanation = `Directly grounded in ${supportingSources[0].sourceId} (${supportingSources[0].investigationShortName}).`;
  } else {
    verificationStatus = 'Partially supported';
    explanation =
      'Mentioned in study overview or methodology descriptions, but lacks a direct published numerical or experimental outcome entry in FLAREX.';
  }

  if (origin === 'AI_GENERATED' && supportingSources.length === 0) {
    verificationStatus = 'AI interpretation only';
  }

  return {
    claimId,
    claimText: cleanClaim,
    topicTag,
    verificationStatus,
    origin,
    supportingSources,
    conflictingNotes,
    missingEvidenceNotes,
    explanation,
  };
}

export function extractAndVerifyDossierClaims(
  investigations: InvestigationRecord[],
  evidenceCatalog: ScientificEvidenceItem[]
): VerifiedScientificClaim[] {
  const verified: VerifiedScientificClaim[] = [];

  for (const rec of investigations) {
    const text = rec.reportedFindings ?? rec.scientificPurpose;
    if (!text) continue;
    const isPlanned = rec.isPlannedOrOngoing;
    const matchingEv = evidenceCatalog.filter(
      (e) =>
        e.investigationId === rec.id &&
        (e.category === 'PUBLISHED_RESULT' || e.category === 'SOURCE_FACT')
    );

    const links: ClaimSourceLink[] = matchingEv.slice(0, 3).map((ev) => ({
      evidenceId: ev.evidenceId,
      investigationId: ev.investigationId,
      investigationShortName: ev.investigationShortName,
      sourceId: ev.sourceId,
      sourceLabel: ev.originalSourceReference,
      sourceUrl: ev.sourceUrl,
      locationReference: ev.locationReference,
      excerpt: ev.valueOrText.slice(0, 220),
      isDirectResult: ev.category === 'PUBLISHED_RESULT',
    }));

    const hasPeerReview =
      rec.evidenceType === 'PEER-REVIEWED PAPER' ||
      (rec.publications && rec.publications.length > 0);
    const secondaryCount = rec.secondaryUrls.length + (rec.publications?.length ?? 0);

    let status: ClaimCitationStatus;
    let explanation: string;
    if (isPlanned && !rec.reportedFindings) {
      status = 'Insufficient evidence';
      explanation =
        'Planned or ongoing investigation objective without completed flight findings in reviewed sources.';
    } else if (isPlanned && rec.reportedFindings) {
      status = 'Partially supported';
      explanation =
        'Includes preliminary description or related citation, while full on-orbit dataset release remains pending.';
    } else if (hasPeerReview && secondaryCount >= 1) {
      status = 'Supported by multiple sources';
      explanation = `Backed by primary NASA record plus ${secondaryCount} peer-reviewed/secondary reference(s).`;
    } else if (rec.reportedFindings) {
      status = 'Supported by direct evidence';
      explanation = `Documented in ${rec.sourceLabel}.`;
    } else {
      status = 'Insufficient evidence';
      explanation = 'No published result field available in reviewed source.';
    }

    verified.push({
      claimId: `claim-dossier-${rec.id}`,
      claimText: text,
      topicTag: detectTopicTag(`${rec.name} ${text}`),
      verificationStatus: status,
      origin: 'DOSSIER_FACT',
      supportingSources: links,
      conflictingNotes: [],
      missingEvidenceNotes: rec.hasRawNumericalDataset
        ? []
        : ['Raw numerical CSV telemetry is hosted externally in NASA PSI and not bundled locally.'],
      explanation,
    });
  }

  return verified;
}
