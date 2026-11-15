import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import type { ReproducibleAnalysisRun } from './scientificAnalysis.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';

export type EvidenceCategory6 =
  | 'SOURCE_FACT'
  | 'PUBLISHED_RESULT'
  | 'RAW_MEASUREMENT'
  | 'DERIVED_STATISTIC'
  | 'METHODOLOGY'
  | 'AI_INTERPRETATION'
  | 'RESEARCH_GAP';

export type EvidenceVerificationState =
  | 'Direct NASA / Peer-Reviewed Record'
  | 'Technical Memorandum / Abstract'
  | 'Pending Flight Release / Planned'
  | 'Terrestrial Analog (1g Only)'
  | 'User-Imported Tabular Measurement'
  | 'Computed Deterministically by FLAREX'
  | 'AI-Generated Synthesis (Unverified)'
  | 'Documented Knowledge Gap';

export interface ScientificEvidenceItem {
  evidenceId: string;
  investigationId: string;
  investigationShortName: string;
  sourceId: string;
  category: EvidenceCategory6;
  originalSourceReference: string;
  sourceUrl: string;
  locationReference: string | null;
  valueOrText: string;
  numericValue: number | null;
  unit: string | null;
  verificationStatus: EvidenceVerificationState;
  extractionMethod:
    | 'Curated Dossier JSON Field'
    | 'Structured Quantitative Catalog'
    | 'Browser Tabular Ingestion'
    | 'Deterministic Statistical Engine'
    | 'LLM Assistant Synthesis'
    | 'Gap Audit Extractor';
  completenessInfo: string;
  lastUpdated: string;
}

export interface AiInterpretationInput {
  id: string;
  text: string;
  investigationId?: string;
  model?: string;
  timestamp: string;
}

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory6, string> = {
  SOURCE_FACT: 'Source Fact',
  PUBLISHED_RESULT: 'Published Result',
  RAW_MEASUREMENT: 'Raw Measurement',
  DERIVED_STATISTIC: 'Derived Statistic',
  METHODOLOGY: 'Methodology',
  AI_INTERPRETATION: 'AI Interpretation',
  RESEARCH_GAP: 'Research Gap',
};

function resolveSourceId(rec: InvestigationRecord): string {
  if (rec.ntrsDocumentId) return `NTRS-${rec.ntrsDocumentId}`;
  if (rec.psiId) return `PSI-${rec.psiId}`;
  if (rec.doi) return `DOI-${rec.doi}`;
  return `DOSSIER-${rec.id.toUpperCase()}`;
}

function resolveVerification(rec: InvestigationRecord): EvidenceVerificationState {
  if (rec.isPlannedOrOngoing) return 'Pending Flight Release / Planned';
  if (!rec.isMicrogravity) return 'Terrestrial Analog (1g Only)';
  if (rec.evidenceType === 'PEER-REVIEWED PAPER' || rec.doi || (rec.publications && rec.publications.length > 0)) {
    return 'Direct NASA / Peer-Reviewed Record';
  }
  if (rec.ntrsDocumentId || rec.evidenceType === 'PRESENTATION / ABSTRACT') {
    return 'Technical Memorandum / Abstract';
  }
  return 'Direct NASA / Peer-Reviewed Record';
}

export function buildEvidenceCatalog(input: {
  investigations: InvestigationRecord[];
  gaps?: ResearchGapRecord[];
  ingestedDatasets?: IngestedDatasetPackage[];
  analysisRuns?: ReproducibleAnalysisRun[];
  aiInterpretations?: AiInterpretationInput[];
  timestamp?: string;
}): ScientificEvidenceItem[] {
  const updatedAt = input.timestamp ?? new Date().toISOString();
  const items: ScientificEvidenceItem[] = [];

  for (const rec of input.investigations) {
    const sourceId = resolveSourceId(rec);
    const verificationStatus = resolveVerification(rec);
    const baseCompleteness = `${rec.environmentalVariables.length} env vars · ${rec.sensors.length} sensors · ${rec.quantitativeData.length} quant entries`;

    // 1. SOURCE_FACT — overview & platform context
    items.push({
      evidenceId: `ev-fact-${rec.id}-overview`,
      investigationId: rec.id,
      investigationShortName: rec.shortName,
      sourceId,
      category: 'SOURCE_FACT',
      originalSourceReference: rec.sourceLabel,
      sourceUrl: rec.sourceUrl,
      locationReference: rec.publicationDate
        ? `Primary record (${rec.publicationDate})`
        : `Dossier record (${rec.timeframe})`,
      valueOrText: `${rec.name} on ${rec.platform} (${rec.gravityContext}): ${rec.overview}`,
      numericValue: null,
      unit: null,
      verificationStatus,
      extractionMethod: 'Curated Dossier JSON Field',
      completenessInfo: baseCompleteness,
      lastUpdated: updatedAt,
    });

    // 2. METHODOLOGY — hardware, sensors, measurement methods, fuels
    const methodParts = [
      rec.measurementMethods ? `Methods: ${rec.measurementMethods}` : null,
      rec.materialsAndGeometry ? `Geometry/Materials: ${rec.materialsAndGeometry}` : null,
      rec.sensors.length > 0 ? `Sensors: ${rec.sensors.join(', ')}` : null,
      rec.fuels.length > 0 ? `Fuels: ${rec.fuels.join(', ')}` : null,
    ].filter(Boolean);

    if (methodParts.length > 0) {
      items.push({
        evidenceId: `ev-method-${rec.id}`,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceId,
        category: 'METHODOLOGY',
        originalSourceReference: rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        locationReference: rec.hardware ? `Hardware: ${rec.hardware}` : 'Experimental setup section',
        valueOrText: methodParts.join(' | '),
        numericValue: null,
        unit: null,
        verificationStatus,
        extractionMethod: 'Curated Dossier JSON Field',
        completenessInfo:
          rec.measurementMethods && rec.materialsAndGeometry
            ? 'Methods and sample geometry documented'
            : 'Partial methodology summary only',
        lastUpdated: updatedAt,
      });
    }

    // 3. PUBLISHED_RESULT — qualitative findings + quantitative bounds/counts
    if (rec.reportedFindings) {
      items.push({
        evidenceId: `ev-result-${rec.id}-findings`,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceId,
        category: 'PUBLISHED_RESULT',
        originalSourceReference: rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        locationReference: rec.ntrsDocumentId
          ? `NTRS ${rec.ntrsDocumentId} findings summary`
          : 'Reported findings field',
        valueOrText: rec.reportedFindings,
        numericValue: null,
        unit: null,
        verificationStatus,
        extractionMethod: 'Curated Dossier JSON Field',
        completenessInfo: rec.hasRawNumericalDataset
          ? 'Backed by raw tabular telemetry'
          : 'Qualitative/summary result; raw CSV telemetry hosted externally in NASA PSI',
        lastUpdated: updatedAt,
      });
    }

    for (const q of rec.quantitativeData) {
      items.push({
        evidenceId: `ev-result-${rec.id}-${q.id}`,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceId,
        category: 'PUBLISHED_RESULT',
        originalSourceReference: q.sourceCitation || rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        locationReference: q.conditionContext || 'Quantitative summary entry',
        valueOrText: `${q.label}: ${q.valueDisplay} (${q.qualityNote})`,
        numericValue:
          typeof q.numericValue === 'number'
            ? q.numericValue
            : typeof q.max === 'number'
            ? q.max
            : null,
        unit: q.unit || null,
        verificationStatus,
        extractionMethod: 'Structured Quantitative Catalog',
        completenessInfo: `${q.kind} · ${q.qualityNote}`,
        lastUpdated: updatedAt,
      });
    }

    // 4. RESEARCH_GAP — limitations & planned/missing flight data
    for (let idx = 0; idx < rec.limitations.length; idx += 1) {
      const lim = rec.limitations[idx];
      items.push({
        evidenceId: `ev-gap-${rec.id}-${idx}`,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        sourceId,
        category: 'RESEARCH_GAP',
        originalSourceReference: rec.sourceLabel,
        sourceUrl: rec.sourceUrl,
        locationReference: `Limitation note #${idx + 1}`,
        valueOrText: lim,
        numericValue: null,
        unit: null,
        verificationStatus: 'Documented Knowledge Gap',
        extractionMethod: 'Gap Audit Extractor',
        completenessInfo: rec.isPlannedOrOngoing
          ? 'Planned/ongoing investigation awaiting flight release'
          : 'Explicit source scope boundary',
        lastUpdated: updatedAt,
      });
    }
  }

  // Cross-study curated gaps
  for (const gap of input.gaps ?? []) {
    const primaryInvId = gap.relatedInvestigationIds[0] ?? 'general';
    const primaryRec = input.investigations.find((r) => r.id === primaryInvId);
    items.push({
      evidenceId: `ev-gap-catalog-${gap.id}`,
      investigationId: primaryInvId,
      investigationShortName: primaryRec?.shortName ?? gap.area,
      sourceId: gap.isAiSynthesis ? 'FLAREX-GAP-SYNTHESIS' : 'DOSSIER-GAP',
      category: gap.isAiSynthesis ? 'AI_INTERPRETATION' : 'RESEARCH_GAP',
      originalSourceReference: gap.supportingSources[0] ?? 'FLAREX Research Dossier',
      sourceUrl: primaryRec?.sourceUrl ?? 'https://psi.nasa.gov/physci/repo',
      locationReference: `Gap Area: ${gap.area}`,
      valueOrText: `${gap.title} — ${gap.description}`,
      numericValue: null,
      unit: null,
      verificationStatus: gap.isAiSynthesis
        ? 'AI-Generated Synthesis (Unverified)'
        : 'Documented Knowledge Gap',
      extractionMethod: gap.isAiSynthesis
        ? 'LLM Assistant Synthesis'
        : 'Gap Audit Extractor',
      completenessInfo: `${gap.evidenceStrength} · ${gap.limitations[0] ?? 'Bounded to reviewed FLAREX records'}`,
      lastUpdated: updatedAt,
    });
  }

  // 5. RAW_MEASUREMENT — user-imported datasets
  for (const ds of input.ingestedDatasets ?? []) {
    for (const col of ds.columns) {
      items.push({
        evidenceId: `ev-raw-${ds.provenance.datasetId}-${col.normalizedName}`,
        investigationId: ds.provenance.investigationId ?? 'session-dataset',
        investigationShortName: ds.provenance.originalFilename,
        sourceId: ds.provenance.datasetId,
        category: 'RAW_MEASUREMENT',
        originalSourceReference: `${ds.provenance.originalFilename} (${ds.provenance.repository})`,
        sourceUrl: ds.provenance.sourceUrl,
        locationReference: `Column "${col.originalName}" (${ds.summary.rowCount} rows)`,
        valueOrText: `Imported column "${col.originalName}" (${col.inferredType}): ${col.validNumericCount} valid numeric entries, ${col.missingCount} missing (${col.missingPct}%), ${col.invalidNumericCount} non-numeric flagged as null.`,
        numericValue: col.validNumericCount,
        unit: col.detectedUnit,
        verificationStatus: 'User-Imported Tabular Measurement',
        extractionMethod: 'Browser Tabular Ingestion',
        completenessInfo: `Import status: ${ds.provenance.importStatus} · Retrieved ${ds.provenance.retrievalDate}`,
        lastUpdated: ds.provenance.retrievalDate,
      });
    }
  }

  // 6. DERIVED_STATISTIC — FLAREX deterministic calculations
  for (const run of input.analysisRuns ?? []) {
    let summaryText = `${run.calculationMethodLabel} on ${run.inputVariables.join(', ')} (n=${run.sampleCount}).`;
    let numericVal: number | null = null;
    let unit: string | null = Object.values(run.units)[0] ?? null;

    if (run.descriptive) {
      const d = run.descriptive;
      summaryText = `Descriptive Stats (${d.variable}): n=${d.sampleCount}, mean=${d.mean}, median=${d.median}, min=${d.min}, max=${d.max}${
        d.stdDev !== null ? `, SD(n-1)=${d.stdDev}` : ''
      }, missing=${d.missingPct}%.`;
      numericVal = d.mean;
      unit = d.unit;
    } else if (run.correlation) {
      summaryText = `Non-Causal Correlation (${run.correlation.xVariable} vs ${run.correlation.yVariable}): Pearson r=${run.correlation.pearsonR} across n=${run.correlation.pairCount} valid pairs.`;
      numericVal = run.correlation.pearsonR;
      unit = null;
    } else if (run.timeSeriesSummary) {
      const t = run.timeSeriesSummary;
      summaryText = `Ordered Sequence (${t.timeVariable} → ${t.valueVariable}): net Δ=${t.netDelta}, peak=${t.peakValue}, trough=${t.troughValue} across n=${t.pointCount} points.`;
      numericVal = t.netDelta;
      unit = t.valueUnit;
    }

    items.push({
      evidenceId: `ev-stat-${run.runId}`,
      investigationId: 'session-analysis',
      investigationShortName: run.datasetFilename,
      sourceId: run.runId,
      category: 'DERIVED_STATISTIC',
      originalSourceReference: `${run.datasetFilename} (${run.sourceVersion})`,
      sourceUrl: run.sourceUrl,
      locationReference: `Reproducible Run ${run.runId}`,
      valueOrText: summaryText,
      numericValue: numericVal,
      unit,
      verificationStatus: 'Computed Deterministically by FLAREX',
      extractionMethod: 'Deterministic Statistical Engine',
      completenessInfo: `${run.missingDataHandling} · ${run.softwareVersion}`,
      lastUpdated: run.timestamp,
    });
  }

  // 7. AI_INTERPRETATION — explicitly segregated
  for (const ai of input.aiInterpretations ?? []) {
    items.push({
      evidenceId: `ev-ai-${ai.id}`,
      investigationId: ai.investigationId ?? 'ai-session',
      investigationShortName: ai.model ?? 'AI Assistant Synthesis',
      sourceId: ai.id,
      category: 'AI_INTERPRETATION',
      originalSourceReference: ai.model ?? 'Gemini Assistant Output',
      sourceUrl: 'https://ntrs.nasa.gov/',
      locationReference: 'Session AI Interpretation',
      valueOrText: ai.text,
      numericValue: null,
      unit: null,
      verificationStatus: 'AI-Generated Synthesis (Unverified)',
      extractionMethod: 'LLM Assistant Synthesis',
      completenessInfo:
        'Must be cross-checked against SOURCE_FACT and PUBLISHED_RESULT entries before citation.',
      lastUpdated: ai.timestamp,
    });
  }

  return items;
}

export function filterEvidenceCatalog(
  catalog: ScientificEvidenceItem[],
  options: {
    query?: string;
    category?: EvidenceCategory6 | 'ALL';
    investigationId?: string | 'ALL';
  }
): ScientificEvidenceItem[] {
  const q = (options.query ?? '').trim().toLowerCase();
  return catalog.filter((item) => {
    if (options.category && options.category !== 'ALL' && item.category !== options.category) {
      return false;
    }
    if (
      options.investigationId &&
      options.investigationId !== 'ALL' &&
      item.investigationId !== options.investigationId
    ) {
      return false;
    }
    if (!q) return true;
    return [
      item.investigationShortName,
      item.sourceId,
      item.category,
      item.originalSourceReference,
      item.valueOrText,
      item.locationReference ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

export function summarizeEvidenceCoverage(catalog: ScientificEvidenceItem[]): {
  total: number;
  byCategory: Record<EvidenceCategory6, number>;
  uniqueSourceCount: number;
} {
  const byCategory: Record<EvidenceCategory6, number> = {
    SOURCE_FACT: 0,
    PUBLISHED_RESULT: 0,
    RAW_MEASUREMENT: 0,
    DERIVED_STATISTIC: 0,
    METHODOLOGY: 0,
    AI_INTERPRETATION: 0,
    RESEARCH_GAP: 0,
  };
  const sourceIds = new Set<string>();
  for (const item of catalog) {
    byCategory[item.category] += 1;
    sourceIds.add(item.sourceId);
  }
  return {
    total: catalog.length,
    byCategory,
    uniqueSourceCount: sourceIds.size,
  };
}
