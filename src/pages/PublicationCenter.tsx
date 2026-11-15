import { useMemo, useState } from 'react';
import {
  BookCheck,
  FileCode,
  FileSpreadsheet,
  FileText,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import type { EvidenceCategory6 } from '../utils/evidenceIntelligence';
import {
  buildPublicationReport,
  PublicationReportType,
  renderPublicationCsv,
  renderPublicationJson,
  renderPublicationMarkdown,
} from '../utils/publicationEngine';
import type { ReproducibilityRecord } from '../utils/reproducibilityEngine';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import type { SavedReportEntry } from '../utils/workspaceStore';

interface PublicationCenterProps {
  investigations: InvestigationRecord[];
  compareIds: string[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
  reproducibilityRecords: ReproducibilityRecord[];
  onSaveReport?: (report: Omit<SavedReportEntry, 'id' | 'createdAt'>) => void;
  onReportDownloaded?: () => void;
}

const REPORT_TYPE_META: Record<
  PublicationReportType,
  { label: string; subtitle: string }
> = {
  TYPE_A_INVESTIGATION: {
    label: 'Type A — Investigation Research Report',
    subtitle: 'Single/multi-study overview, experimental setup, provenance IDs, findings, and open gaps (9 sections).',
  },
  TYPE_B_NUMERICAL: {
    label: 'Type B — Numerical Data Analysis Report',
    subtitle: 'Dataset SHA-256 provenance, validation summary, unit schemas, stats, and reproducibility ledger (9 sections).',
  },
  TYPE_C_COMPARATIVE: {
    label: 'Type C — Cross-Investigation Comparative Report',
    subtitle: '12-dimension compatibility matrix, matched/differing/unknown parameters, and false-equivalence guards (9 sections).',
  },
};

function layerTone(layer: EvidenceCategory6): BadgeTone {
  switch (layer) {
    case 'SOURCE_FACT':
      return 'cyan';
    case 'PUBLISHED_RESULT':
      return 'success';
    case 'RAW_MEASUREMENT':
      return 'blue';
    case 'DERIVED_STATISTIC':
      return 'violet';
    case 'METHODOLOGY':
      return 'neutral';
    case 'AI_INTERPRETATION':
      return 'warning';
    case 'RESEARCH_GAP':
      return 'danger';
  }
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderFormattedInline(line: string) {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, idx) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[var(--text-primary)]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--accent-cyan)] text-[11px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{tok}</span>;
  });
}

function FormattedReportContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-secondary)] p-3.5 rounded-[8px] border border-[var(--border-subtle)]">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" aria-hidden="true" />;
        if (trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-[var(--accent-cyan)] select-none" aria-hidden="true">•</span>
              <span className="flex-1">{renderFormattedInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderFormattedInline(line)}
          </p>
        );
      })}
    </div>
  );
}

export function PublicationCenter({
  investigations,
  compareIds,
  ingestedDatasets,
  analysisHistory,
  reproducibilityRecords,
  onSaveReport,
  onReportDownloaded,
}: PublicationCenterProps) {
  const [reportType, setReportType] = useState<PublicationReportType>('TYPE_C_COMPARATIVE');
  const [researchQuestion, setResearchQuestion] = useState(
    'How do airflow velocity, oxygen concentration, and enclosure geometry compare across microgravity solid-fuel experiments versus spacecraft-scale tests?'
  );
  const [aiNote, setAiNote] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const selectedInvestigations = useMemo(() => {
    const matched = investigations.filter((r) => compareIds.includes(r.id));
    return matched.length >= 2 ? matched : investigations.slice(0, 3);
  }, [investigations, compareIds]);

  const publicationPkg = useMemo(
    () =>
      buildPublicationReport({
        reportType,
        investigations: selectedInvestigations,
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        reproducibilityRecords,
        researchQuestion,
        aiInterpretationNote: aiNote,
      }),
    [
      reportType,
      selectedInvestigations,
      ingestedDatasets,
      analysisHistory,
      reproducibilityRecords,
      researchQuestion,
      aiNote,
    ]
  );

  const mdOutput = useMemo(() => renderPublicationMarkdown(publicationPkg), [publicationPkg]);
  const jsonOutput = useMemo(() => renderPublicationJson(publicationPkg), [publicationPkg]);
  const csvOutput = useMemo(() => renderPublicationCsv(publicationPkg), [publicationPkg]);

  const fileSlug = `flarex7_${reportType.toLowerCase()}`;

  return (
    <div className="space-y-5">
      <Card padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookCheck className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              FLAREX 7.0 Publication-Ready Report Studio (Type A / B / C)
            </h2>
          </div>
          <Badge tone="cyan">9 Structured Sections · 7 Provenance Layers</Badge>
        </div>

        {/* Report Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['TYPE_A_INVESTIGATION', 'TYPE_B_NUMERICAL', 'TYPE_C_COMPARATIVE'] as PublicationReportType[]).map(
            (typeKey) => {
              const active = reportType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setReportType(typeKey)}
                  className={`p-3 rounded-[10px] border text-left transition-colors cursor-pointer space-y-1 ${
                    active
                      ? 'bg-[var(--accent-blue)]/12 border-[var(--accent-blue)]/60'
                      : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {REPORT_TYPE_META[typeKey].label}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {REPORT_TYPE_META[typeKey].subtitle}
                  </p>
                </button>
              );
            }
          )}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
          <div className="lg:col-span-6 space-y-1">
            <label
              htmlFor="pub-research-question"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Research Question / Title Prompt
            </label>
            <input
              id="pub-research-question"
              type="text"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
          </div>
          <div className="lg:col-span-6 space-y-1">
            <label
              htmlFor="pub-ai-note"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Optional AI Interpretation (Strictly Segregated Section 8)
            </label>
            <input
              id="pub-ai-note"
              type="text"
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value)}
              placeholder="Optional hypothesis or synthesis note (badged AI_INTERPRETATION)..."
              className="w-full px-3 py-2 rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
          </div>
        </div>

        {/* Dataset SHA-256 Ledger Strip */}
        <div className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" aria-hidden="true" />
            <span>
              <strong>Active Studies ({selectedInvestigations.length}):</strong>{' '}
              {selectedInvestigations.map((r) => r.shortName).join(', ')}
            </span>
            <span>·</span>
            <span>
              <strong>Attached Checksums ({publicationPkg.datasetChecksums.length}):</strong>{' '}
              {publicationPkg.datasetChecksums.length > 0
                ? publicationPkg.datasetChecksums
                    .map((d) => `${d.filename} (${d.sha256 ? d.sha256.slice(0, 10) : 'n/a'}…)`)
                    .join(', ')
                : 'None in session'}
            </span>
          </div>
        </div>

        {/* Download Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              triggerDownload(mdOutput, `${fileSlug}.md`, 'text/markdown;charset=utf-8');
              onReportDownloaded?.();
            }}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Markdown</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              triggerDownload(jsonOutput, `${fileSlug}.json`, 'application/json;charset=utf-8');
              onReportDownloaded?.();
            }}
          >
            <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              triggerDownload(csvOutput, `${fileSlug}.csv`, 'text/csv;charset=utf-8');
              onReportDownloaded?.();
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print / PDF</span>
          </Button>
          {onSaveReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onSaveReport({
                  title: `${publicationPkg.title} (${selectedInvestigations.map((r) => r.shortName).join(' · ')})`,
                  reportType: publicationPkg.reportType,
                  markdown: mdOutput,
                });
                onReportDownloaded?.();
                setSavedNotice(`Saved "${publicationPkg.title}" to Workspace.`);
              }}
            >
              <span>Save to Workspace</span>
            </Button>
          )}
        </div>
        {savedNotice && <p className="text-xs text-[var(--status-success)]">{savedNotice}</p>}
      </Card>

      {/* Rendered 9 Sections with Epistemic Attribution Badges */}
      <div className="space-y-3">
        {publicationPkg.sections.map((sec) => (
          <Card key={sec.number} padding="sm" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {sec.heading}
              </h3>
              <Badge tone={layerTone(sec.attributionLayer)}>{sec.attributionLayer}</Badge>
            </div>
            <FormattedReportContent content={sec.content} />
          </Card>
        ))}
      </div>
    </div>
  );
}
