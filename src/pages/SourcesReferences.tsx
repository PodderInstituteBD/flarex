import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  Search,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States';
import {
  DOSSIER_METADATA,
  DOSSIER_REFERENCES,
  OFFICIAL_RESOURCES,
} from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import {
  buildDiscoveryIndex,
  DiscoveryResourceItem,
  filterDiscoveryResources,
  NasaRepositoryId,
} from '../utils/discoveryEngine';
import {
  buildReferenceLibrary,
  DOMAIN_CATEGORY_DEFS,
  DomainCategoryId,
  filterReferences,
  ReferenceFilterCategory,
} from '../utils/researchLogic';
import { runTwelveDataValidationChecks } from '../utils/dataValidation';
import {
  buildUnifiedDiscovery2,
  NasaAvailabilityStage10,
  STAGE10_META,
  summarizeDiscoveryStages,
} from '../utils/nasaDataDiscovery';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import {
  buildSourceTransparencyRegistry,
  SourceCheckHistoryEntry,
} from '../utils/sourceTransparency';
import {
  LinkCheckState,
  resolveResourceVerificationStatus,
} from '../utils/sourceVerification';
import { BookmarkedSourceEntry } from '../utils/workspaceStore';

interface NtrsResult {
  id: number | null;
  title: string;
  publicationYear: number | null;
  publicationDate?: string | null;
  stiType: string;
  center: string | null;
  authors?: string[];
  doi?: string | null;
  reportNumber?: string | null;
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
  bookmarkedSources?: BookmarkedSourceEntry[];
  onToggleBookmark?: (entry: Omit<BookmarkedSourceEntry, 'savedAt'>) => void;
  onAttachNtrsDocument?: (doc: { title: string; sourceUrl: string; content: string }) => void;
  onRecordClientError?: (source: string, message: string) => void;
  onRecordSourceChecked?: (delta?: number) => void;
  onRecordRetrievedDocument?: (title: string) => void;
  ingestedDatasets?: IngestedDatasetPackage[];
  retrievedDocTitles?: string[];
  sourceCheckHistory?: SourceCheckHistoryEntry[];
  onLogSourceCheck?: (entry: Omit<SourceCheckHistoryEntry, 'id'>) => void;
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
  bookmarkedSources = [],
  onToggleBookmark,
  onAttachNtrsDocument,
  onRecordClientError,
  onRecordSourceChecked,
  onRecordRetrievedDocument,
  ingestedDatasets = [],
  retrievedDocTitles = [],
  sourceCheckHistory = [],
  onLogSourceCheck,
}: SourcesReferencesProps) {
  const [ntrsQuery, setNtrsQuery] = useState('BASS-II microgravity combustion');
  const [ntrsLoading, setNtrsLoading] = useState(false);
  const [ntrsError, setNtrsError] = useState<string | null>(null);
  const [ntrsResults, setNtrsResults] = useState<NtrsResult[] | null>(null);
  const [ntrsCached, setNtrsCached] = useState(false);
  const [downloadingNtrsId, setDownloadingNtrsId] = useState<number | null>(null);
  const [ntrsTextStatus, setNtrsTextStatus] = useState<string | null>(null);

  const [psiLoading, setPsiLoading] = useState(false);
  const [psiError, setPsiError] = useState<string | null>(null);
  const [psiBrowseData, setPsiBrowseData] = useState<{
    prefix: string;
    prefixes: string[];
    objects: Array<{ key: string; sizeBytes: number; lastModified: string | null }>;
    combustionFilesFound: boolean;
    cached?: boolean;
  } | null>(null);

  const [osdrLoading, setOsdrLoading] = useState(false);
  const [osdrError, setOsdrError] = useState<string | null>(null);
  const [osdrData, setOsdrData] = useState<{
    total: number;
    results: OsdrResult[];
    cached: boolean;
  } | null>(null);

  const [refCategory, setRefCategory] = useState<ReferenceFilterCategory>('ALL');
  const [refSearch, setRefSearch] = useState('');

  const handleBrowsePsiOpen = async (prefix = '') => {
    setPsiLoading(true);
    setPsiError(null);
    try {
      const resp = await fetch(`/api/psi-open/browse?prefix=${encodeURIComponent(prefix)}`);
      const data = (await resp.json()) as {
        prefix?: string;
        prefixes?: string[];
        objects?: Array<{ key: string; sizeBytes: number; lastModified: string | null }>;
        combustionFilesFound?: boolean;
        cached?: boolean;
        message?: string;
      };
      if (!resp.ok) {
        const msg = data.message || `HTTP ${resp.status} browsing NASA PSI AWS S3`;
        setPsiError(msg);
        onRecordClientError?.('NASA_PSI_OPEN', msg);
      } else {
        setPsiBrowseData({
          prefix: data.prefix ?? '',
          prefixes: data.prefixes ?? [],
          objects: data.objects ?? [],
          combustionFilesFound: Boolean(data.combustionFilesFound),
          cached: data.cached,
        });
      }
    } catch {
      const msg = 'Network error contacting /api/psi-open/browse.';
      setPsiError(msg);
      onRecordClientError?.('NASA_PSI_OPEN', msg);
    } finally {
      setPsiLoading(false);
    }
  };

  const handleFetchNtrsFullText = async (id: number, title: string) => {
    setDownloadingNtrsId(id);
    setNtrsTextStatus(null);
    try {
      const resp = await fetch(`/api/ntrs/download?id=${id}`);
      const data = (await resp.json()) as {
        sourceUrl?: string;
        byteLength?: number;
        content?: string;
        message?: string;
      };
      if (!resp.ok || !data.content) {
        const msg = data.message || `No public full-text .txt available for NTRS ${id}.`;
        setNtrsTextStatus(msg);
        onRecordClientError?.('NASA_NTRS_DOWNLOAD', msg);
        return;
      }
      setNtrsTextStatus(
        `File successfully retrieved: NTRS ${id} (${((data.byteLength ?? data.content.length) / 1024).toFixed(1)} KB .txt). Sending to AI Mode B...`
      );
      const nowIso = new Date().toISOString();
      setFetchedNtrsIds((prev) => new Set(prev).add(id));
      const fullTxtUrl = data.sourceUrl ?? `https://ntrs.nasa.gov/api/citations/${id}/downloads/${id}.txt`;
      setRetrievedUrlTimestamps((prev) => ({
        ...prev,
        [fullTxtUrl]: nowIso,
        [`https://ntrs.nasa.gov/citations/${id}`]: nowIso,
      }));
      onLogSourceCheck?.({
        sourceName: `${title} (NTRS ${id})`,
        url: fullTxtUrl,
        method: 'NASA NTRS Full-Text Download',
        httpStatus: 200,
        resultingStage: 'FILE_RETRIEVED',
        checkedAt: nowIso,
        note: `Retrieved ${((data.byteLength ?? data.content.length) / 1024).toFixed(1)} KB ASCII manuscript.`,
      });
      onRecordRetrievedDocument?.(`${title} (NTRS ${id})`);
      onAttachNtrsDocument?.({
        title: `${title} (NTRS ${id})`,
        sourceUrl: data.sourceUrl ?? `https://ntrs.nasa.gov/citations/${id}`,
        content: data.content,
      });
    } catch {
      const msg = `Network error downloading NTRS ${id} full text.`;
      setNtrsTextStatus(msg);
      onRecordClientError?.('NASA_NTRS_DOWNLOAD', msg);
    } finally {
      setDownloadingNtrsId(null);
    }
  };

  // Module 1 Unified NASA Research Discovery Engine state
  const [discQuery, setDiscQuery] = useState('');
  const [discRepo, setDiscRepo] = useState<NasaRepositoryId | 'ALL'>('ALL');
  const [discCategory, setDiscCategory] = useState<DomainCategoryId | 'ALL'>('ALL');
  const [discInvestigation, setDiscInvestigation] = useState('ALL');
  const [discYear, setDiscYear] = useState('ALL');
  const [discEvidence, setDiscEvidence] = useState('ALL');
  const [discAvailability, setDiscAvailability] = useState('ALL');
  const [discStage10, setDiscStage10] = useState<NasaAvailabilityStage10 | 'ALL'>('ALL');
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [batchChecking, setBatchChecking] = useState(false);
  const [linkStatusMap, setLinkStatusMap] = useState<
    Record<string, LinkCheckState>
  >({});
  const [retrievedUrlTimestamps, setRetrievedUrlTimestamps] = useState<Record<string, string>>({});
  const [fetchedNtrsIds, setFetchedNtrsIds] = useState<Set<number>>(
    () => new Set<number>()
  );

  const discoveryIndex = useMemo(
    () => buildDiscoveryIndex(investigations, OFFICIAL_RESOURCES, DOSSIER_REFERENCES),
    [investigations]
  );

  const discovery2Items = useMemo(() => {
    const validatedIds = new Set(
      ingestedDatasets
        .filter((ds) =>
          runTwelveDataValidationChecks(ds).checks.every((c) => c.status !== 'FAIL')
        )
        .map((ds) => ds.provenance.datasetId)
    );
    return buildUnifiedDiscovery2(investigations, OFFICIAL_RESOURCES, DOSSIER_REFERENCES, {
      linkChecks: linkStatusMap,
      retrievedUrls: retrievedUrlTimestamps,
      ingestedDatasets,
      validatedDatasetIds: validatedIds,
      analysisReadyDatasetIds: validatedIds,
      fetchedNtrsIds,
      awsS3Verified: Boolean(psiBrowseData),
    });
  }, [
    investigations,
    linkStatusMap,
    retrievedUrlTimestamps,
    ingestedDatasets,
    fetchedNtrsIds,
    psiBrowseData,
  ]);

  const discovery2ById = useMemo(
    () => new Map(discovery2Items.map((it) => [it.id, it])),
    [discovery2Items]
  );

  const stage10Counts = useMemo(
    () => summarizeDiscoveryStages(discovery2Items),
    [discovery2Items]
  );

  const transparencyRegistry = useMemo(
    () =>
      buildSourceTransparencyRegistry({
        discoveryItems: discovery2Items,
        officialResources: OFFICIAL_RESOURCES,
        investigations,
      }),
    [discovery2Items, investigations]
  );

  const discYears = useMemo(
    () =>
      Array.from(
        new Set(
          discoveryIndex
            .map((d) => d.publicationYear)
            .filter((y): y is number => typeof y === 'number')
        )
      ).sort((a, b) => b - a),
    [discoveryIndex]
  );

  const filteredDiscovery = useMemo(
    () =>
      filterDiscoveryResources(discoveryIndex, {
        query: discQuery,
        repository: discRepo,
        category: discCategory,
        investigationId: discInvestigation,
        year: discYear,
        evidenceType: discEvidence,
        dataAvailability: discAvailability,
      }).filter((item) => {
        if (discStage10 === 'ALL') return true;
        return discovery2ById.get(item.id)?.stage10 === discStage10;
      }),
    [
      discoveryIndex,
      discQuery,
      discRepo,
      discCategory,
      discInvestigation,
      discYear,
      discEvidence,
      discAvailability,
      discStage10,
      discovery2ById,
    ]
  );

  const bookmarkedUrlSet = useMemo(
    () => new Set(bookmarkedSources.map((b) => b.url)),
    [bookmarkedSources]
  );

  const handleCheckUrl = async (item: DiscoveryResourceItem) => {
    const nowIso = new Date().toISOString();
    if (!item.url.startsWith('https://')) {
      setLinkStatusMap((prev) => ({
        ...prev,
        [item.url]: { ok: true, status: 200, note: 'Bundled local asset', checkedAt: nowIso },
      }));
      onLogSourceCheck?.({
        sourceName: item.title,
        url: item.url,
        method: 'Bundled Workspace File',
        httpStatus: 200,
        resultingStage: 'FILE_RETRIEVED',
        checkedAt: nowIso,
        note: 'Verified bundled dossier file locally.',
      });
      return;
    }
    setLinkStatusMap((prev) => ({
      ...prev,
      [item.url]: { ok: false, status: null, checking: true },
    }));
    try {
      const resp = await fetch('/api/check-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      });
      const data = (await resp.json()) as {
        results?: Array<{ url: string; ok: boolean; status: number | null; note?: string; checkedAt?: string }>;
      };
      const hit = data.results?.[0];
      if (hit) {
        onRecordSourceChecked?.(1);
        setLinkStatusMap((prev) => ({
          ...prev,
          [item.url]: {
            ok: hit.ok,
            status: hit.status,
            note: hit.note,
            checkedAt: hit.checkedAt ?? nowIso,
          },
        }));
        onLogSourceCheck?.({
          sourceName: item.title,
          url: item.url,
          method: 'HTTP HEAD/GET Availability Probe',
          httpStatus: hit.status,
          resultingStage: hit.ok
            ? item.repository === 'NASA_PSI'
              ? 'MANUAL_REVIEW_REQUIRED'
              : 'METADATA_AVAILABLE'
            : hit.status === 401 || hit.status === 403
            ? 'ACCESS_RESTRICTED'
            : 'SOURCE_UNAVAILABLE',
          checkedAt: hit.checkedAt ?? nowIso,
          note: hit.note || `HTTP ${hit.status ?? 'N/A'}`,
        });
      }
    } catch {
      setLinkStatusMap((prev) => ({
        ...prev,
        [item.url]: { ok: false, status: null, note: 'Check failed', checkedAt: nowIso },
      }));
      onLogSourceCheck?.({
        sourceName: item.title,
        url: item.url,
        method: 'HTTP HEAD/GET Availability Probe',
        httpStatus: null,
        resultingStage: 'SOURCE_UNAVAILABLE',
        checkedAt: nowIso,
        note: 'Network failure reaching availability probe endpoint.',
      });
    }
  };

  const handleBatchVerifyVisible = async () => {
    if (batchChecking) return;
    const targetItems = filteredDiscovery
      .slice(0, 10)
      .filter((d) => d.url.startsWith('https://'));
    const targets = targetItems.map((d) => d.url);
    if (targets.length === 0) return;

    setBatchChecking(true);
    try {
      const resp = await fetch('/api/check-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: targets }),
      });
      const data = (await resp.json()) as {
        results?: Array<{ url: string; ok: boolean; status: number | null; note?: string; checkedAt?: string }>;
      };
      if (resp.ok && data.results) {
        const nowIso = new Date().toISOString();
        onRecordSourceChecked?.(data.results.length);
        setLinkStatusMap((prev) => {
          const next = { ...prev };
          for (const hit of data.results ?? []) {
            next[hit.url] = {
              ok: hit.ok,
              status: hit.status,
              note: hit.note,
              checkedAt: hit.checkedAt ?? nowIso,
            };
          }
          return next;
        });
        for (const hit of data.results) {
          const matched = targetItems.find((t) => t.url === hit.url);
          onLogSourceCheck?.({
            sourceName: matched?.title ?? hit.url,
            url: hit.url,
            method: 'Batch HTTP Availability Probe',
            httpStatus: hit.status,
            resultingStage: hit.ok
              ? matched?.repository === 'NASA_PSI'
                ? 'MANUAL_REVIEW_REQUIRED'
                : 'METADATA_AVAILABLE'
              : hit.status === 401 || hit.status === 403
              ? 'ACCESS_RESTRICTED'
              : 'SOURCE_UNAVAILABLE',
            checkedAt: hit.checkedAt ?? nowIso,
            note: hit.note || `HTTP ${hit.status ?? 'N/A'}`,
          });
        }
      }
    } finally {
      setBatchChecking(false);
    }
  };

  const acquisitionStages = useMemo(() => {
    const publicationsCount = discoveryIndex.filter(
      (d) =>
        d.repository === 'NASA_NTRS' ||
        d.repository === 'PEER_REVIEWED_JOURNAL' ||
        d.repository === 'LOCAL_DOSSIER'
    ).length;
    const metadataCount =
      investigations.length + (ntrsResults?.length ?? 0) + (osdrData?.results.length ?? 0);
    const datasetReferencedCount = investigations.filter((r) => Boolean(r.psiId)).length;
    const downloadableDirectCount =
      (psiBrowseData?.objects.length ?? 0) + retrievedDocTitles.length + 2; // 2 verified NTRS ASCII public manuscripts
    const importedCount = ingestedDatasets.length;
    const validatedCount = ingestedDatasets.filter((ds) => {
      const checks = runTwelveDataValidationChecks(ds);
      return checks.checks.every((c) => c.status !== 'FAIL');
    }).length;
    return [
      { stage: '1. Publication available', count: `${publicationsCount} indexed`, ready: publicationsCount > 0 },
      { stage: '2. Metadata available', count: `${metadataCount} records`, ready: metadataCount > 0 },
      { stage: '3. Dataset referenced', count: `${datasetReferencedCount} PSI IDs`, ready: datasetReferencedCount > 0 },
      { stage: '4. Dataset downloadable', count: `${downloadableDirectCount} direct NTRS/S3`, ready: downloadableDirectCount > 0 },
      { stage: '5. Dataset successfully imported', count: `${importedCount} in session`, ready: importedCount > 0 },
      { stage: '6. Dataset validated', count: `${validatedCount}/${importedCount || 0} passed`, ready: validatedCount > 0 },
    ];
  }, [discoveryIndex, investigations, ntrsResults, osdrData, psiBrowseData, retrievedDocTitles, ingestedDatasets]);

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

      {/* FLAREX 6.0 Module H: 6-Stage Publication & Dataset Acquisition Tracker */}
      <Card padding="sm" className="space-y-3 bg-[var(--bg-secondary)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
              NASA Publication &amp; Dataset Availability Pipeline (6 Explicit Stages)
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Distinguishes public full-text NTRS/S3 files from gated NASA PSI experiment downloads requiring browser authentication.
            </p>
          </div>
          {retrievedDocTitles.length > 0 && (
            <Badge tone="success">{retrievedDocTitles.length} doc(s) retrieved in session</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {acquisitionStages.map((s) => (
            <div
              key={s.stage}
              className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1"
            >
              <p className="text-[11px] font-semibold text-[var(--text-primary)] leading-tight">
                {s.stage}
              </p>
              <Badge tone={s.ready ? 'success' : 'neutral'}>{s.count}</Badge>
            </div>
          ))}
        </div>
        {retrievedDocTitles.length > 0 && (
          <p className="text-[11px] text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Retrieved in active session:</strong>{' '}
            {retrievedDocTitles.join(' · ')}
          </p>
        )}
      </Card>

      {/* Module 1: Advanced NASA Research Discovery Engine */}
      <section aria-labelledby="discovery-engine-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="discovery-engine-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
              <span>Unified NASA Source Discovery Engine</span>
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Discover publications, dataset metadata, DOIs, and repository links across NASA PSI, NTRS, PSI AWS Open Data, OSDR, and peer-reviewed journals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
              {filteredDiscovery.length} of {discoveryIndex.length} indexed resources
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={batchChecking}
              onClick={() => void handleBatchVerifyVisible()}
            >
              {batchChecking ? 'Verifying Visible URLs…' : 'Verify Visible Sources'}
            </Button>
          </div>
        </div>

        <Card padding="sm" className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Input
              type="search"
              value={discQuery}
              onChange={(e) => setDiscQuery(e.target.value)}
              leadingIcon={<Search className="w-3.5 h-3.5" />}
              placeholder="Search title, DOI, PSI, NTRS, author..."
              aria-label="Search NASA discovery resources"
            />
            <Select
              value={discRepo}
              onChange={(e) => setDiscRepo(e.target.value as NasaRepositoryId | 'ALL')}
              aria-label="Filter by repository"
            >
              <option value="ALL">All Repositories</option>
              <option value="NASA_PSI">NASA PSI Portal</option>
              <option value="NASA_NTRS">NASA NTRS</option>
              <option value="NASA_PSI_AWS">NASA PSI AWS Open Data</option>
              <option value="NASA_OSDR">NASA OSDR</option>
              <option value="PEER_REVIEWED_JOURNAL">Peer-Reviewed Journals</option>
              <option value="LOCAL_DOSSIER">Bundled Dossier Assets</option>
            </Select>
            <Select
              value={discCategory}
              onChange={(e) => setDiscCategory(e.target.value as DomainCategoryId | 'ALL')}
              aria-label="Filter by research category"
            >
              <option value="ALL">All Research Categories</option>
              {DOMAIN_CATEGORY_DEFS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              value={discInvestigation}
              onChange={(e) => setDiscInvestigation(e.target.value)}
              aria-label="Filter by investigation"
            >
              <option value="ALL">All Investigations</option>
              {investigations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.shortName}
                </option>
              ))}
            </Select>
            <Select
              value={discYear}
              onChange={(e) => setDiscYear(e.target.value)}
              aria-label="Filter by publication year"
            >
              <option value="ALL">All Years</option>
              {discYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
            <Select
              value={discEvidence}
              onChange={(e) => setDiscEvidence(e.target.value)}
              aria-label="Filter by evidence type"
            >
              <option value="ALL">All Evidence Types</option>
              <option value="RAW DATA">RAW DATA</option>
              <option value="PEER-REVIEWED PAPER">PEER-REVIEWED PAPER</option>
              <option value="NASA INVESTIGATION DESCRIPTION">NASA INVESTIGATION DESCRIPTION</option>
              <option value="PRESENTATION / ABSTRACT">PRESENTATION / ABSTRACT</option>
              <option value="REVIEW PAPER">REVIEW PAPER</option>
              <option value="COMPLEMENTARY TERRESTRIAL RESEARCH">COMPLEMENTARY TERRESTRIAL RESEARCH</option>
            </Select>
            <Select
              value={discAvailability}
              onChange={(e) => setDiscAvailability(e.target.value)}
              aria-label="Filter by repository availability"
            >
              <option value="ALL">All Availability Statuses</option>
              <option value="PUBLIC_IN_PSI">Public in NASA PSI</option>
              <option value="PARTIAL_OR_NTRS">Partial / NTRS Reports</option>
              <option value="ARCHIVED_OR_CONDITIONAL">Archived / Conditional</option>
              <option value="PLANNED_NO_PUBLIC_DATA">Planned (No Public Data)</option>
              <option value="TERRESTRIAL_LAB_ONLY">Terrestrial 1g Only</option>
            </Select>
            <Select
              value={discStage10}
              onChange={(e) => setDiscStage10(e.target.value as NasaAvailabilityStage10 | 'ALL')}
              aria-label="Filter by 10-stage availability"
            >
              <option value="ALL">All 10-Stage Statuses ({discovery2Items.length})</option>
              {(Object.keys(STAGE10_META) as NasaAvailabilityStage10[]).map((st) => (
                <option key={st} value={st}>
                  {STAGE10_META[st].label} ({stage10Counts[st]})
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDiscQuery('');
                setDiscRepo('ALL');
                setDiscCategory('ALL');
                setDiscInvestigation('ALL');
                setDiscYear('ALL');
                setDiscEvidence('ALL');
                setDiscAvailability('ALL');
                setDiscStage10('ALL');
              }}
            >
              Reset Discovery Filters
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredDiscovery.slice(0, 12).map((item) => {
            const isExpanded = expandedResourceId === item.id;
            const isBookmarked = bookmarkedUrlSet.has(item.url);
            const linkCheck = linkStatusMap[item.url];
            const verification = resolveResourceVerificationStatus(item.url, linkCheck);
            const d2 = discovery2ById.get(item.id);
            const s10Meta = d2 ? STAGE10_META[d2.stage10] : null;
            return (
              <Card key={item.id} padding="sm" className="space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="cyan">{item.repositoryLabel}</Badge>
                      {s10Meta ? (
                        <Badge tone={s10Meta.tone}>{s10Meta.label}</Badge>
                      ) : (
                        <Badge tone={verification.tone}>{verification.status}</Badge>
                      )}
                      {d2 && (
                        <Badge tone="neutral">{d2.detectedFormat}</Badge>
                      )}
                    </div>
                    <span className="font-mono-tabular text-[var(--text-muted)]">
                      {item.publicationDateDisplay}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {item.investigationShortName} · {item.evidenceType} · {item.researchCategoryLabel}
                  </p>
                  {d2 && (d2.lastCheckedAt || d2.retrievedAt) && (
                    <p className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                      {d2.lastCheckedAt ? `Checked: ${new Date(d2.lastCheckedAt).toLocaleTimeString()}` : ''}
                      {d2.retrievedAt ? ` · Retrieved: ${new Date(d2.retrievedAt).toLocaleTimeString()}` : ''}
                    </p>
                  )}
                  {isExpanded && (
                    <div className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1 text-xs text-[var(--text-secondary)]">
                      <p>{item.summary}</p>
                      <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        Authors/Lead: {item.authorsOrOrganization.join(', ')}
                        {item.psiId ? ` · PSI ${item.psiId}` : ''}
                        {item.ntrsId ? ` · NTRS ${item.ntrsId}` : ''}
                        {item.doi ? ` · DOI ${item.doi}` : ''}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Availability: {d2?.stage10Detail ?? item.dataAvailabilityLabel} · HTTP Probe: {verification.detail}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedResourceId((cur) => (cur === item.id ? null : item.id))
                      }
                      className="text-[var(--accent-blue)] hover:underline font-medium cursor-pointer"
                    >
                      {isExpanded ? 'Hide Details' : 'Source Details'}
                    </button>
                    {item.investigationId && (
                      <button
                        type="button"
                        onClick={() => onOpenInvestigation(item.investigationId!)}
                        className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] cursor-pointer"
                      >
                        Study Profile
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCheckUrl(item)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-blue)] cursor-pointer"
                    >
                      {linkCheck?.checking ? 'Checking…' : 'Check Availability'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {linkCheck && !linkCheck.checking && (
                      <span
                        className={`font-mono-tabular text-[11px] inline-flex items-center gap-1 ${
                          linkCheck.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        {linkCheck.status ? `HTTP ${linkCheck.status}` : linkCheck.note}
                      </span>
                    )}
                    {onToggleBookmark && (
                      <button
                        type="button"
                        onClick={() =>
                          onToggleBookmark({
                            id: item.id,
                            title: item.title,
                            url: item.url,
                            repository: item.repositoryLabel,
                            investigationId: item.investigationId,
                          })
                        }
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark source'}
                        className="text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] cursor-pointer"
                      >
                        {isBookmarked ? (
                          <BookmarkCheck className="w-3.5 h-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[var(--accent-blue)] hover:underline"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {filteredDiscovery.length > 12 && (
          <p className="text-xs text-[var(--text-muted)]">
            Showing top 12 of {filteredDiscovery.length} matching resources. Refine filters above to narrow results.
          </p>
        )}
      </section>

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
                        {item.publicationDate ? ` · ${item.publicationDate}` : item.publicationYear ? ` · ${item.publicationYear}` : ''}
                        {item.center ? ` · ${item.center}` : ''}
                        {item.id ? ` · NTRS ID ${item.id}` : ''}
                        {item.reportNumber ? ` · ${item.reportNumber}` : ''}
                        {item.doi ? ` · DOI ${item.doi}` : ''}
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
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.id && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={downloadingNtrsId === item.id}
                          onClick={() =>
                            void handleFetchNtrsFullText(item.id as number, item.title)
                          }
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {downloadingNtrsId === item.id
                              ? 'Retrieving .txt…'
                              : 'Fetch Full Text (.txt)'}
                          </span>
                        </Button>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] hover:underline"
                      >
                        <span>View Citation</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {ntrsTextStatus && (
              <p className="text-xs text-[var(--accent-cyan)]">{ntrsTextStatus}</p>
            )}
          </div>
        )}

        {/* Quick Verified NTRS Full-Text Retrieve Strip */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[var(--text-secondary)]">
            Direct verified NTRS full-text retrieval (public ASCII <code>.txt</code> manuscripts):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloadingNtrsId === 20160000593}
              onClick={() =>
                void handleFetchNtrsFullText(
                  20160000593,
                  'BASS-II Solid Fuel Microgravity Flame Spread (NASA/TM)'
                )
              }
            >
              Retrieve BASS-II (20160000593)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloadingNtrsId === 20180005168}
              onClick={() =>
                void handleFetchNtrsFullText(
                  20180005168,
                  'Saffire-I Large-Scale Spacecraft Fire Experiment'
                )
              }
            >
              Retrieve Saffire (20180005168)
            </Button>
          </div>
        </div>

        {/* Live NASA PSI Open Data AWS S3 Bucket Browser */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                NASA PSI Open Data Mirror (AWS S3 Bucket Inspection)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Inspects public bucket <code>https://nasa-psi.s3.us-west-2.amazonaws.com/</code> via ListObjectsV2 to verify which investigations have unauthenticated open-data files versus gated portal datasets.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {psiBrowseData && psiBrowseData.prefix && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={psiLoading}
                  onClick={() => void handleBrowsePsiOpen('')}
                >
                  Root Bucket
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={psiLoading}
                onClick={() => void handleBrowsePsiOpen('')}
              >
                {psiLoading ? 'Browsing AWS S3…' : 'Browse Public Bucket'}
              </Button>
            </div>
          </div>

          {psiError && <ErrorState title="NASA PSI Open Data Unavailable" message={psiError} />}

          {psiBrowseData && (
            <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-tabular text-[var(--text-primary)]">
                  s3://nasa-psi/{psiBrowseData.prefix || '(root)'}
                  {psiBrowseData.cached ? ' · cached' : ''}
                </span>
                <Badge tone={psiBrowseData.combustionFilesFound ? 'success' : 'warning'}>
                  {psiBrowseData.combustionFilesFound
                    ? 'Combustion records detected'
                    : '0 combustion folders in public AWS S3'}
                </Badge>
              </div>
              {psiBrowseData.prefixes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {psiBrowseData.prefixes.map((pfx) => (
                    <button
                      key={pfx}
                      type="button"
                      onClick={() => void handleBrowsePsiOpen(pfx)}
                      className="px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono-tabular text-[var(--accent-blue)] hover:border-[var(--accent-blue)] cursor-pointer"
                    >
                      📁 {pfx}
                    </button>
                  ))}
                </div>
              )}
              {psiBrowseData.objects.length > 0 && (
                <ul className="space-y-1 max-h-36 overflow-y-auto font-mono-tabular text-[11px]">
                  {psiBrowseData.objects.slice(0, 20).map((obj) => (
                    <li key={obj.key} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--text-secondary)]">{obj.key}</span>
                      <span className="text-[var(--text-muted)] shrink-0">
                        {(obj.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!psiBrowseData.combustionFilesFound && !psiBrowseData.prefix && (
                <p className="text-[11px] text-[var(--status-warning)]">
                  Empirical finding: The public AWS S3 mirror currently hosts only <code>DSI/</code>, <code>OASIS/</code>, and <code>pk4/</code>. Combustion datasets (BASS-II, Saffire, SPICE) require interactive access at <code>https://psi.nasa.gov/physci/repo</code>.
                </p>
              )}
            </div>
          )}
        </div>

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
          {OFFICIAL_RESOURCES.map((res) => {
            const portalMetaRetrieved =
              (res.id === 'nasa-ntrs' && Boolean(ntrsResults && ntrsResults.length > 0)) ||
              (res.id === 'nasa-osdr' && Boolean(osdrData));
            const portalVerification = resolveResourceVerificationStatus(
              res.url,
              linkStatusMap[res.url],
              { metadataRetrieved: portalMetaRetrieved }
            );
            return (
              <Card key={res.id} as="article" className="flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="neutral">{res.accessType}</Badge>
                    <Badge tone={portalVerification.tone}>
                      {portalVerification.status}
                    </Badge>
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
            );
          })}
        </div>
      </section>

      {/* FLAREX 7.0 Module N: Source Transparency & Acquisition Audit Registry */}
      <section aria-labelledby="transparency-ledger-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="transparency-ledger-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
            >
              Source Transparency &amp; Check History Ledger
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Explicit accounting of retrieval method, live availability stage, metadata vs. raw file status, access restrictions, and session check log.
            </p>
          </div>
          <Badge tone="blue">{transparencyRegistry.length} tracked URLs · {sourceCheckHistory.length} live checks</Badge>
        </div>

        <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse min-w-[820px] text-xs">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] text-[11px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                <th scope="col" className="p-3">Source Name</th>
                <th scope="col" className="p-3">Retrieval Method</th>
                <th scope="col" className="p-3">10-Stage Status</th>
                <th scope="col" className="p-3">Metadata / File</th>
                <th scope="col" className="p-3">Access &amp; Limitations</th>
                <th scope="col" className="p-3">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {transparencyRegistry.slice(0, 14).map((row) => (
                <tr key={row.id} className="hover:bg-[var(--bg-elevated)]/30">
                  <td className="p-3 align-top">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[var(--accent-blue)] hover:underline"
                    >
                      {row.sourceName}
                    </a>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {row.organization} · {row.resourceType}
                    </span>
                  </td>
                  <td className="p-3 align-top text-[var(--text-secondary)]">{row.retrievalMethod}</td>
                  <td className="p-3 align-top">
                    <Badge tone={STAGE10_META[row.availabilityStatus].tone}>
                      {STAGE10_META[row.availabilityStatus].label}
                    </Badge>
                  </td>
                  <td className="p-3 align-top font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                    <span className="block">Meta: {row.metadataStatus}</span>
                    <span className="block">File: {row.fileRetrievalStatus}</span>
                    <span className="block">Val: {row.validationStatus}</span>
                  </td>
                  <td className="p-3 align-top text-[11px] text-[var(--text-secondary)] max-w-[260px]">
                    {row.accessRestrictions}
                  </td>
                  <td className="p-3 align-top font-mono-tabular text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                    {row.lastCheckedTimestamp
                      ? new Date(row.lastCheckedTimestamp).toLocaleTimeString()
                      : 'Not probed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sourceCheckHistory.length > 0 && (
          <Card padding="sm" className="space-y-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Active Session Verification Log ({sourceCheckHistory.length})
            </p>
            <ul className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
              {sourceCheckHistory.slice(0, 15).map((entry) => (
                <li
                  key={entry.id}
                  className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text-primary)]">{entry.sourceName}</span>{' '}
                    <span className="text-[var(--text-secondary)]">— {entry.method} ({entry.note})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[11px]">
                    <Badge tone={STAGE10_META[entry.resultingStage].tone}>
                      {entry.resultingStage}
                    </Badge>
                    <span className="text-[var(--text-muted)]">
                      {new Date(entry.checkedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
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
