import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  Search,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States';
import {
  DOSSIER_METADATA,
  DOSSIER_REFERENCES,
  OFFICIAL_RESOURCES,
} from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import {
  buildReferenceLibrary,
  filterReferences,
  ReferenceFilterCategory,
} from '../utils/researchLogic';

interface NtrsResult {
  id: number | null;
  title: string;
  publicationYear: number | null;
  stiType: string;
  center: string | null;
  authors?: string[];
  abstractSnippet?: string | null;
  url: string;
}

interface OsdrResult {
  id: string;
  title: string;
  assayType: string;
  organism: string | null;
  url: string;
}

interface SourcesReferencesProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
}

const REFERENCE_FILTER_TABS: Array<{
  id: ReferenceFilterCategory;
  label: string;
}> = [
  { id: 'ALL', label: 'All References' },
  { id: 'NASA', label: 'NASA Sources' },
  { id: 'PAPER', label: 'Research Papers' },
  { id: 'PRESENTATION', label: 'Presentations' },
  { id: 'REVIEW', label: 'Reviews' },
  { id: 'COMPLEMENTARY', label: 'Complementary Sources' },
];

export function SourcesReferences({
  investigations,
  onOpenInvestigation,
}: SourcesReferencesProps) {
  const [ntrsQuery, setNtrsQuery] = useState('BASS-II microgravity combustion');
  const [ntrsLoading, setNtrsLoading] = useState(false);
  const [ntrsError, setNtrsError] = useState<string | null>(null);
  const [ntrsResults, setNtrsResults] = useState<NtrsResult[] | null>(null);
  const [ntrsCached, setNtrsCached] = useState(false);

  const [osdrLoading, setOsdrLoading] = useState(false);
  const [osdrError, setOsdrError] = useState<string | null>(null);
  const [osdrData, setOsdrData] = useState<{
    total: number;
    results: OsdrResult[];
    cached: boolean;
  } | null>(null);

  const [refCategory, setRefCategory] = useState<ReferenceFilterCategory>('ALL');
  const [refSearch, setRefSearch] = useState('');

  const allReferenceItems = useMemo(
    () => buildReferenceLibrary(investigations),
    [investigations]
  );

  const filteredRefs = useMemo(
    () => filterReferences(allReferenceItems, refCategory, refSearch),
    [allReferenceItems, refCategory, refSearch]
  );

  const handleNtrsSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = ntrsQuery.trim();
    if (q.length < 2 || ntrsLoading) return;

    setNtrsLoading(true);
    setNtrsError(null);

    try {
      const res = await fetch(
        `/api/ntrs/search?q=${encodeURIComponent(q)}`
      );
      const data = (await res.json()) as {
        results?: NtrsResult[];
        cached?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setNtrsError(
          data.message || 'Unable to query NASA NTRS API at this time.'
        );
        setNtrsResults(null);
      } else {
        setNtrsResults(data.results ?? []);
        setNtrsCached(Boolean(data.cached));
      }
    } catch {
      setNtrsError(
        'Network error reaching the backend NTRS lookup proxy. Open https://ntrs.nasa.gov/ directly.'
      );
      setNtrsResults(null);
    } finally {
      setNtrsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Provenance & Bibliography"
        title="Sources & References"
        description="Direct NASA repository portals (PSI, NTRS, OSDR), bundled research attachments, live public NTRS citation lookup, and a filterable reference library across all indexed studies."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={DOSSIER_METADATA.sourceDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:border-[var(--accent-blue)]/50"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Database JSON</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            <a
              href="/assets/aistudio/Project_Research_Dossier__Flame-in-Freefall_Challenge_2026__7dd02da0.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:border-[var(--accent-blue)]/50"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dossier PDF</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        }
      />

      {/* Filterable Unified Reference Library */}
      <section aria-labelledby="reference-library-heading" className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h2
              id="reference-library-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
            >
              Categorized Reference Library
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Showing {filteredRefs.length} of {allReferenceItems.length} source entries and peer-reviewed publications.
            </p>
          </div>
          <div className="w-full md:w-72">
            <label htmlFor="ref-library-search" className="sr-only">
              Filter reference library by title, DOI, author, or ID
            </label>
            <Input
              id="ref-library-search"
              type="search"
              leadingIcon={<Search className="w-4 h-4" />}
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              placeholder="Filter references, DOIs, IDs..."
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter references by source category"
          className="flex flex-wrap items-center gap-1.5"
        >
          {REFERENCE_FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={refCategory === tab.id}
              onClick={() => setRefCategory(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-[8px] border transition-colors cursor-pointer ${
                refCategory === tab.id
                  ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredRefs.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-5 h-5" aria-hidden="true" />}
            title="No matching references found."
            description="Try selecting All References or clearing your search query."
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setRefCategory('ALL');
                  setRefSearch('');
                }}
              >
                Reset Reference Filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredRefs.map((ref) => (
              <Card key={ref.id} as="article" padding="sm" className="flex flex-col justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="blue">{ref.sourceTypeLabel}</Badge>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {ref.publicationDate}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                    {ref.title}
                  </h3>
                  <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                    <p>
                      <span className="text-[var(--text-muted)]">Lead / Author:</span>{' '}
                      {ref.authorsOrLead}
                    </p>
                    <p className="font-mono-tabular">
                      <span className="font-sans text-[var(--text-muted)]">Document ID:</span>{' '}
                      {ref.documentId}
                    </p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenInvestigation(ref.investigationId)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
                  >
                    <span>Study: {ref.investigationShortName}</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>

                  <div className="flex items-center gap-3">
                    {ref.doi && (
                      <a
                        href={`https://doi.org/${ref.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono-tabular text-[var(--accent-cyan)] hover:underline"
                      >
                        <span>DOI</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
                    >
                      <span>Open URL</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Live Cached NTRS Citation Lookup */}
      <Card as="section" aria-labelledby="ntrs-lookup-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="ntrs-lookup-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
            <span>Live Public NASA NTRS Citation Lookup</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Queries the official public NASA Technical Reports Server API (<code>https://ntrs.nasa.gov/api</code>) via a cached backend proxy. PSI itself has no public REST API and is accessed directly via its official portal link below.
          </p>
        </div>

        <form
          onSubmit={handleNtrsSearch}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="ntrs-search-input" className="sr-only">
            Search NASA NTRS public citations
          </label>
          <div className="flex-1">
            <Input
              id="ntrs-search-input"
              type="text"
              leadingIcon={<Search className="w-4 h-4" />}
              value={ntrsQuery}
              onChange={(e) => setNtrsQuery(e.target.value)}
              placeholder="Search NTRS (e.g. SAFFIRE, BASS-II, SPICE)..."
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={ntrsLoading || ntrsQuery.trim().length < 2}
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            <span>Search NTRS</span>
          </Button>
        </form>

        {ntrsLoading && <LoadingSkeleton rows={3} />}

        {ntrsError && (
          <ErrorState title="NTRS Lookup Unavailable" message={ntrsError} />
        )}

        {ntrsResults && !ntrsLoading && (
          <div className="space-y-2.5">
            <p className="text-xs text-[var(--text-secondary)]">
              Returned {ntrsResults.length} NTRS citation(s)
              {ntrsCached ? ' (served from 15-min server cache)' : ''}:
            </p>
            {ntrsResults.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No matching public NTRS records found for that query.
              </p>
            ) : (
              <ul className="space-y-2">
                {ntrsResults.map((item, idx) => (
                  <li
                    key={`${item.id ?? idx}`}
                    className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {item.title}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {item.stiType}
                        {item.publicationYear ? ` · ${item.publicationYear}` : ''}
                        {item.center ? ` · ${item.center}` : ''}
                        {item.id ? ` · NTRS ID ${item.id}` : ''}
                      </p>
                      {item.authors && item.authors.length > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Authors: {item.authors.join(', ')}
                        </p>
                      )}
                      {item.abstractSnippet && (
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {item.abstractSnippet}
                        </p>
                      )}
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] hover:underline shrink-0"
                    >
                      <span>View Citation</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Empirical NASA OSDR Scope Verification */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                NASA OSDR Scope Check (Space Biology vs. Physical Sciences)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Query <code>https://osdr.nasa.gov/osdr/data/search?term=combustion</code> live to confirm OSDR indexes biological/omics studies rather than PSI microgravity combustion hardware logs.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={osdrLoading}
              onClick={async () => {
                setOsdrLoading(true);
                setOsdrError(null);
                try {
                  const res = await fetch('/api/osdr/search?q=combustion');
                  const data = (await res.json()) as {
                    total?: number;
                    results?: OsdrResult[];
                    cached?: boolean;
                    message?: string;
                  };
                  if (!res.ok) {
                    setOsdrError(data.message || 'OSDR search failed.');
                  } else {
                    setOsdrData({
                      total: data.total ?? 0,
                      results: data.results ?? [],
                      cached: Boolean(data.cached),
                    });
                  }
                } catch {
                  setOsdrError('Network error querying OSDR API.');
                } finally {
                  setOsdrLoading(false);
                }
              }}
            >
              Verify OSDR Scope
            </Button>
          </div>
          {osdrError && <ErrorState title="OSDR Lookup Unavailable" message={osdrError} />}
          {osdrData && (
            <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2 text-xs">
              <p className="text-[var(--text-secondary)]">
                OSDR returned <strong className="text-[var(--text-primary)]">{osdrData.total}</strong> hits for &ldquo;combustion&rdquo; (predominantly omics/biological studies{osdrData.cached ? ', served from cache' : ''}):
              </p>
              <ul className="space-y-1">
                {osdrData.results.map((hit) => (
                  <li key={hit.id} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-primary)] truncate">
                      {hit.id} — {hit.title} ({hit.assayType})
                    </span>
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-blue)] hover:underline shrink-0 inline-flex items-center gap-1"
                    >
                      <span>OSDR</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Official Portals */}
      <section aria-labelledby="portals-heading" className="space-y-4">
        <h2
          id="portals-heading"
          className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
        >
          Primary Repositories &amp; Bundled Source Assets
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {OFFICIAL_RESOURCES.map((res) => (
            <Card key={res.id} as="article" className="flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="neutral">{res.accessType}</Badge>
                  {(res.id === 'nasa-ntrs' || res.id === 'nasa-osdr') && (
                    <Badge tone="success">API Verified 2026-11-13</Badge>
                  )}
                </div>
                <h3 className="font-display text-[16px] font-semibold text-[var(--text-primary)]">
                  {res.name}
                </h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {res.role}
                </p>
                <p className="text-xs text-[var(--status-warning)] leading-relaxed">
                  {res.distinctionNote}
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-blue)] hover:underline"
                >
                  <span>Open {res.shortName}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
                {res.apiUrl && (
                  <a
                    href={res.apiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
                  >
                    <span>NTRS Public API</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Dossier Reference Summary Matrix */}
      <section aria-labelledby="dossier-refs-heading" className="space-y-4">
        <h2
          id="dossier-refs-heading"
          className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
        >
          Dossier Core Bibliography ({DOSSIER_REFERENCES.length} Citations)
        </h2>

        <Card padding="none" className="divide-y divide-[var(--border-subtle)] overflow-hidden">
          {DOSSIER_REFERENCES.map((ref) => (
            <div
              key={ref.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-0.5">
                <p className="text-sm text-[var(--text-primary)]">{ref.citation}</p>
                <p className="text-xs text-[var(--text-muted)]">{ref.sourceCategory}</p>
              </div>
              {ref.relatedInvestigationId && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenInvestigation(ref.relatedInvestigationId as string)
                  }
                  className="text-xs font-semibold text-[var(--accent-blue)] hover:underline shrink-0 text-left cursor-pointer"
                >
                  Open Profile
                </button>
              )}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
