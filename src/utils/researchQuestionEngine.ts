import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import { analyzeCrossStudyComparison, CrossStudyAnalysisReport } from './crossStudyAnalysis.ts';
import {
  buildEvidenceCatalog,
  ScientificEvidenceItem,
} from './evidenceIntelligence.ts';
import {
  buildRetrievedSourceRefs,
  RagQueryClassification,
  RetrievedSourceCitation,
  runAdvancedRagRetrieval,
} from './ragPipeline.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';
import {
  detectScientificConflicts,
  ScientificConflictRecord,
} from './scientificUncertainty.ts';

export interface StructuredResearchBrief {
  briefId: string;
  generatedAt: string;
  researchQuestion: string;
  classification: RagQueryClassification;
  hasSufficientEvidence: boolean;
  relevantInvestigations: Array<{
    id: string;
    shortName: string;
    name: string;
    gravityContext: string;
    evidenceType: string;
    relevanceScore: number;
    matchedFields: string[];
  }>;
  availableEvidence: ScientificEvidenceItem[];
  publishedFindings: Array<{
    investigationShortName: string;
    finding: string;
    sourceLabel: string;
    sourceUrl: string;
  }>;
  numericalDataAvailability: {
    localSessionDatasetsCount: number;
    relevantPublishedQuantitativeEntries: number;
    isNumericalAnalysisPossible: boolean;
    explanation: string;
  };
  comparisonOpportunities: CrossStudyAnalysisReport | null;
  evidenceLimitations: string[];
  uncertaintyWarnings: ScientificConflictRecord[];
  unansweredQuestions: string[];
  references: RetrievedSourceCitation[];
}

export const SAMPLE_RESEARCH_QUESTIONS: string[] = [
  'How does microgravity influence flame structure?',
  'How do different fuel materials behave in microgravity?',
  'What role does oxygen concentration play in combustion?',
  'How do airflow conditions influence flame behavior?',
  'What differences exist between droplet combustion and solid-fuel combustion?',
  'Which measurements are available across different investigations?',
  'What information is still missing?',
];

export function exploreResearchQuestion(
  question: string,
  investigations: InvestigationRecord[],
  options?: {
    gaps?: ResearchGapRecord[];
    ingestedDatasets?: IngestedDatasetPackage[];
    evidenceCatalog?: ScientificEvidenceItem[];
    timestamp?: string;
  }
): StructuredResearchBrief {
  const cleanQuestion =
    question.trim() || 'How does microgravity influence flame structure?';
  const generatedAt = options?.timestamp ?? new Date().toISOString();

  const evidenceCatalog =
    options?.evidenceCatalog ??
    buildEvidenceCatalog({
      investigations,
      gaps: options?.gaps ?? [],
      ingestedDatasets: options?.ingestedDatasets ?? [],
      timestamp: generatedAt,
    });

  const rag = runAdvancedRagRetrieval(cleanQuestion, investigations, {
    maxResults: 4,
  });
  const topCandidates = rag.diagnostics.selectedRecords;
  const matchedAnyDirectly = topCandidates.some(
    (c) => c.score >= 5 || (c.score > 0 && c.matchedTerms.length >= 2)
  );
  const selectedIds = new Set(rag.selectedRecords.map((r) => r.id));

  const relevantInvestigations = rag.selectedRecords.map((rec) => {
    const candidate = topCandidates.find((c) => c.id === rec.id);
    return {
      id: rec.id,
      shortName: rec.shortName,
      name: rec.name,
      gravityContext: rec.gravityContext,
      evidenceType: rec.evidenceType,
      relevanceScore: candidate?.score ?? 0,
      matchedFields: candidate?.matchedFields ?? [],
    };
  });

  const availableEvidence = evidenceCatalog
    .filter(
      (ev) =>
        selectedIds.has(ev.investigationId) &&
        ev.category !== 'AI_INTERPRETATION'
    )
    .slice(0, 12);

  const publishedFindings = rag.selectedRecords
    .filter((r) => Boolean(r.reportedFindings))
    .map((r) => ({
      investigationShortName: r.shortName,
      finding: r.reportedFindings as string,
      sourceLabel: r.sourceLabel,
      sourceUrl: r.sourceUrl,
    }));

  const relevantQuantCount = rag.selectedRecords.reduce(
    (sum, r) => sum + r.quantitativeData.length,
    0
  );
  const localDatasets = options?.ingestedDatasets ?? [];
  const isNumericalAnalysisPossible = localDatasets.some(
    (ds) => ds.summary.numericColumnCount > 0 && ds.summary.rowCount >= 2
  );

  const numericalExplanation = isNumericalAnalysisPossible
    ? `${localDatasets.length} tabular dataset(s) are loaded in this browser session and eligible for descriptive, histogram, and correlation analysis.`
    : `0 raw experimental CSV/TSV time-series datasets are currently imported for these studies (${relevantQuantCount} published summary bound/count entries exist in dossier metadata; raw telemetry files reside in NASA PSI).`;

  const comparisonOpportunities =
    rag.selectedRecords.length >= 2
      ? analyzeCrossStudyComparison(rag.selectedRecords.slice(0, 3))
      : null;

  const evidenceLimitations = Array.from(
    new Set([
      ...(!matchedAnyDirectly
        ? [
            'Insufficient direct evidence in reviewed FLAREX records for these specific query terms; avoid extrapolating unindexed domains.',
          ]
        : []),
      ...rag.diagnostics.missingEvidenceWarnings,
      ...rag.selectedRecords.flatMap((r) => r.limitations.slice(0, 2)),
    ])
  ).slice(0, 8);

  const allConflicts = detectScientificConflicts({
    investigations: rag.selectedRecords,
    evidenceCatalog: availableEvidence,
    ingestedDatasets: localDatasets,
  });

  const unansweredQuestions = Array.from(
    new Set([
      ...(options?.gaps ?? [])
        .filter((g) =>
          g.relatedInvestigationIds.some((id) => selectedIds.has(id))
        )
        .map((g) => `${g.title} (Potential gap in reviewed FLAREX records)`),
      ...rag.selectedRecords
        .filter((r) => r.isPlannedOrOngoing)
        .map(
          (r) =>
            `What completed flight telemetry will ${r.shortName} release once on-orbit campaigns conclude?`
        ),
      !matchedAnyDirectly
        ? 'No direct lexical matches found in the 16-record FLAREX dossier for this specific phrasing; inspect NASA NTRS/PSI directly.'
        : '',
    ])
  )
    .filter(Boolean)
    .slice(0, 6);

  const references = buildRetrievedSourceRefs(rag.selectedRecords);

  return {
    briefId: `brief-${Date.now()}`,
    generatedAt,
    researchQuestion: cleanQuestion,
    classification: rag.diagnostics.classification,
    hasSufficientEvidence: matchedAnyDirectly && publishedFindings.length > 0,
    relevantInvestigations,
    availableEvidence,
    publishedFindings,
    numericalDataAvailability: {
      localSessionDatasetsCount: localDatasets.length,
      relevantPublishedQuantitativeEntries: relevantQuantCount,
      isNumericalAnalysisPossible,
      explanation: numericalExplanation,
    },
    comparisonOpportunities,
    evidenceLimitations,
    uncertaintyWarnings: allConflicts.slice(0, 4),
    unansweredQuestions,
    references,
  };
}

export function renderResearchBriefMarkdown(brief: StructuredResearchBrief): string {
  const lines: string[] = [
    `# FLAREX Structured Research Brief`,
    '',
    `- **Generated:** ${brief.generatedAt}`,
    `- **Classification:** ${brief.classification.label}`,
    `- **Sufficiency:** ${
      brief.hasSufficientEvidence
        ? 'Supported by matched dossier records (subject to documented limitations)'
        : 'Limited or insufficient direct findings in loaded dossier'
    }`,
    '',
    `## 1. Research Question`,
    brief.researchQuestion,
    '',
    `## 2. Relevant Investigations`,
    ...brief.relevantInvestigations.map(
      (i) =>
        `- **${i.shortName}** (${i.name}) — ${i.gravityContext} · ${i.evidenceType} (Score: ${i.relevanceScore})`
    ),
    '',
    `## 3. Available Evidence`,
    ...brief.availableEvidence
      .slice(0, 6)
      .map(
        (e) =>
          `- [${e.category}] **${e.investigationShortName}** (${e.sourceId}): ${e.valueOrText}`
      ),
    '',
    `## 4. Published Findings`,
    ...(brief.publishedFindings.length > 0
      ? brief.publishedFindings.map(
          (f) => `- **${f.investigationShortName}**: ${f.finding} (${f.sourceLabel})`
        )
      : ['- No completed experimental findings published in matched records.']),
    '',
    `## 5. Numerical Data Availability`,
    brief.numericalDataAvailability.explanation,
    '',
    `## 6. Comparison Opportunities`,
    brief.comparisonOpportunities
      ? `${brief.comparisonOpportunities.compatibilityClass} (${brief.comparisonOpportunities.findingComparisonClass}): ${brief.comparisonOpportunities.groundedExplanation}`
      : 'Insufficient matched studies for comparison.',
    '',
    `## 7. Evidence Limitations`,
    ...brief.evidenceLimitations.map((l) => `- ${l}`),
    '',
    `## 8. Unanswered Questions`,
    ...(brief.unansweredQuestions.length > 0
      ? brief.unansweredQuestions.map((u) => `- ${u}`)
      : ['- See Research Gap Intelligence for open cross-archive questions.']),
    '',
    `## 9. References`,
    ...brief.references.map((r, i) => `${i + 1}. ${r.sourceLabel} — ${r.sourceUrl}`),
  ];
  return lines.join('\n');
}
