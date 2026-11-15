import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import type { ReproducibleAnalysisRun } from './scientificAnalysis.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';
import { analyzeExperimentalConditions } from './experimentalConditions.ts';

export interface ScientificFullReportInput {
  researchQuestion: string;
  selectedInvestigations: InvestigationRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisRuns: ReproducibleAnalysisRun[];
  gaps: ResearchGapRecord[];
  aiInterpretationNote?: string;
  generatedAt?: string;
}

export interface ScientificReportPackage {
  generatedAt: string;
  title: string;
  sections: Array<{
    number: number;
    heading: string;
    layer: 'SOURCE_FACT' | 'DERIVED_STATISTICS' | 'METHODOLOGY' | 'AI_INTERPRETATION';
    content: string;
  }>;
}

export function buildScientificReportPackage(
  input: ScientificFullReportInput
): ScientificReportPackage {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const question =
    input.researchQuestion.trim() ||
    'Comparative evaluation of microgravity combustion investigations, environmental bounds, and fire safety evidence.';

  const selected = input.selectedInvestigations;
  const conditionMatrix =
    selected.length >= 2 ? analyzeExperimentalConditions(selected) : null;

  const section1 = question;

  const section2 =
    selected.length === 0
      ? 'No investigations selected.'
      : selected
          .map(
            (r) =>
              `- **${r.shortName}** (${r.name}) | Family: ${r.family} | Platform: ${r.platform} | Gravity: ${r.gravityContext} | Classification: ${r.evidenceType}`
          )
          .join('\n');

  const section3 =
    selected.length === 0
      ? 'No source identifiers available.'
      : selected
          .map(
            (r) =>
              `- **${r.shortName}**: [${r.sourceLabel}](${r.sourceUrl})${
                r.psiId ? ` · PSI ID: ${r.psiId}` : ''
              }${r.ntrsDocumentId ? ` · NTRS ID: ${r.ntrsDocumentId}` : ''}${
                r.doi ? ` · DOI: ${r.doi}` : ''
              } · Availability: ${r.dataAvailabilityLabel}`
          )
          .join('\n');

  const section4Lines: string[] = [];
  if (input.ingestedDatasets.length > 0) {
    for (const ds of input.ingestedDatasets) {
      section4Lines.push(
        `- **Imported Dataset (${ds.provenance.format})**: ${ds.provenance.originalFilename} — ${ds.summary.rowCount} rows × ${ds.summary.columnCount} columns (${ds.summary.missingPctOverall}% missing, ${ds.summary.duplicateRowCount} duplicate rows) · Origin: ${ds.provenance.sourceUrl}`
      );
    }
  } else {
    section4Lines.push(
      '- **Local Numerical Telemetry Status**: 0 raw experimental CSV/telemetry datasets imported in the active session. Embedded figures reflect published counts and operating ranges only.'
    );
  }
  for (const r of selected) {
    if (r.quantitativeData.length > 0) {
      section4Lines.push(
        `- **${r.shortName} Published Bounds/Counts**: ${r.quantitativeData
          .map((q) => `${q.label}: ${q.valueDisplay} (${q.kind})`)
          .join('; ')}`
      );
    }
  }
  const section4 = section4Lines.join('\n');

  const section5Lines: string[] = [
    '- **Provenance Separation**: Source dossier facts, normalized numerical values (`null` for missing/invalid, never `0`), derived statistical calculations, and any AI synthesis are strictly segregated.',
  ];
  if (conditionMatrix) {
    section5Lines.push(
      `- **Experimental Condition Comparability**: Evaluated 8 dimensions across ${selected.length} studies — Overall assessment: **${conditionMatrix.overallStatus}**.`
    );
  }
  if (input.analysisRuns.length > 0) {
    for (const run of input.analysisRuns) {
      section5Lines.push(
        `- **Run \`${run.runId}\`** (${run.softwareVersion}): ${run.calculationMethodLabel} on \`${run.datasetFilename}\` [${run.inputVariables.join(', ')}] (n = ${run.sampleCount}; ${run.missingDataHandling})`
      );
    }
  }
  const section5 = section5Lines.join('\n');

  const section6Lines: string[] = [];
  if (input.analysisRuns.length === 0) {
    section6Lines.push(
      '- **Visualizations**: Catalog-level campaign timelines, archive distributions, and documented operating range charts rendered from verified dossier records. No derived statistical dataset plots executed yet in this session.'
    );
  } else {
    for (const run of input.analysisRuns) {
      if (run.histogram && run.histogram.length > 0) {
        section6Lines.push(
          `- **Histogram (${run.inputVariables[0]})**: ${run.histogram
            .map((b) => `[${b.binLabel}]: ${b.count}`)
            .join(', ')}`
        );
      }
      if (run.correlation) {
        section6Lines.push(
          `- **Scatter & Pearson Correlation (${run.correlation.xVariable} vs ${run.correlation.yVariable})**: r = ${run.correlation.pearsonR} (n = ${run.correlation.pairCount}, non-causal)`
        );
      }
      if (run.timeSeriesSummary) {
        section6Lines.push(
          `- **Sequence / Time-Series (${run.timeSeriesSummary.timeVariable} → ${run.timeSeriesSummary.valueVariable})**: Start ${run.timeSeriesSummary.startValue}, End ${run.timeSeriesSummary.endValue}, Peak ${run.timeSeriesSummary.peakValue}, Trough ${run.timeSeriesSummary.troughValue}`
        );
      }
    }
  }
  const section6 = section6Lines.join('\n');

  const section7Lines: string[] = ['### Documented Source Findings'];
  for (const r of selected) {
    section7Lines.push(
      `- **${r.shortName}**: ${r.reportedFindings ?? 'No completed experimental findings published yet in reviewed source.'}`
    );
  }
  if (input.analysisRuns.some((r) => r.descriptive || r.correlation || r.timeSeriesSummary)) {
    section7Lines.push('', '### Derived Numerical Analysis Results (Computed on Imported Data)');
    for (const run of input.analysisRuns) {
      if (run.descriptive) {
        const d = run.descriptive;
        section7Lines.push(
          `- **${d.variable}${d.unit ? ` (${d.unit})` : ''}**: n=${d.sampleCount} (missing ${d.missingPct}%), mean=${d.mean}, median=${d.median}, min=${d.min}, max=${d.max}${d.stdDev !== null ? `, SD=${d.stdDev}` : ''}`
        );
      }
      if (run.correlation) {
        section7Lines.push(`- **Correlation**: ${run.correlation.interpretationNote}`);
      }
      if (run.timeSeriesSummary) {
        const t = run.timeSeriesSummary;
        section7Lines.push(
          `- **Time-Series Summary**: Net delta = ${t.netDelta}${t.valueUnit ? ` ${t.valueUnit}` : ''} across [${t.timeStart}, ${t.timeEnd}]${t.timeUnit ? ` ${t.timeUnit}` : ''}`
        );
      }
    }
  }
  if (input.aiInterpretationNote?.trim()) {
    section7Lines.push(
      '',
      '### AI Interpretation / Researcher Commentary (Non-Experimental)',
      input.aiInterpretationNote.trim()
    );
  }
  const section7 = section7Lines.join('\n');

  const section8Lines: string[] = [];
  for (const r of selected) {
    for (const lim of r.limitations) {
      section8Lines.push(`- **${r.shortName}**: ${lim}`);
    }
  }
  if (conditionMatrix) {
    for (const dim of conditionMatrix.dimensions) {
      if (dim.status === 'Incompatible' || dim.status === 'Missing experimental parameters') {
        section8Lines.push(`- **Condition Matrix (${dim.dimension} — ${dim.status})**: ${dim.summary}`);
      }
    }
  }
  for (const gap of input.gaps.slice(0, 4)) {
    section8Lines.push(`- **Gap (${gap.area})**: ${gap.title}`);
  }
  const section8 = section8Lines.join('\n') || 'No specific limitations recorded.';

  const section9Lines: string[] = [];
  for (const r of selected) {
    section9Lines.push(`1. ${r.sourceLabel} — ${r.sourceUrl}`);
    if (r.publications) {
      for (const p of r.publications) {
        section9Lines.push(`   - ${p.title} (*${p.journal}*, ${p.date}) — DOI: ${p.doi}`);
      }
    }
  }
  const section9 = section9Lines.join('\n') || 'None.';

  return {
    generatedAt,
    title: 'FLAREX 5.0 Structured Scientific Investigation Report',
    sections: [
      { number: 1, heading: '1. Research Question', layer: 'SOURCE_FACT', content: section1 },
      { number: 2, heading: '2. Selected Investigations', layer: 'SOURCE_FACT', content: section2 },
      { number: 3, heading: '3. Source Information & Identifiers', layer: 'SOURCE_FACT', content: section3 },
      { number: 4, heading: '4. Available Numerical & Qualitative Data', layer: 'SOURCE_FACT', content: section4 },
      { number: 5, heading: '5. Analysis & Reproducibility Methodology', layer: 'METHODOLOGY', content: section5 },
      { number: 6, heading: '6. Visualizations & Distribution Summary', layer: 'DERIVED_STATISTICS', content: section6 },
      {
        number: 7,
        heading: '7. Findings (Source Facts vs. Derived Stats vs. AI Interpretation)',
        layer: input.aiInterpretationNote?.trim() ? 'AI_INTERPRETATION' : 'SOURCE_FACT',
        content: section7,
      },
      { number: 8, heading: '8. Limitations, Comparability Caveats & Missing Evidence', layer: 'SOURCE_FACT', content: section8 },
      { number: 9, heading: '9. References & Official Repository URLs', layer: 'SOURCE_FACT', content: section9 },
    ],
  };
}

export function renderScientificReportMarkdown(pkg: ScientificReportPackage): string {
  const lines = [
    `# ${pkg.title}`,
    '',
    `- **Generated:** ${pkg.generatedAt}`,
    '- **Platform:** FLAREX — Fire Learning and Research Explorer (Independent student-built platform; not affiliated with NASA)',
    '- **Provenance Standard:** Original source facts, normalized data, derived statistical calculations, and AI commentary are explicitly separated.',
    '',
  ];
  for (const sec of pkg.sections) {
    lines.push(`## ${sec.heading} _[${sec.layer}]_`, '', sec.content, '');
  }
  return lines.join('\n');
}

export function renderScientificReportJson(pkg: ScientificReportPackage): string {
  return JSON.stringify(
    {
      platform: 'FLAREX 5.0',
      provenancePolicy: 'SOURCE_FACT, DERIVED_STATISTICS, METHODOLOGY, and AI_INTERPRETATION sections are strictly separated.',
      ...pkg,
    },
    null,
    2
  );
}

export function renderScientificReportCsv(pkg: ScientificReportPackage): string {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    ['Section Number', 'Heading', 'Data Layer', 'Content'],
    ...pkg.sections.map((s) => [String(s.number), s.heading, s.layer, s.content]),
  ];
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

export interface ReportV2ExtendedInput {
  investigations: InvestigationRecord[];
  gaps: ResearchGapRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisRuns: ReproducibleAnalysisRun[];
  researchQuestion?: string;
  aiInterpretationNote?: string;
  generatedAt?: string;
}

/**
 * FLAREX 6.0 Module I — Type A: Investigation Research Report (9 exact sections)
 */
export function buildInvestigationResearchReportV2(
  input: ReportV2ExtendedInput
): ScientificReportPackage {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const selected = input.investigations;
  const conditionMatrix =
    selected.length >= 2 ? analyzeExperimentalConditions(selected) : null;

  const s1 =
    selected.length === 0
      ? 'No investigations selected.'
      : [
          input.researchQuestion?.trim()
            ? `**Research Focus:** ${input.researchQuestion.trim()}\n`
            : '',
          ...selected.map(
            (r) =>
              `- **${r.shortName}** (${r.name}) | Family: ${r.family} | Timeframe: ${r.timeframe} | Overview: ${r.overview}`
          ),
        ]
          .filter(Boolean)
          .join('\n');

  const s2 =
    selected.length === 0
      ? 'No experimental setup metadata selected.'
      : selected
          .map(
            (r) =>
              `- **${r.shortName}**: Platform=${r.platform}; Gravity=${r.gravityContext} (${
                r.isMicrogravity ? '0g' : '1g Terrestrial'
              }); Fuels=${r.fuels.join(', ')}; Variables=${r.environmentalVariables.join(
                ', '
              )}; Sensors=${r.sensors.join(', ')}`
          )
          .join('\n');

  const s3 =
    selected.length === 0
      ? 'No source provenance records.'
      : selected
          .map(
            (r) =>
              `- **${r.shortName}**: [${r.sourceLabel}](${r.sourceUrl}) · Classification=${
                r.evidenceType
              }${r.psiId ? ` · PSI=${r.psiId}` : ''}${
                r.ntrsDocumentId ? ` · NTRS=${r.ntrsDocumentId}` : ''
              }${r.doi ? ` · DOI=${r.doi}` : ''} · Availability=${r.dataAvailabilityLabel}`
          )
          .join('\n');

  const s4 =
    selected.length === 0
      ? 'No evidence summary available.'
      : selected
          .map((r) => {
            const qCount = r.quantitativeData.length;
            return `- **${r.shortName}**: ${r.evidenceType} (${
              r.isPlannedOrOngoing
                ? 'Pending Flight Release / Planned'
                : r.isMicrogravity
                ? 'Documented Spaceflight Record'
                : '1g Terrestrial Baseline'
            }) · ${qCount} quantitative dossier entry(s) · ${r.sensors.length} sensor(s)`;
          })
          .join('\n');

  const s5 =
    selected.length === 0
      ? 'No published findings available.'
      : selected
          .map(
            (r) =>
              `- **${r.shortName}**: ${
                r.reportedFindings ??
                'No completed flight experimental findings published in reviewed source yet.'
              }`
          )
          .join('\n');

  const s6 = conditionMatrix
    ? [
        `- **Overall Experimental Comparability:** ${conditionMatrix.overallStatus}`,
        `- **Guidance:** ${conditionMatrix.guidanceNote}`,
        ...conditionMatrix.dimensions.map(
          (d) => `- **${d.dimension}** (${d.status}): ${d.summary}`
        ),
      ].join('\n')
    : 'Select at least 2 investigations to generate cross-study experimental comparison notes.';

  const selectedIds = new Set(selected.map((r) => r.id));
  const matchingGaps = input.gaps.filter((g) =>
    g.relatedInvestigationIds.some((id) => selectedIds.has(id))
  );
  const s7Lines: string[] = [];
  for (const r of selected) {
    for (const lim of r.limitations) {
      s7Lines.push(`- **${r.shortName} Limitation:** ${lim}`);
    }
  }
  for (const g of matchingGaps.slice(0, 6)) {
    s7Lines.push(
      `- **Potential Gap (${g.area} — ${g.evidenceStrength}):** ${g.title} — ${g.description}`
    );
  }
  const s7 = s7Lines.join('\n') || 'No additional limitations recorded.';

  const s8 = input.aiInterpretationNote?.trim()
    ? `${input.aiInterpretationNote.trim()}\n\n_(Note: AI commentary is strictly non-experimental and does not alter source facts.)_`
    : 'No AI interpretation note attached to this report. All sections above are strictly extracted from verified dossier sources.';

  const s9Lines: string[] = [];
  for (const r of selected) {
    s9Lines.push(`1. ${r.sourceLabel} — ${r.sourceUrl}`);
    if (r.publications) {
      for (const p of r.publications) {
        s9Lines.push(`   - ${p.title} (*${p.journal}*, ${p.date}) — DOI: ${p.doi}`);
      }
    }
  }
  const s9 = s9Lines.join('\n') || 'None.';

  return {
    generatedAt,
    title: 'FLAREX 6.0 Type A — Investigation Research Report',
    sections: [
      { number: 1, heading: '1. Investigation overview', layer: 'SOURCE_FACT', content: s1 },
      { number: 2, heading: '2. Experimental setup and environment', layer: 'SOURCE_FACT', content: s2 },
      { number: 3, heading: '3. Source citations and provenance', layer: 'SOURCE_FACT', content: s3 },
      { number: 4, heading: '4. Evidence summary', layer: 'SOURCE_FACT', content: s4 },
      { number: 5, heading: '5. Key published findings', layer: 'SOURCE_FACT', content: s5 },
      { number: 6, heading: '6. Comparison notes', layer: 'METHODOLOGY', content: s6 },
      { number: 7, heading: '7. Research gaps and limitations', layer: 'SOURCE_FACT', content: s7 },
      { number: 8, heading: '8. AI interpretation (clearly separated)', layer: 'AI_INTERPRETATION', content: s8 },
      { number: 9, heading: '9. References', layer: 'SOURCE_FACT', content: s9 },
    ],
  };
}

/**
 * FLAREX 6.0 Module I — Type B: Numerical Data Analysis Report (9 exact sections)
 */
export function buildNumericalAnalysisReportV2(
  input: ReportV2ExtendedInput
): ScientificReportPackage {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const dsList = input.ingestedDatasets;
  const runs = input.analysisRuns;

  const s1 =
    dsList.length === 0
      ? 'No raw tabular dataset imported in the active session. Built-in dossier records contain metadata and published range summaries only.'
      : dsList
          .map(
            (ds) =>
              `- **File:** ${ds.provenance.originalFilename} (${ds.provenance.format}) · **Repository:** ${ds.provenance.repository} · **Origin:** ${ds.provenance.sourceUrl} · **Retrieved At:** ${ds.provenance.retrievalDate}`
          )
          .join('\n');

  const s2 =
    dsList.length === 0
      ? 'Validation not executed: no local dataset imported yet.'
      : dsList
          .map(
            (ds) =>
              `- **${ds.provenance.originalFilename}**: Import status=${ds.provenance.importStatus}; Warnings=${
                ds.summary.warnings.length > 0 ? ds.summary.warnings.join('; ') : 'None'
              }; Errors=${ds.summary.errors.length > 0 ? ds.summary.errors.join('; ') : 'None'}`
          )
          .join('\n');

  const s3 =
    dsList.length === 0
      ? 'No tabular column schema detected.'
      : dsList
          .map(
            (ds) =>
              `### ${ds.provenance.originalFilename}\n` +
              ds.columns
                .map(
                  (c) =>
                    `- \`${c.originalName}\` (normalized: \`${c.normalizedName}\`): type=${
                      c.inferredType
                    }, unit=${c.detectedUnit ?? 'unspecified'}, validNumeric=${
                      c.validNumericCount
                    }`
                )
                .join('\n')
          )
          .join('\n\n');

  const s4 =
    dsList.length === 0
      ? 'Missing-value and duplicate checks await dataset import.'
      : dsList
          .map(
            (ds) =>
              `- **${ds.provenance.originalFilename}**: ${ds.summary.rowCount} rows × ${ds.summary.columnCount} cols · Missing cells=${ds.summary.totalMissingCells} (${ds.summary.missingPctOverall}%, mapped to null — never 0) · Invalid numeric=${ds.summary.totalInvalidNumericCells} · Duplicate rows=${ds.summary.duplicateRowCount}`
          )
          .join('\n');

  const s5 =
    runs.length === 0
      ? 'No statistical calculations executed yet in the active Numerical Workbench session.'
      : runs
          .map((run) => {
            if (run.descriptive) {
              const d = run.descriptive;
              return `- **Descriptive (${d.variable}${d.unit ? ` [${d.unit}]` : ''}):** n=${d.sampleCount}, mean=${d.mean}, median=${d.median}, min=${d.min}, max=${d.max}, sampleSD(n-1)=${d.stdDev ?? 'N/A (n<2)'}`;
            }
            if (run.correlation) {
              return `- **Pearson Correlation (${run.correlation.xVariable} vs ${run.correlation.yVariable}):** r=${run.correlation.pearsonR} (pairs=${run.correlation.pairCount}; ${run.correlation.interpretationNote})`;
            }
            if (run.timeSeriesSummary) {
              const t = run.timeSeriesSummary;
              return `- **Sequence Summary (${t.timeVariable} → ${t.valueVariable}):** start=${t.startValue}, end=${t.endValue}, netDelta=${t.netDelta}, peak=${t.peakValue}, trough=${t.troughValue}`;
            }
            return `- **Run ${run.runId}:** ${run.errorMessage ?? run.calculationMethodLabel}`;
          })
          .join('\n');

  const s6 =
    runs.length === 0
      ? 'No generated dataset histograms, scatter plots, or time-series trajectories yet.'
      : runs
          .map((run) => {
            if (run.histogram?.length) {
              return `- **Histogram (${run.inputVariables[0]}):** ${run.histogram
                .map((b) => `[${b.binLabel}]: ${b.count}`)
                .join(', ')}`;
            }
            if (run.correlation) {
              return `- **Scatter Plot:** ${run.correlation.xVariable} vs ${run.correlation.yVariable} (${run.correlation.pairCount} valid pairs)`;
            }
            if (run.timeSeriesSummary) {
              return `- **Sequence Trajectory:** ${run.timeSeriesSummary.pointCount} ordered points`;
            }
            return `- **Run ${run.runId}:** No chart data emitted.`;
          })
          .join('\n');

  const s7 =
    runs.length === 0
      ? 'No reproducibility ledger entries recorded yet.'
      : runs
          .map(
            (run) =>
              `- **Run \`${run.runId}\`**: method=${run.method}, version=${run.softwareVersion}, dataset=\`${run.datasetFilename}\` (${run.sourceVersion}), vars=[${run.inputVariables.join(', ')}], n=${run.sampleCount}, missingHandling="${run.missingDataHandling}", timestamp=${run.timestamp}`
          )
          .join('\n');

  const s8Lines: string[] = [
    '- Missing and invalid tokens are preserved as `null` (never coerced to `0`).',
    '- Pearson correlation measures linear co-variation only and never establishes physical causality.',
    '- Potential IQR outliers are flagged non-destructively and never auto-deleted.',
  ];
  for (const run of runs) {
    for (const lim of run.limitations) {
      s8Lines.push(`- **${run.runId}:** ${lim}`);
    }
  }
  const s8 = Array.from(new Set(s8Lines)).join('\n');

  const s9 = input.aiInterpretationNote?.trim()
    ? `${input.aiInterpretationNote.trim()}\n\n_(AI interpretation only; computed statistics above remain deterministic.)_`
    : 'No AI interpretation note attached. All calculations above are deterministic mathematical summaries of imported tabular values.';

  return {
    generatedAt,
    title: 'FLAREX 6.0 Type B — Numerical Data Analysis Report',
    sections: [
      { number: 1, heading: '1. Dataset provenance and origin', layer: 'SOURCE_FACT', content: s1 },
      { number: 2, heading: '2. Validation summary', layer: 'METHODOLOGY', content: s2 },
      { number: 3, heading: '3. Variable schema and units', layer: 'SOURCE_FACT', content: s3 },
      { number: 4, heading: '4. Missing data and quality diagnostics', layer: 'METHODOLOGY', content: s4 },
      { number: 5, heading: '5. Statistical calculations', layer: 'DERIVED_STATISTICS', content: s5 },
      { number: 6, heading: '6. Visualization summary', layer: 'DERIVED_STATISTICS', content: s6 },
      { number: 7, heading: '7. Reproducibility parameters', layer: 'METHODOLOGY', content: s7 },
      { number: 8, heading: '8. Limitations and cautions', layer: 'METHODOLOGY', content: s8 },
      { number: 9, heading: '9. AI interpretation (clearly separated)', layer: 'AI_INTERPRETATION', content: s9 },
    ],
  };
}

