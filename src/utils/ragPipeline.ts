import type { InvestigationRecord } from '../types/research.ts';

export type RagQueryCategory =
  | 'explanation'
  | 'terminology'
  | 'publication_summary'
  | 'comparison'
  | 'variables'
  | 'limitations'
  | 'source_discovery'
  | 'research_questions';

export interface RagQueryClassification {
  category: RagQueryCategory;
  label: string;
  strategyHint: string;
}

export interface RetrievedSourceCitation {
  id: string;
  shortName: string;
  name: string;
  sourceLabel: string;
  evidenceType: string;
  psiId: string | null;
  ntrsDocumentId: string | null;
  doi: string | null;
  sourceUrl: string;
  primaryLimitation: string;
}

export interface NormalizedQueryResult {
  originalQuery: string;
  normalizedText: string;
  tokens: string[];
  expandedTokens: string[];
}

export interface RankedRetrievalCandidate {
  id: string;
  shortName: string;
  score: number;
  matchedTerms: string[];
  matchedFields: string[];
  selected: boolean;
  exclusionReason?: string;
}

export interface RagRetrievalDiagnostics {
  normalizedQuery: NormalizedQueryResult;
  classification: RagQueryClassification;
  totalCorpusCount: number;
  selectedRecords: RankedRetrievalCandidate[];
  excludedRecords: RankedRetrievalCandidate[];
  selectedEvidenceSummary: string[];
  missingEvidenceWarnings: string[];
  documentContextAttached: boolean;
  documentTitle?: string;
}

export interface CitationValidationSummary {
  totalRefs: number;
  validRefs: number;
  citedUnknownIds: string[];
  allCitationsValid: boolean;
  unverifiedClaimsFlagged: string[];
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'with',
  'what',
  'why',
  'how',
  'does',
  'between',
  'from',
  'about',
  'this',
  'that',
  'which',
  'into',
  'can',
  'have',
  'were',
  'there',
  'their',
]);

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  battery: ['li-ion', 'lfp', 'nmc', 'thermal', 'runaway', 'vent', 'terrestrial'],
  partial: ['lunar', 'mars', 'martian', 'moon', 'e-field', 'gravity'],
  smoke: ['soot', 'aerosol', 'particulate', 'p-trak', 'detector', 'same', 'daft', 'spice'],
  cool: ['flex', 'cfi-g', 'ch2o', 'formaldehyde', 'droplet', '600', '1000'],
  electric: ['e-field', '10 kv', 'ion', 'acme'],
  planned: ['sofie', 'cld', 'flame design', 's-flame', 'tbd'],
  enclosure: ['confined', 'baffle', 'sibal', 'saffire', 'cygnus', 'wall'],
  solid: ['bass', 'pmma', 'cotton', 'wire', 'sofie', 'bre'],
};

export function normalizeQuery(query: string): NormalizedQueryResult {
  const normalizedText = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ');
  const tokens = normalizedText
    .split(' ')
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    for (const [key, syns] of Object.entries(DOMAIN_SYNONYMS)) {
      if (token.includes(key) || key.includes(token)) {
        syns.forEach((s) => expanded.add(s));
      }
    }
  }

  return {
    originalQuery: query,
    normalizedText,
    tokens,
    expandedTokens: Array.from(expanded),
  };
}

export function classifyResearchQuery(query: string): RagQueryClassification {
  const q = query.trim().toLowerCase();

  if (/\b(compare|comparisons?|versus|vs\.?|differences?|differ|contrast|between)\b/.test(q)) {
    return {
      category: 'comparison',
      label: 'Cross-Study Comparison',
      strategyHint:
        'Contrast platforms, fuels, gravity provenance, and experimental constraints explicitly.',
    };
  }
  if (/\b(gaps?|research questions?|open questions?|future|missing|unexplored|unknown)\b/.test(q)) {
    return {
      category: 'research_questions',
      label: 'Research Gaps & Open Questions',
      strategyHint:
        'Frame missing evidence strictly within reviewed FLAREX records without claiming global absence.',
    };
  }
  if (/\b(limit|limitations?|caveats?|bias|incomplete|planned|not available|missing data)\b/.test(q)) {
    return {
      category: 'limitations',
      label: 'Limitations & Evidence Audit',
      strategyHint:
        'Highlight evidence maturity, 0g vs 1g constraints, and unverified/pending data boundaries.',
    };
  }
  if (/\b(sources?|psi|ntrs|osdr|dois?|repositories|repository|datasets?|download|urls?|links?|where can i find)\b/.test(q)) {
    return {
      category: 'source_discovery',
      label: 'Source & Dataset Discovery',
      strategyHint:
        'Prioritize exact PSI IDs, NTRS document IDs, DOIs, and official portal URLs.',
    };
  }
  if (/\b(papers?|publications?|reports?|authors?|journals?|summarize|summary|findings)\b/.test(q)) {
    return {
      category: 'publication_summary',
      label: 'Publication & Study Summary',
      strategyHint:
        'Cite exact authors, publication year/timeframe, documented findings, and source URLs.',
    };
  }
  if (/\b(variables?|oxygen|o2|pressure|airflow|velocity|sensors?|thermocouples?|cameras?|fuels?|pmma|kv)\b/.test(q)) {
    return {
      category: 'variables',
      label: 'Variables & Instrumentation',
      strategyHint:
        'Specify documented fuels, sensors, operating bounds, and omitted parameters transparently.',
    };
  }
  if (/\b(what is|define|meaning|stand for|acronyms?|terminology)\b/.test(q)) {
    return {
      category: 'terminology',
      label: 'Terminology & Concept Definition',
      strategyHint:
        'Define combustion and NASA facility acronyms clearly using dossier definitions.',
    };
  }

  return {
    category: 'explanation',
    label: 'Microgravity Concept Explanation',
    strategyHint:
      'Explain physical mechanisms cleanly while distinguishing documented dossier facts from synthesis.',
  };
}

export function runAdvancedRagRetrieval(
  query: string,
  records: InvestigationRecord[],
  options?: {
    maxResults?: number;
    focusInvestigationId?: string;
    documentTitle?: string;
  }
): {
  selectedRecords: InvestigationRecord[];
  diagnostics: RagRetrievalDiagnostics;
} {
  const maxResults = options?.maxResults ?? 4;
  const normalizedQuery = normalizeQuery(query);
  const classification = classifyResearchQuery(query);

  const scored = records.map((record) => {
    let score = 0;
    const matchedTerms = new Set<string>();
    const matchedFields = new Set<string>();

    const titleText = `${record.name} ${record.shortName} ${record.psiId ?? ''} ${record.ntrsDocumentId ?? ''}`.toLowerCase();
    const fuelsText = record.fuels.join(' ').toLowerCase();
    const varsText = [
      ...record.environmentalVariables,
      ...(record.sensors ?? []),
      record.materialsAndGeometry ?? '',
    ]
      .join(' ')
      .toLowerCase();
    const bodyText = [
      record.family,
      record.platform,
      record.gravityContext,
      record.overview,
      record.scientificPurpose ?? '',
      record.reportedFindings ?? '',
      record.scientificRelevance ?? '',
      ...record.limitations,
      ...record.tags,
    ]
      .join(' ')
      .toLowerCase();

    for (const token of normalizedQuery.expandedTokens) {
      if (titleText.includes(token)) {
        score += 6;
        matchedTerms.add(token);
        matchedFields.add('title/identifier');
      }
      if (fuelsText.includes(token)) {
        score += 4;
        matchedTerms.add(token);
        matchedFields.add('fuels');
      }
      if (varsText.includes(token)) {
        score += 3;
        matchedTerms.add(token);
        matchedFields.add('variables/sensors');
      }
      if (bodyText.includes(token)) {
        score += 2;
        matchedTerms.add(token);
        matchedFields.add('overview/findings');
      }
    }

    if (normalizedQuery.normalizedText.includes(record.shortName.toLowerCase())) {
      score += 12;
      matchedTerms.add(record.shortName.toLowerCase());
      matchedFields.add('exact_short_name');
    }
    if (options?.focusInvestigationId && record.id === options.focusInvestigationId) {
      score += 15;
      matchedFields.add('user_focus_pin');
    }

    return {
      record,
      score,
      matchedTerms: Array.from(matchedTerms),
      matchedFields: Array.from(matchedFields),
    };
  });

  const sorted = [...scored].sort(
    (a, b) =>
      b.score - a.score || a.record.shortName.localeCompare(b.record.shortName)
  );

  const nonZero = sorted.filter((s) => s.score > 0);
  const selectedPool =
    nonZero.length > 0
      ? nonZero.slice(0, maxResults)
      : sorted
          .filter((s) =>
            ['bass-ii', 'saffire', 'flex-cfi-g', 'dossier-literature-review'].includes(
              s.record.id
            )
          )
          .slice(0, maxResults);

  const selectedIds = new Set(selectedPool.map((s) => s.record.id));
  const selectedCandidates: RankedRetrievalCandidate[] = selectedPool.map((s) => ({
    id: s.record.id,
    shortName: s.record.shortName,
    score: s.score,
    matchedTerms: s.matchedTerms,
    matchedFields: s.matchedFields,
    selected: true,
  }));

  const excludedCandidates: RankedRetrievalCandidate[] = sorted
    .filter((s) => !selectedIds.has(s.record.id))
    .map((s) => ({
      id: s.record.id,
      shortName: s.record.shortName,
      score: s.score,
      matchedTerms: s.matchedTerms,
      matchedFields: s.matchedFields,
      selected: false,
      exclusionReason:
        s.score === 0
          ? 'No lexical or domain-synonym overlap with query tokens'
          : `Ranked outside top-${maxResults} retrieval context budget (score ${s.score})`,
    }));

  const selectedRecords = selectedPool.map((s) => s.record);
  const selectedEvidenceSummary = selectedRecords.map(
    (r) =>
      `${r.shortName}: ${r.evidenceType} (${r.dataAvailabilityLabel}${
        r.psiId ? `, PSI ${r.psiId}` : ''
      }${r.ntrsDocumentId ? `, NTRS ${r.ntrsDocumentId}` : ''})`
  );

  const missingEvidenceWarnings: string[] = [];
  if (selectedRecords.every((r) => !r.hasRawNumericalDataset)) {
    missingEvidenceWarnings.push(
      'None of the retrieved records include bundled raw time-series CSV telemetry locally.'
    );
  }
  if (selectedRecords.some((r) => r.isPlannedOrOngoing)) {
    missingEvidenceWarnings.push(
      'At least one retrieved record is planned/ongoing (e.g. SoFIE or unlaunched ACME module) and has no flight results.'
    );
  }
  if (selectedRecords.some((r) => !r.isMicrogravity)) {
    missingEvidenceWarnings.push(
      'Retrieved set includes ground-based terrestrial 1g data (battery testing); must not be equated to 0g data.'
    );
  }
  if (nonZero.length === 0) {
    missingEvidenceWarnings.push(
      'No direct keyword hits matched query tokens; fallback representative dossier records were loaded.'
    );
  }

  return {
    selectedRecords,
    diagnostics: {
      normalizedQuery,
      classification,
      totalCorpusCount: records.length,
      selectedRecords: selectedCandidates,
      excludedRecords: excludedCandidates,
      selectedEvidenceSummary,
      missingEvidenceWarnings,
      documentContextAttached: Boolean(options?.documentTitle),
      documentTitle: options?.documentTitle,
    },
  };
}

export function validateCitations(
  answerText: string,
  retrievedRefs: RetrievedSourceCitation[],
  allValidRecords: InvestigationRecord[]
): CitationValidationSummary {
  const validSourceIds = new Set(retrievedRefs.map((r) => r.id));
  const validShortNames = retrievedRefs.map((r) => r.shortName.toLowerCase());
  const allShortNames = new Map(
    allValidRecords.map((r) => [r.shortName.toLowerCase(), r.id])
  );

  const unknownMentioned: string[] = [];
  const lower = answerText.toLowerCase();

  for (const [shortLower, id] of allShortNames.entries()) {
    if (shortLower.length >= 4 && lower.includes(shortLower)) {
      if (!validSourceIds.has(id) && !validShortNames.includes(shortLower)) {
        unknownMentioned.push(id);
      }
    }
  }

  const unverifiedClaimsFlagged: string[] = [];
  if (/\bproves?\b|\bproven\b/i.test(answerText)) {
    unverifiedClaimsFlagged.push(
      'Response uses causal/definitive phrasing ("proves"); verify against source limitations.'
    );
  }
  if (/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i.test(answerText)) {
    const doisInText = answerText.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g) ?? [];
    const allowedDois = new Set(
      allValidRecords
        .flatMap((r) => [r.doi, ...(r.publications?.map((p) => p.doi) ?? [])])
        .filter((d): d is string => Boolean(d))
        .map((d) => d.toLowerCase())
    );
    for (const d of doisInText) {
      if (!allowedDois.has(d.toLowerCase())) {
        unverifiedClaimsFlagged.push(`Unverified DOI string detected in answer: ${d}`);
      }
    }
  }

  const validRefs = retrievedRefs.filter(
    (r) => r.sourceUrl.startsWith('https://') || r.sourceUrl.startsWith('/assets/')
  ).length;

  return {
    totalRefs: retrievedRefs.length,
    validRefs,
    citedUnknownIds: unknownMentioned,
    allCitationsValid:
      validRefs === retrievedRefs.length &&
      unknownMentioned.length === 0 &&
      unverifiedClaimsFlagged.length === 0,
    unverifiedClaimsFlagged,
  };
}

export function buildRetrievedSourceRefs(
  records: InvestigationRecord[]
): RetrievedSourceCitation[] {
  return records.map((r) => ({
    id: r.id,
    shortName: r.shortName,
    name: r.name,
    sourceLabel: r.sourceLabel,
    evidenceType: r.evidenceType,
    psiId: r.psiId,
    ntrsDocumentId: r.ntrsDocumentId ?? null,
    doi: r.doi,
    sourceUrl: r.sourceUrl,
    primaryLimitation:
      r.limitations[0] ?? 'Inspect original NASA source for full experimental matrix.',
  }));
}
