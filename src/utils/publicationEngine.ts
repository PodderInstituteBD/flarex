import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import { analyzeCrossStudyComparison } from './crossStudyAnalysis.ts';
import type { EvidenceCategory6 } from './evidenceIntelligence.ts';
import type { ReproducibilityRecord } from './reproducibilityEngine.ts';
import type { ReproducibleAnalysisRun } from './scientificAnalysis.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';
import { buildDatasetQualityReport } from './scientificValidation.ts';

export type PublicationReportType =
  | 'TYPE_A_INVESTIGATION'
  | 'TYPE_B_NUMERICAL'
  | 'TYPE_C_COMPARATIVE';

export interface PublicationReportSection {
  number: number;
  heading: string;
  attributionLayer: EvidenceCategory6;
  content: string;
}

export interface PublicationReportPackage {
  reportId: string;
  reportType: PublicationReportType;
  title: string;
  generatedAt: string;
  researchQuestion: string;
  datasetChecksums: Array<{ filename: string; sha256: string | null; rowCount: number }>;
  reproducibilityRunIds: string[];
  sections: PublicationReportSection[];
  references: Array<{ label: string; url: string; identifier: string | null }>;
}

export interface PublicationBuildInput {
  reportType: PublicationReportType;
  investigations: InvestigationRecord[];
  gaps: ResearchGapRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisRuns: ReproducibleAnalysisRun[];
  reproducibilityRecords?: ReproducibilityRecord[];
  researchQuestion?: string;
  aiInterpretationNote?: string;
  generatedAt?: string;
}

export function buildPublicationReport(
  input: PublicationBuildInput
): PublicationReportPackage {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reportId = `pub-${input.reportType.toLowerCase()}-${Date.now()}`;
  const researchQuestion =
    input.researchQuestion?.trim() ||
    'Evaluation of microgravity combustion behavior, experimental parameters, and documented safety findings.';
  const selected = input.investigations;
  const dsList = input.ingestedDatasets;
  const runs = input.analysisRuns;

  const checksums = dsList.map((ds) => ({
    filename: ds.provenance.originalFilename,
    sha256: ds.provenance.sha256Checksum ?? null,
    rowCount: ds.summary.rowCount,
  }));

  const refs: PublicationReportPackage['references'] = [];
  for (const r of selected) {
    refs.push({
      label: r.sourceLabel,
      url: r.sourceUrl,
      identifier: r.psiId || r.ntrsDocumentId || r.doi || null,
    });
    if (r.publications) {
      for (const p of r.publications) {
        refs.push({
          label: `${p.title} (${p.journal}, ${p.date})`,
          url: `https://doi.org/${p.doi}`,
          identifier: `DOI:${p.doi}`,
        });
      }
    }
  }

  const aiSectionContent = input.aiInterpretationNote?.trim()
    ? `${input.aiInterpretationNote.trim()}\n\n_[Layer: AI_INTERPRETATION — clearly segregated from verified source facts and deterministic calculations.]_`
    : 'No AI interpretation commentary attached. All sections above are strictly grounded in source records or deterministic statistics.';

  if (input.reportType === 'TYPE_A_INVESTIGATION') {
    const matchedGaps = input.gaps.filter((g) =>
      g.relatedInvestigationIds.some((id) => selected.some((s) => s.id === id))
    );
    const sections: PublicationReportSection[] = [
      {
        number: 1,
        heading: '1. Research Context & Overview',
        attributionLayer: 'SOURCE_FACT',
        content:
          `**Research Question:** ${researchQuestion}\n\n` +
          (selected.length > 0
            ? selected
                .map(
                  (r) =>
                    `- **${r.shortName}** (${r.name}) | ${r.family} | ${r.timeframe} — ${r.overview}`
                )
                .join('\n')
            : 'No investigations selected.'),
      },
      {
        number: 2,
        heading: '2. Source Identification & Provenance',
        attributionLayer: 'SOURCE_FACT',
        content:
          selected
            .map(
              (r) =>
                `- **${r.shortName}**: [${r.sourceLabel}](${r.sourceUrl}) · ${r.evidenceType}${
                  r.psiId ? ` · PSI ${r.psiId}` : ''
                }${r.ntrsDocumentId ? ` · NTRS ${r.ntrsDocumentId}` : ''}${
                  r.doi ? ` · DOI ${r.doi}` : ''
                } · Availability: ${r.dataAvailabilityLabel}`
            )
            .join('\n') || 'None.',
      },
      {
        number: 3,
        heading: '3. Experimental Conditions & Hardware',
        attributionLayer: 'METHODOLOGY',
        content:
          selected
            .map(
              (r) =>
                `- **${r.shortName}**: Platform=${r.platform} | Gravity=${r.gravityContext} (${
                  r.isMicrogravity ? '0g' : '1g terrestrial'
                }) | Fuels=${r.fuels.join(', ')} | Variables=${r.environmentalVariables.join(
                  ', '
                )} | Sensors=${r.sensors.join(', ')}`
            )
            .join('\n') || 'None.',
      },
      {
        number: 4,
        heading: '4. Evidence Classification Summary',
        attributionLayer: 'SOURCE_FACT',
        content:
          selected
            .map(
              (r) =>
                `- **${r.shortName}**: Evidence=${r.evidenceType} | Status=${
                  r.isPlannedOrOngoing ? 'Planned / Ongoing' : 'Completed / Documented'
                } | Quantitative Dossier Entries=${r.quantitativeData.length}`
            )
            .join('\n') || 'None.',
      },
      {
        number: 5,
        heading: '5. Key Published Findings',
        attributionLayer: 'PUBLISHED_RESULT',
        content:
          selected
            .map(
              (r) =>
                `- **${r.shortName}**: ${
                  r.reportedFindings ??
                  'No published flight findings recorded in reviewed source yet.'
                }`
            )
            .join('\n') || 'None.',
      },
      {
        number: 6,
        heading: '6. Cross-Study Comparison Notes',
        attributionLayer: 'METHODOLOGY',
        content:
          selected.length >= 2
            ? analyzeCrossStudyComparison(selected).groundedExplanation
            : 'Select at least 2 studies for cross-investigation compatibility synthesis.',
      },
      {
        number: 7,
        heading: '7. Limitations & Knowledge Gaps',
        attributionLayer: 'RESEARCH_GAP',
        content:
          [
            ...selected.flatMap((r) =>
              r.limitations.map((l) => `- **${r.shortName} Limitation:** ${l}`)
            ),
            ...matchedGaps
              .slice(0, 5)
              .map((g) => `- **Research Gap (${g.area}):** ${g.title} — ${g.description}`),
          ].join('\n') || 'No additional limitations recorded.',
      },
      {
        number: 8,
        heading: '8. AI Interpretation (Clearly Separated)',
        attributionLayer: 'AI_INTERPRETATION',
        content: aiSectionContent,
      },
      {
        number: 9,
        heading: '9. References',
        attributionLayer: 'SOURCE_FACT',
        content:
          refs
            .map(
              (ref, i) =>
                `${i + 1}. ${ref.label} — ${ref.url}${
                  ref.identifier ? ` (${ref.identifier})` : ''
                }`
            )
            .join('\n') || 'None.',
      },
    ];

    return {
      reportId,
      reportType: input.reportType,
      title: 'FLAREX 7.0 Type A — Investigation Research Report',
      generatedAt,
      researchQuestion,
      datasetChecksums: checksums,
      reproducibilityRunIds: runs.map((r) => r.runId),
      sections,
      references: refs,
    };
  }

  if (input.reportType === 'TYPE_B_NUMERICAL') {
    const qualityReports = dsList.map((d) => buildDatasetQualityReport(d));
    const sections: PublicationReportSection[] = [
      {
        number: 1,
        heading: '1. Dataset Provenance & Metadata',
        attributionLayer: 'RAW_MEASUREMENT',
        content:
          dsList.length === 0
            ? 'No external tabular dataset imported in the active session.'
            : dsList
                .map(
                  (d) =>
                    `- **${d.provenance.originalFilename}** (\`${d.provenance.format}\`) · Repository: ${d.provenance.repository} · Source: ${d.provenance.sourceUrl} · SHA-256: \`${d.provenance.sha256Checksum ?? 'Not computed'}\` · Retrieved: ${d.provenance.retrievalDate}`
                )
                .join('\n'),
      },
      {
        number: 2,
        heading: '2. Data Validation Results',
        attributionLayer: 'METHODOLOGY',
        content:
          qualityReports.length === 0
            ? 'Validation pending dataset import.'
            : qualityReports
                .map(
                  (qr) =>
                    `- **${qr.filename}**: Readiness=\`${qr.readinessAssessment}\` — ${qr.readinessRationale}`
                )
                .join('\n'),
      },
      {
        number: 3,
        heading: '3. Variable Schema & Units',
        attributionLayer: 'RAW_MEASUREMENT',
        content:
          dsList.length === 0
            ? 'No imported schema columns.'
            : dsList
                .map(
                  (d) =>
                    `### ${d.provenance.originalFilename}\n` +
                    d.columns
                      .map(
                        (c) =>
                          `- \`${c.originalName}\` (\`${c.normalizedName}\`): type=${
                            c.inferredType
                          }, unit=${c.detectedUnit ?? 'unspecified'}, validNumeric=${
                            c.validNumericCount
                          }`
                      )
                      .join('\n')
                )
                .join('\n\n'),
      },
      {
        number: 4,
        heading: '4. Missing-Value & Quality Summary',
        attributionLayer: 'METHODOLOGY',
        content:
          dsList.length === 0
            ? 'No rows to inspect.'
            : dsList
                .map(
                  (d) =>
                    `- **${d.provenance.originalFilename}**: ${d.summary.rowCount} rows × ${d.summary.columnCount} cols · Missing=${d.summary.totalMissingCells} (${d.summary.missingPctOverall}%, mapped to null — never 0) · Invalid numeric=${d.summary.totalInvalidNumericCells} · Duplicate rows=${d.summary.duplicateRowCount}`
                )
                .join('\n'),
      },
      {
        number: 5,
        heading: '5. Statistical Calculations',
        attributionLayer: 'DERIVED_STATISTIC',
        content:
          runs.length === 0
            ? 'No statistical calculations executed in the Numerical Workbench yet.'
            : runs
                .map((run) => {
                  if (run.descriptive) {
                    const d = run.descriptive;
                    return `- **Descriptive (${d.variable}${d.unit ? ` [${d.unit}]` : ''}):** n=${d.sampleCount}, mean=${d.mean}, median=${d.median}, min=${d.min}, max=${d.max}, var=${d.variance ?? 'N/A'}, SD(n-1)=${d.stdDev ?? 'N/A'}, Q1=${d.q1 ?? 'N/A'}, Q3=${d.q3 ?? 'N/A'}, IQR=${d.iqr ?? 'N/A'}`;
                  }
                  if (run.correlation) {
                    const c = run.correlation;
                    return `- **Bivariate (${c.xVariable} vs ${c.yVariable}):** n=${c.pairCount}, Pearson r=${c.pearsonR}${c.spearmanRho !== undefined && c.spearmanRho !== null ? `, Spearman rho=${c.spearmanRho}` : ''}${c.regressionEquation ? `, OLS ${c.regressionEquation}` : ''} — ${c.interpretationNote}`;
                  }
                  if (run.timeSeriesSummary) {
                    const t = run.timeSeriesSummary;
                    return `- **Sequence (${t.timeVariable} → ${t.valueVariable}):** n=${t.pointCount}, start=${t.startValue}, end=${t.endValue}, netDelta=${t.netDelta}, peak=${t.peakValue}, trough=${t.troughValue}`;
                  }
                  return `- **${run.calculationMethodLabel}:** ${run.errorMessage ?? 'Executed'}`;
                })
                .join('\n'),
      },
      {
        number: 6,
        heading: '6. Visualization Insights (Chart Summaries)',
        attributionLayer: 'DERIVED_STATISTIC',
        content:
          runs.length === 0
            ? 'No statistical charts generated yet.'
            : runs
                .map((run) =>
                  run.histogram?.length
                    ? `- **Histogram (${run.inputVariables[0]}):** ${run.histogram
                        .map((b) => `[${b.binLabel}]: ${b.count}`)
                        .join(', ')}`
                    : `- **Plot Summary (${run.inputVariables.join(' vs ')}):** Method=${run.method}, n=${run.sampleCount}`
                )
                .join('\n'),
      },
      {
        number: 7,
        heading: '7. Reproducibility Parameters & Checksums',
        attributionLayer: 'METHODOLOGY',
        content:
          (input.reproducibilityRecords && input.reproducibilityRecords.length > 0
            ? input.reproducibilityRecords.map(
                (rec) =>
                  `- **${rec.runId}**: sha256=\`${rec.sha256Checksum}\`, software=${rec.softwareVersion}, vars=[${rec.selectedVariables.join(', ')}], filters=[${rec.filterConditions.join('; ')}], missing="${rec.missingValueHandling}", timestamp=${rec.timestamp}`
              )
            : runs.map(
                (run) =>
                  `- **${run.runId}**: version=${run.sourceVersion}, software=${run.softwareVersion}, vars=[${run.inputVariables.join(', ')}], n=${run.sampleCount}, timestamp=${run.timestamp}`
              )
          ).join('\n') || 'No reproducibility ledger entries recorded yet.',
      },
      {
        number: 8,
        heading: '8. Methodological Limitations',
        attributionLayer: 'RESEARCH_GAP',
        content: [
          '- Missing and malformed tokens are mapped strictly to `null` (never zero-imputed).',
          '- Sample variance and standard deviation use Bessel (n - 1) correction.',
          '- Correlation & OLS regression describe linear association only and never establish causation.',
          '- Outliers flagged via 1.5×IQR are retained intact and never auto-deleted.',
        ].join('\n'),
      },
      {
        number: 9,
        heading: '9. AI Interpretation (Clearly Separated)',
        attributionLayer: 'AI_INTERPRETATION',
        content: aiSectionContent,
      },
    ];

    return {
      reportId,
      reportType: input.reportType,
      title: 'FLAREX 7.0 Type B — Numerical Data Analysis Report',
      generatedAt,
      researchQuestion,
      datasetChecksums: checksums,
      reproducibilityRunIds: runs.map((r) => r.runId),
      sections,
      references: refs,
    };
  }

  // TYPE_C_COMPARATIVE
  const comp = analyzeCrossStudyComparison(selected);
  const sections: PublicationReportSection[] = [
    {
      number: 1,
      heading: '1. Compared Investigations & Research Scope',
      attributionLayer: 'SOURCE_FACT',
      content:
        `**Comparative Question:** ${researchQuestion}\n` +
        `**Studies:** ${selected.map((r) => `${r.shortName} (${r.gravityContext})`).join(', ') || 'None'}\n` +
        `**Compatibility Class:** \`${comp.compatibilityClass}\` · **Findings Alignment:** \`${comp.findingComparisonClass}\``,
    },
    {
      number: 2,
      heading: '2. Experimental Compatibility Matrix (12 Dimensions)',
      attributionLayer: 'METHODOLOGY',
      content:
        comp.dimensions12
          .map((d) => `- **${d.dimension}** [${d.status}]: ${d.note}`)
          .join('\n') || 'Select at least 2 investigations to compare 12 dimensions.',
    },
    {
      number: 3,
      heading: '3. Matched Experimental Parameters',
      attributionLayer: 'SOURCE_FACT',
      content:
        comp.sharedExperimentalVariables.length > 0
          ? comp.sharedExperimentalVariables.map((v) => `- ${v}`).join('\n')
          : '- No identical environmental variables shared directly across all selected studies.',
    },
    {
      number: 4,
      heading: '4. Differing Experimental Parameters & Measurement Methods',
      attributionLayer: 'SOURCE_FACT',
      content:
        [
          ...comp.differentExperimentalVariables.map((v) => `- Variable divergence: ${v}`),
          ...comp.differentMeasurementTechniques.map((m) => `- Method: ${m}`),
        ].join('\n') || '- None detected.',
    },
    {
      number: 5,
      heading: '5. Unknown / Missing Parameters',
      attributionLayer: 'RESEARCH_GAP',
      content:
        comp.missingParameters.map((m) => `- ${m}`).join('\n') ||
        '- No parameter omissions flagged.',
    },
    {
      number: 6,
      heading: '6. Unit Compatibility & Methodological Notes',
      attributionLayer: 'METHODOLOGY',
      content:
        comp.incompatibleUnits.length > 0
          ? comp.incompatibleUnits.map((u) => `- Incompatible units across records: ${u}`).join('\n')
          : '- No cross-unit collisions detected in selected quantitative summaries.',
    },
    {
      number: 7,
      heading: '7. Cross-Study Synthesis & False-Equivalence Shields',
      attributionLayer: 'PUBLISHED_RESULT',
      content:
        `${comp.groundedExplanation}\n\n**Published Findings per Study:**\n` +
        selected
          .map(
            (r) =>
              `- **${r.shortName}:** ${
                r.reportedFindings ?? 'Planned/ongoing without published flight findings.'
              }`
          )
          .join('\n'),
    },
    {
      number: 8,
      heading: '8. AI Interpretation (Clearly Separated)',
      attributionLayer: 'AI_INTERPRETATION',
      content: aiSectionContent,
    },
    {
      number: 9,
      heading: '9. References',
      attributionLayer: 'SOURCE_FACT',
      content:
        refs
          .map(
            (ref, i) =>
              `${i + 1}. ${ref.label} — ${ref.url}${
                ref.identifier ? ` (${ref.identifier})` : ''
              }`
          )
          .join('\n') || 'None.',
    },
  ];

  return {
    reportId,
    reportType: input.reportType,
    title: 'FLAREX 7.0 Type C — Cross-Investigation Comparative Report',
    generatedAt,
    researchQuestion,
    datasetChecksums: checksums,
    reproducibilityRunIds: runs.map((r) => r.runId),
    sections,
    references: refs,
  };
}

export function renderPublicationMarkdown(pkg: PublicationReportPackage): string {
  const lines: string[] = [
    `# ${pkg.title}`,
    '',
    `- **Report ID:** \`${pkg.reportId}\``,
    `- **Generated:** ${pkg.generatedAt}`,
    `- **Platform:** FLAREX 7.0 — Fire Learning and Research Explorer (Independent student platform)`,
    pkg.datasetChecksums.length > 0
      ? `- **Dataset Checksums:** ${pkg.datasetChecksums
          .map((d) => `${d.filename} (sha256:${d.sha256 ?? 'none'})`)
          .join('; ')}`
      : '- **Dataset Checksums:** None attached',
    '',
  ];
  for (const s of pkg.sections) {
    lines.push(`## ${s.heading} _[${s.attributionLayer}]_`, '', s.content, '');
  }
  return lines.join('\n');
}

export function renderPublicationJson(pkg: PublicationReportPackage): string {
  return JSON.stringify(
    {
      schemaVersion: 'flarex-publication-7.0',
      provenancePolicy:
        'Each section is attributed to its explicit epistemic layer (SOURCE_FACT, PUBLISHED_RESULT, RAW_MEASUREMENT, DERIVED_STATISTIC, METHODOLOGY, AI_INTERPRETATION, RESEARCH_GAP).',
      ...pkg,
    },
    null,
    2
  );
}

export function renderPublicationCsv(pkg: PublicationReportPackage): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    ['Section Number', 'Heading', 'Attribution Layer', 'Content'],
    ...pkg.sections.map((s) => [
      String(s.number),
      s.heading,
      s.attributionLayer,
      s.content,
    ]),
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
