import { useState } from 'react';
import {
  BookmarkCheck,
  ExternalLink,
  FolderPlus,
  GitCompare,
  HardDrive,
  NotebookPen,
  Trash2,
} from 'lucide-react';
import { AppPage } from '../components/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { InvestigationRecord } from '../types/research';
import { ResearchWorkspaceState } from '../utils/workspaceStore';

interface ResearchWorkspaceProps {
  investigations: InvestigationRecord[];
  workspace: ResearchWorkspaceState;
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
  onOpenInvestigation: (id: string) => void;
  onNavigate: (page: AppPage) => void;
}

export function ResearchWorkspace({
  investigations,
  workspace,
  onToggleSaveInvestigation,
  onRemoveBookmark,
  onSaveNote,
  onDeleteNote,
  onCreateCollection,
  onDeleteCollection,
  onLoadComparison,
  onOpenInvestigation,
  onNavigate,
}: ResearchWorkspaceProps) {
  const [noteTargetId, setNoteTargetId] = useState(investigations[0]?.id ?? 'general');
  const [noteContent, setNoteContent] = useState('');
  const [colName, setColName] = useState('');
  const [colDesc, setColDesc] = useState('');

  const savedRecords = investigations.filter((r) =>
    workspace.savedInvestigationIds.includes(r.id)
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personal Research Workspace"
        title="Saved Studies, Bookmarks, Notes & Collections"
        description="Organize your microgravity combustion research workflow without creating an account."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('export')}
          >
            Export Workspace Summary
          </Button>
        }
      />

      {/* Explicit Local Storage Transparency Banner */}
      <Card padding="sm" className="bg-[var(--bg-secondary)] flex items-start gap-2.5 text-xs">
        <HardDrive className="w-4 h-4 text-[var(--accent-cyan)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Local Browser Storage Notice:</strong>{' '}
          Your saved investigations, source bookmarks, comparisons, notes, and collections are stored locally in this browser (<span className="font-mono-tabular">localStorage</span>) with zero account or server tracking. Use the Export Center to download a portable JSON or Markdown backup.
        </p>
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
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {cmp.title}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {cmp.investigationIds.join(' · ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onLoadComparison(cmp.investigationIds)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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
