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
