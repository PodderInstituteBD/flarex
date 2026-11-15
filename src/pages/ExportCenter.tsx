import { useMemo, useState } from 'react';
import {
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import { buildEvidenceClaims } from '../utils/evidenceEngine';
import {
  ExportReportType,
  generateExportCsv,
  generateExportJson,
  generateExportMarkdown,
} from '../utils/exportCenter';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import {
  buildInvestigationResearchReportV2,
  buildNumericalAnalysisReportV2,
  buildScientificReportPackage,
  renderScientificReportCsv,
  renderScientificReportJson,
  renderScientificReportMarkdown,
} from '../utils/scientificReport';
import { ResearchWorkspaceState, SavedReportEntry } from '../utils/workspaceStore';

interface ExportCenterProps {
  investigations: InvestigationRecord[];
  compareIds: string[];
  workspace: ResearchWorkspaceState;
  initialReportType?: ExportReportType;
  ingestedDatasets?: IngestedDatasetPackage[];
  analysisHistory?: ReproducibleAnalysisRun[];
  onSaveReport?: (report: Omit<SavedReportEntry, 'id' | 'createdAt'>) => void;
  onReportDownloaded?: () => void;
}

const REPORT_OPTIONS: Array<{
  id: ExportReportType;
  label: string;
  description: string;
}> = [
  {
    id: 'investigation_report_v2',
    label: 'Type A: FLAREX 6.0 Investigation Research Report (9 Sections)',
    description:
      'Investigation overview, experimental setup, provenance citations, evidence summary, findings, 12-dimension comparison notes, gaps/limitations, separated AI section, and references.',
  },
  {
    id: 'numerical_analysis_report_v2',
    label: 'Type B: FLAREX 6.0 Numerical Data Analysis Report (9 Sections)',
    description:
      'Dataset provenance, 12-check validation summary, schema & units, missing-data diagnostics, deterministic stats, chart summaries, reproducibility ledger, limitations, and separated AI notes.',
  },
  {
    id: 'scientific_full_report',
    label: 'FLAREX 5.0 Scientific Investigation Report (9 Sections)',
    description:
      'Complete 9-section scientific report integrating investigations, source IDs, imported datasets, reproducible stats, limitations, and references.',
  },
  {
    id: 'investigation_profile',
    label: 'Investigation Profiles (Selected or Full)',
    description: 'Structured metadata, PSI/NTRS/DOI identifiers, findings, and limitations.',
  },
  {
    id: 'comparison_report',
    label: 'Active Comparison Report',
    description: 'Side-by-side comparison matrix including gravity compatibility cautions.',
  },
  {
    id: 'source_list',
    label: 'Source & Citation Registry',
    description: 'All primary NASA PSI, NTRS, DOI, and secondary repository links.',
  },
  {
    id: 'gap_report',
    label: 'Research Gap Intelligence Report',
    description: 'Documented and review-synthesized research gaps with limitations.',
  },
  {
    id: 'evidence_claims',
    label: 'Evidence Traceability Claims',
    description: 'Classified claims across all 7 evidence categories without fake scores.',
  },
  {
    id: 'workspace_summary',
    label: 'Personal Workspace Backup',
    description: 'Saved investigations, bookmarked publications, notes, and collections.',
  },
  {
    id: 'database_records',
    label: 'Complete Curated FLAREX Database (All 16 Records)',
    description: 'Full structured export of the curated FLAREX dataset.',
  },
];

function triggerFileDownload(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportCenter({
  investigations,
  compareIds,
  workspace,
  initialReportType = 'investigation_report_v2',
  ingestedDatasets = [],
  analysisHistory = [],
  onSaveReport,
  onReportDownloaded,
}: ExportCenterProps) {
  const [reportType, setReportType] = useState<ExportReportType>(initialReportType);
  const [previewFormat, setPreviewFormat] = useState<'csv' | 'json' | 'markdown'>(
    'markdown'
  );
  const [aiNote, setAiNote] = useState('');
  const [researchQuestion, setResearchQuestion] = useState(
    'How do fuel geometry, oxygen concentration, and microgravity flow conditions shape flame spread and spacecraft fire safety bounds across reviewed NASA studies?'
  );

  const claims = useMemo(
    () => buildEvidenceClaims(investigations, RESEARCH_GAPS),
    [investigations]
  );

  const selectedInvestigations = useMemo(() => {
    const matched = investigations.filter((r) => compareIds.includes(r.id));
    return matched.length > 0 ? matched : investigations.slice(0, 3);
  }, [investigations, compareIds]);

  const structuredReportPackage = useMemo(() => {
    if (reportType === 'investigation_report_v2') {
      return buildInvestigationResearchReportV2({
        investigations: selectedInvestigations,
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        researchQuestion,
        aiInterpretationNote: aiNote,
      });
    }
    if (reportType === 'numerical_analysis_report_v2') {
      return buildNumericalAnalysisReportV2({
        investigations: selectedInvestigations,
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        researchQuestion,
        aiInterpretationNote: aiNote,
      });
    }
    return buildScientificReportPackage({
      researchQuestion,
      selectedInvestigations,
      ingestedDatasets,
      analysisRuns: analysisHistory,
      gaps: RESEARCH_GAPS,
      aiInterpretationNote: aiNote,
    });
  }, [reportType, researchQuestion, selectedInvestigations, ingestedDatasets, analysisHistory, aiNote]);

  const isNineSectionReport =
    reportType === 'investigation_report_v2' ||
    reportType === 'numerical_analysis_report_v2' ||
    reportType === 'scientific_full_report';

  const bundleInput = useMemo(
    () => ({
      reportType,
      selectedInvestigations,
      allInvestigations: investigations,
      gaps: RESEARCH_GAPS,
      claims,
      workspace,
      aiSummaryNote: aiNote,
    }),
    [reportType, selectedInvestigations, investigations, claims, workspace, aiNote]
  );

  const csvContent = useMemo(
    () =>
      isNineSectionReport
        ? renderScientificReportCsv(structuredReportPackage)
        : generateExportCsv(bundleInput),
    [isNineSectionReport, structuredReportPackage, bundleInput]
  );
  const jsonContent = useMemo(
    () =>
      isNineSectionReport
        ? renderScientificReportJson(structuredReportPackage)
        : generateExportJson(bundleInput),
    [isNineSectionReport, structuredReportPackage, bundleInput]
  );
  const mdContent = useMemo(
    () =>
      isNineSectionReport
        ? renderScientificReportMarkdown(structuredReportPackage)
        : generateExportMarkdown(bundleInput),
    [isNineSectionReport, structuredReportPackage, bundleInput]
  );

  const activePreview =
    previewFormat === 'csv'
      ? csvContent
      : previewFormat === 'json'
      ? jsonContent
      : mdContent;

  const baseFileSlug = `flarex_${reportType}`;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Scientific Export Center"
          title="Export Reproducible Research Packages"
          description="Download verified FLAREX datasets, comparisons, source lists, gap analyses, and workspace notes in CSV, JSON, Markdown, or Print-to-PDF while preserving source provenance."
        />
      </div>

      {/* Provenance Guardrail Banner */}
      <Card padding="sm" className="bg-[var(--bg-secondary)] flex items-start gap-2.5 text-xs">
        <ShieldCheck
          className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Export Provenance Standard:</strong>{' '}
          All exports preserve original NASA PSI / NTRS / DOI citations, flag missing values explicitly without substituting zero, and keep any optional AI interpretation strictly separated from experimental findings.
        </p>
      </Card>

      {/* Configuration Controls */}
      <Card padding="md" className="print:hidden space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 space-y-1.5">
            <label
              htmlFor="export-report-type"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              1. Select Scientific Export Scope
            </label>
            <select
              id="export-report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ExportReportType)}
              className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              {REPORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {REPORT_OPTIONS.find((o) => o.id === reportType)?.description}
            </p>
          </div>

          <div className="lg:col-span-6 space-y-1.5">
            <label
              htmlFor="export-ai-note"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              2. Optional AI Interpretation / Researcher Note (Tagged Separately)
            </label>
            <textarea
              id="export-ai-note"
              rows={2}
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value)}
              placeholder="Paste an AI synthesis or personal interpretation note to append under an explicitly labeled non-experimental section..."
              className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
          </div>

          {(reportType === 'scientific_full_report' || reportType === 'investigation_report_v2') && (
            <div className="lg:col-span-12 space-y-1.5">
              <label
                htmlFor="export-research-question"
                className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                3. Primary Research Question (Section 1 of Scientific Report)
              </label>
              <input
                id="export-research-question"
                type="text"
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                triggerFileDownload(csvContent, `${baseFileSlug}.csv`, 'text/csv;charset=utf-8');
                onReportDownloaded?.();
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download CSV</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                triggerFileDownload(
                  jsonContent,
                  `${baseFileSlug}.json`,
                  'application/json;charset=utf-8'
                );
                onReportDownloaded?.();
              }}
            >
              <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download JSON</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                triggerFileDownload(
                  mdContent,
                  `${baseFileSlug}.md`,
                  'text/markdown;charset=utf-8'
                );
                onReportDownloaded?.();
              }}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Markdown</span>
            </Button>
            {onSaveReport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onSaveReport({
                    title:
                      REPORT_OPTIONS.find((o) => o.id === reportType)?.label ??
                      'FLAREX Scientific Report',
                    reportType,
                    markdown: mdContent,
                  })
                }
              >
                <span>Save Report to Workspace</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print / Save as PDF</span>
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[var(--text-muted)]">Preview:</span>
            {(['markdown', 'csv', 'json'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setPreviewFormat(fmt)}
                className={`px-2.5 py-1 rounded-[6px] border font-medium uppercase text-[11px] cursor-pointer ${
                  previewFormat === fmt
                    ? 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/40 text-[var(--accent-blue)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Printable & Preview Pane */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--accent-blue)] print:hidden" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Export Preview &amp; Printable Scientific Report
            </h2>
          </div>
          <Badge tone="blue">{previewFormat.toUpperCase()}</Badge>
        </div>

        <pre className="p-4 rounded-[8px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-mono-tabular text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto max-h-[540px] print:max-h-none print:border-none print:bg-white print:text-slate-900">
          {activePreview}
        </pre>
      </Card>
    </div>
  );
}
