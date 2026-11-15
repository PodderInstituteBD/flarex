import { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  GitCompare,
  HardDrive,
  HelpCircle,
  NotebookPen,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppPage } from '../components/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { InvestigationRecord } from '../types/research';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import { exportWorkspaceBundle, ResearchWorkspaceState } from '../utils/workspaceStore';

interface ResearchWorkspaceProps {
  investigations: InvestigationRecord[];
  workspace: ResearchWorkspaceState;
  ingestedDatasets?: IngestedDatasetPackage[];
  analysisHistory?: ReproducibleAnalysisRun[];
  onToggleSaveInvestigation: (id: string) => void;
  onRemoveBookmark: (url: string) => void;
  onSaveNote: (note: {
    id?: string;
    targetType: 'investigation' | 'source' | 'general';
    targetId: string;
    targetTitle: string;
    content: string;
  }) => void;
  onDeleteNote: (noteId: string) => void;
  onCreateCollection: (name: string, description: string, ids: string[]) => void;
  onDeleteCollection: (collectionId: string) => void;
  onLoadComparison: (ids: string[]) => void;
  onDeleteComparison?: (id: string) => void;
  onDeleteQuestion?: (id: string) => void;
  onDeleteBrief?: (id: string) => void;
  onDeleteEvidence?: (evidenceId: string) => void;
  onDeleteReport?: (id: string) => void;
  onImportWorkspace?: (rawJson: string) => { ok: boolean; error?: string };
  onOpenInvestigation: (id: string) => void;
  onNavigate: (page: AppPage) => void;
}

function downloadText(content: string, filename: string, mime: string) {
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

export function ResearchWorkspace({
  investigations,
  workspace,
  ingestedDatasets = [],
  analysisHistory = [],
  onToggleSaveInvestigation,
  onRemoveBookmark,
  onSaveNote,
  onDeleteNote,
  onCreateCollection,
  onDeleteCollection,
  onLoadComparison,
  onDeleteComparison,
  onDeleteQuestion,
  onDeleteBrief,
  onDeleteEvidence,
  onDeleteReport,
  onImportWorkspace,
  onOpenInvestigation,
  onNavigate,
}: ResearchWorkspaceProps) {
  const [noteTargetId, setNoteTargetId] = useState(investigations[0]?.id ?? 'general');
  const [noteContent, setNoteContent] = useState('');
  const [colName, setColName] = useState('');
  const [colDesc, setColDesc] = useState('');
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const qLower = workspaceQuery.trim().toLowerCase();

  const savedRecords = useMemo(
    () =>
      investigations
        .filter((r) => workspace.savedInvestigationIds.includes(r.id))
        .filter(
          (r) =>
            !qLower ||
            r.shortName.toLowerCase().includes(qLower) ||
            r.name.toLowerCase().includes(qLower)
        ),
    [investigations, workspace.savedInvestigationIds, qLower]
  );

  const filteredQuestions = useMemo(
    () =>
      workspace.savedQuestions.filter(
        (q) =>
          !qLower ||
          q.question.toLowerCase().includes(qLower) ||
          q.classificationLabel.toLowerCase().includes(qLower)
      ),
    [workspace.savedQuestions, qLower]
  );

  const filteredBriefs = useMemo(
    () =>
      workspace.savedBriefs.filter(
        (b) =>
          !qLower ||
          b.title.toLowerCase().includes(qLower) ||
          b.question.toLowerCase().includes(qLower) ||
          b.markdown.toLowerCase().includes(qLower)
      ),
    [workspace.savedBriefs, qLower]
  );

  const filteredEvidence = useMemo(
    () =>
      workspace.savedEvidence.filter(
        (ev) =>
          !qLower ||
          ev.investigationShortName.toLowerCase().includes(qLower) ||
          ev.summary.toLowerCase().includes(qLower) ||
          ev.category.toLowerCase().includes(qLower)
      ),
    [workspace.savedEvidence, qLower]
  );

  const filteredReports = useMemo(
    () =>
      workspace.savedReports.filter(
        (rep) =>
          !qLower ||
          rep.title.toLowerCase().includes(qLower) ||
          rep.reportType.toLowerCase().includes(qLower)
      ),
    [workspace.savedReports, qLower]
  );

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = noteContent.trim();
    if (!clean) return;
    const rec = investigations.find((r) => r.id === noteTargetId);
    onSaveNote({
      targetType: rec ? 'investigation' : 'general',
      targetId: rec ? rec.id : 'general',
      targetTitle: rec ? rec.shortName : 'General Research Note',
      content: clean,
    });
    setNoteContent('');
  };

  const handleCreateCol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!colName.trim()) return;
    onCreateCollection(
      colName,
      colDesc,
      workspace.savedInvestigationIds.slice(0, 6)
    );
    setColName('');
    setColDesc('');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportWorkspace) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const res = onImportWorkspace(content);
      setImportStatus({
        ok: res.ok,
        message: res.ok
          ? `Imported workspace backup "${file.name}" successfully.`
          : res.error || 'Failed to import workspace JSON.',
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Research Workspace 2.0"
        title="Saved Studies, Questions, Briefs, Evidence & Reports"
        description="Organize your microgravity combustion research workflow locally in this browser with full JSON backup export and restore."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadText(
                  exportWorkspaceBundle(workspace),
                  `flarex_workspace_${new Date().toISOString().slice(0, 10)}.json`,
                  'application/json;charset=utf-8'
                )
              }
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export JSON Backup</span>
            </Button>
            {onImportWorkspace && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFileChange}
                  aria-label="Import workspace JSON backup file"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Import JSON</span>
                </Button>
              </>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate('export')}
            >
              Open Export Center
            </Button>
          </div>
        }
      />

      {importStatus && (
        <Card
          padding="sm"
          className={`text-xs ${
            importStatus.ok
              ? 'border-[var(--status-success)]/45 bg-[var(--status-success)]/10 text-[var(--status-success)]'
              : 'border-[var(--status-warning)]/45 bg-[var(--status-warning)]/10 text-[var(--status-warning)]'
          }`}
        >
          {importStatus.message}
        </Card>
      )}

      {/* Search & Local Storage Transparency */}
      <Card padding="sm" className="bg-[var(--bg-secondary)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <HardDrive className="w-4 h-4 text-[var(--accent-cyan)] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Local Browser Storage Notice:</strong>{' '}
              Saved investigations, questions, briefs, evidence items, reports, comparisons, notes, and collections persist in <span className="font-mono-tabular">localStorage</span> without server tracking.
            </p>
          </div>
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={workspaceQuery}
              onChange={(e) => setWorkspaceQuery(e.target.value)}
              placeholder="Search workspace items..."
              aria-label="Search workspace items"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Saved Investigations */}
        <Card padding="md" className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BookmarkCheck className="w-4 h-4 text-[var(--accent-blue)] shrink-0" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
                Saved Investigations ({savedRecords.length})
              </h2>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onNavigate('explorer')}>
              Browse Explorer
            </Button>
          </div>

          {savedRecords.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              No saved investigations yet. Click &ldquo;Save to Workspace&rdquo; inside any investigation profile or explorer card.
            </p>
          ) : (
            <ul className="space-y-2">
              {savedRecords.map((rec) => (
                <li
                  key={rec.id}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenInvestigation(rec.id)}
                      className="w-full text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent-blue)] truncate block text-left cursor-pointer"
                    >
                      {rec.shortName} — {rec.name}
                    </button>
                    <p className="text-[11px] text-[var(--text-muted)] break-words">
                      {rec.platform} · {rec.timeframe}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onToggleSaveInvestigation(rec.id)}
                    aria-label={`Remove ${rec.shortName} from workspace`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Bookmarked Sources */}
        <Card padding="md" className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)] min-w-0">
              Bookmarked Publications &amp; NASA Sources ({workspace.bookmarkedSources.length})
            </h2>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onNavigate('sources')}>
              Discovery Engine
            </Button>
          </div>
          {workspace.bookmarkedSources.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Bookmark NTRS reports, PSI datasets, or peer-reviewed DOIs from NASA Discovery &amp; Sources to collect them here.
            </p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {workspace.bookmarkedSources.map((b) => (
                <li
                  key={b.url}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-start justify-between gap-2 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-full text-xs font-semibold text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1"
                    >
                      <span className="truncate">{b.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {b.repository}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onRemoveBookmark(b.url)}
                    aria-label={`Remove bookmark ${b.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Research Notes + Saved Comparisons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card padding="md" className="lg:col-span-7 min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Personal Research Notes ({workspace.notes.length})
            </h2>
          </div>

          <form onSubmit={handleAddNote} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={noteTargetId}
                onChange={(e) => setNoteTargetId(e.target.value)}
                aria-label="Select investigation for note"
                className="w-full sm:w-56 px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
              >
                <option value="general">General Note</option>
                {investigations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.shortName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write a personal note (e.g. check BASS-II low-flow extinction table)..."
                aria-label="Research note content"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
              />
              <Button type="submit" variant="primary" size="sm" className="shrink-0">
                Save Note
              </Button>
            </div>
          </form>

          {workspace.notes.length > 0 && (
            <ul className="space-y-2">
              {workspace.notes.map((n) => (
                <li
                  key={n.id}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-start justify-between gap-2 min-w-0"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{n.targetTitle}</Badge>
                      <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                        {new Date(n.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] break-words">{n.content}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onDeleteNote(n.id)}
                    aria-label="Delete research note"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="lg:col-span-5 min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Saved Comparisons ({workspace.savedComparisons.length})
            </h2>
          </div>

          {workspace.savedComparisons.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Save any active 2–3 study comparison from the Investigation Comparison page to revisit it later.
            </p>
          ) : (
            <ul className="space-y-2">
              {workspace.savedComparisons.map((cmp) => (
                <li
                  key={cmp.id}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {cmp.title}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {cmp.investigationIds.join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onLoadComparison(cmp.investigationIds)}
                    >
                      Open
                    </Button>
                    {onDeleteComparison && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteComparison(cmp.id)}
                        aria-label={`Delete saved comparison ${cmp.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* FLAREX 6.0 Saved Questions & Saved Research Briefs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card padding="md" className="lg:col-span-5 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Saved Research Questions ({filteredQuestions.length})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('gaps')}>
              Question Explorer
            </Button>
          </div>
          {filteredQuestions.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Save research questions from the Research Questions &amp; Gap Intelligence page to track open topics.
            </p>
          ) : (
            <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {filteredQuestions.map((q) => (
                <li
                  key={q.id}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-[var(--text-primary)]">{q.question}</p>
                    <Badge tone="cyan">{q.classificationLabel}</Badge>
                  </div>
                  {onDeleteQuestion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteQuestion(q.id)}
                      aria-label={`Delete question ${q.question}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="lg:col-span-7 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Saved Research Briefs ({filteredBriefs.length})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('assistant')}>
              AI Research Intelligence
            </Button>
          </div>
          {filteredBriefs.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Click &ldquo;Save Brief&rdquo; in AI Research Intelligence or the Research Question Explorer to preserve structured briefs here.
            </p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredBriefs.map((brief) => {
                const open = expandedBriefId === brief.id;
                return (
                  <li
                    key={brief.id}
                    className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {brief.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {brief.sourceCount} linked sources · {new Date(brief.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedBriefId(open ? null : brief.id)}
                        >
                          {open ? 'Collapse' : 'Preview'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            downloadText(
                              brief.markdown,
                              `flarex_brief_${brief.id}.md`,
                              'text/markdown;charset=utf-8'
                            )
                          }
                          aria-label={`Download brief ${brief.title}`}
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        {onDeleteBrief && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteBrief(brief.id)}
                            aria-label={`Delete brief ${brief.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {open && (
                      <pre className="p-2.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] font-mono-tabular text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {brief.markdown}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* FLAREX 6.0 Saved Evidence Items, Saved Reports, & Session Datasets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card padding="md" className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Saved Evidence Items ({filteredEvidence.length})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('evidence')}>
              Evidence Engine
            </Button>
          </div>
          {filteredEvidence.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Save categorized facts, published results, or AI items from the Evidence Engine to build an audit trail.
            </p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {filteredEvidence.map((ev) => (
                <li
                  key={ev.evidenceId}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">{ev.category}</Badge>
                      <button
                        type="button"
                        onClick={() => onOpenInvestigation(ev.investigationId)}
                        className="text-xs font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
                      >
                        {ev.investigationShortName}
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                      {ev.summary}
                    </p>
                  </div>
                  {onDeleteEvidence && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteEvidence(ev.evidenceId)}
                      aria-label={`Remove saved evidence ${ev.evidenceId}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--accent-violet)]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Saved Scientific Reports ({filteredReports.length})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('export')}>
              Export Center
            </Button>
          </div>
          {filteredReports.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Save Type A or Type B scientific reports from the Export Center for quick review and Markdown re-export.
            </p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {filteredReports.map((rep) => {
                const open = expandedReportId === rep.id;
                return (
                  <li
                    key={rep.id}
                    className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {rep.title}
                        </p>
                        <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          {rep.reportType} · {new Date(rep.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedReportId(open ? null : rep.id)}
                        >
                          {open ? 'Hide' : 'View'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            downloadText(
                              rep.markdown,
                              `flarex_report_${rep.id}.md`,
                              'text/markdown;charset=utf-8'
                            )
                          }
                          aria-label={`Download report ${rep.title}`}
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        {onDeleteReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteReport(rep.id)}
                            aria-label={`Delete report ${rep.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {open && (
                      <pre className="p-2.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] font-mono-tabular text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {rep.markdown}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Active Session Imported Datasets & Reproducible Statistical Runs */}
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Session Datasets ({ingestedDatasets.length}) &amp; Analysis Runs ({analysisHistory.length})
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('data')}>
            Open Numerical Workbench
          </Button>
        </div>
        {ingestedDatasets.length === 0 && analysisHistory.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Import a tabular dataset or execute statistical calculations in Scientific Data Explorer to track datasets and reproducibility runs here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Imported Datasets
              </p>
              {ingestedDatasets.map((ds) => (
                <div
                  key={ds.provenance.datasetId}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                >
                  <span className="font-semibold text-[var(--text-primary)] truncate">
                    {ds.provenance.originalFilename}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                    {ds.summary.rowCount}×{ds.summary.columnCount}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Reproducible Analysis Ledger
              </p>
              {analysisHistory.slice(0, 5).map((run) => (
                <div
                  key={run.runId}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                >
                  <span className="font-mono-tabular text-[var(--text-primary)] truncate">
                    {run.calculationMethodLabel} ({run.inputVariables.join(', ')})
                  </span>
                  <Badge tone="neutral">n={run.sampleCount}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Research Collections */}
      <Card padding="md" className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Custom Topic Collections ({workspace.collections.length})
          </h2>
        </div>

        <form onSubmit={handleCreateCol} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            value={colName}
            onChange={(e) => setColName(e.target.value)}
            placeholder="Collection name (e.g. Artemis Solid Flammability)"
            aria-label="Collection name"
            className="sm:col-span-4 px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          />
          <input
            type="text"
            value={colDesc}
            onChange={(e) => setColDesc(e.target.value)}
            placeholder="Short description (links currently saved investigations)"
            aria-label="Collection description"
            className="sm:col-span-6 px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          />
          <Button type="submit" variant="secondary" size="sm" className="sm:col-span-2">
            Create Collection
          </Button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {workspace.collections.map((col) => (
            <div
              key={col.id}
              className="p-3 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {col.name}
                  </h3>
                  {col.description && (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {col.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteCollection(col.id)}
                  aria-label={`Delete collection ${col.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {col.investigationIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenInvestigation(id)}
                    className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:underline cursor-pointer"
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
