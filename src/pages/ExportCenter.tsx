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
import { ResearchWorkspaceState } from '../utils/workspaceStore';

interface ExportCenterProps {
  investigations: InvestigationRecord[];
  compareIds: string[];
  workspace: ResearchWorkspaceState;
  initialReportType?: ExportReportType;
}

const REPORT_OPTIONS: Array<{
  id: ExportReportType;
  label: string;
  description: string;
}> = [
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
  initialReportType = 'comparison_report',
}: ExportCenterProps) {
  const [reportType, setReportType] = useState<ExportReportType>(initialReportType);
  const [previewFormat, setPreviewFormat] = useState<'csv' | 'json' | 'markdown'>(
    'markdown'
  );
  const [aiNote, setAiNote] = useState('');

  const claims = useMemo(
    () => buildEvidenceClaims(investigations, RESEARCH_GAPS),
    [investigations]
  );

  const selectedInvestigations = useMemo(() => {
    const matched = investigations.filter((r) => compareIds.includes(r.id));
    return matched.length > 0 ? matched : investigations.slice(0, 3);
  }, [investigations, compareIds]);

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

  const csvContent = useMemo(() => generateExportCsv(bundleInput), [bundleInput]);
  const jsonContent = useMemo(() => generateExportJson(bundleInput), [bundleInput]);
  const mdContent = useMemo(() => generateExportMarkdown(bundleInput), [bundleInput]);

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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                triggerFileDownload(csvContent, `${baseFileSlug}.csv`, 'text/csv;charset=utf-8')
              }
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download CSV</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                triggerFileDownload(
                  jsonContent,
                  `${baseFileSlug}.json`,
                  'application/json;charset=utf-8'
                )
              }
            >
              <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download JSON</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                triggerFileDownload(
                  mdContent,
                  `${baseFileSlug}.md`,
                  'text/markdown;charset=utf-8'
                )
              }
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Markdown</span>
            </Button>
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
