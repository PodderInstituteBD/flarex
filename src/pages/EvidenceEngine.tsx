import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import {
  ClaimCitationStatus,
  VerifiedScientificClaim,
  verifyClaimAgainstEvidence,
} from '../utils/claimVerification';
import {
  AiInterpretationInput,
  buildEvidenceCatalog,
  EVIDENCE_CATEGORY_LABELS,
  EvidenceCategory6,
} from '../utils/evidenceIntelligence';
import type { ReproducibilityRecord } from '../utils/reproducibilityEngine';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import {
  AuditCheckStatus,
  AuditSystemTelemetryInput,
  renderScientificAuditV2Markdown,
  runPlatformScientificAuditV2,
} from '../utils/scientificAudit';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import {
  ConflictConfirmationLevel,
  detectScientificConflicts,
} from '../utils/scientificUncertainty';
import type { SavedEvidenceEntry } from '../utils/workspaceStore';

type EvidenceLabTab = 'catalog' | 'claims' | 'conflicts' | 'audit';

interface EvidenceEngineProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
  ingestedDatasets?: IngestedDatasetPackage[];
  analysisHistory?: ReproducibleAnalysisRun[];
  reproducibilityRecords?: ReproducibilityRecord[];
  workspaceItemCount?: number;
  checkedSourcesCount?: number;
  retrievedDocumentsCount?: number;
  generatedReportsCount?: number;
  aiInterpretations?: AiInterpretationInput[];
  savedEvidenceIds?: string[];
  onToggleSaveEvidence?: (item: Omit<SavedEvidenceEntry, 'savedAt'>) => void;
  initialTab?: EvidenceLabTab;
}

const ALL_CATEGORIES_6: EvidenceCategory6[] = [
  'SOURCE_FACT',
  'PUBLISHED_RESULT',
  'RAW_MEASUREMENT',
  'DERIVED_STATISTIC',
  'METHODOLOGY',
  'AI_INTERPRETATION',
  'RESEARCH_GAP',
];

const SAMPLE_CLAIMS_TO_VERIFY = [
  'BASS-II observed dim blue microgravity flames persisting at very low airflow below 1 cm/s.',
  'Saffire tested large-scale cotton-fiberglass and Nomex spacecraft fire spread inside Cygnus.',
  'NASA/UL Li-ion battery thermal runaway tests prove battery fire propagation rates in microgravity.',
  'ACME E-FIELD Flames directly measures lunar 1/6 g partial-gravity flame speed.',
  'SoFIE-MIST has already completed flight measurements of fuel ignition thresholds.',
];

function categoryTone6(cat: EvidenceCategory6): BadgeTone {
  switch (cat) {
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

function claimStatusTone(status: ClaimCitationStatus): BadgeTone {
  switch (status) {
    case 'Supported by multiple sources':
    case 'Supported by direct evidence':
      return 'success';
    case 'Partially supported':
      return 'blue';
    case 'Conflicting evidence':
      return 'danger';
    case 'Insufficient evidence':
    case 'AI interpretation only':
      return 'warning';
  }
}

function conflictLevelTone(level: ConflictConfirmationLevel): BadgeTone {
  switch (level) {
    case 'Confirmed experimental difference':
      return 'cyan';
    case 'Suspected discrepancy (condition-explained)':
      return 'warning';
    case 'Incomplete / unclear source attribution':
      return 'danger';
  }
}

function auditStatusTone(status: AuditCheckStatus): BadgeTone {
  switch (status) {
    case 'PASS':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'FAIL':
      return 'danger';
    case 'NOT TESTED':
      return 'neutral';
  }
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameSafe(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fileNameSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function EvidenceEngine({
  investigations,
  onOpenInvestigation,
  ingestedDatasets = [],
  analysisHistory = [],
  reproducibilityRecords = [],
  workspaceItemCount = 0,
  checkedSourcesCount = 0,
  generatedReportsCount = 0,
  aiInterpretations = [],
  savedEvidenceIds = [],
  onToggleSaveEvidence,
  initialTab = 'catalog',
}: EvidenceEngineProps) {
  const [activeTab, setActiveTab] = useState<EvidenceLabTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Tab 1: Evidence Catalog filters
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EvidenceCategory6 | 'ALL'>('ALL');
  const [selectedInvestigation, setSelectedInvestigation] = useState('ALL');

  // Tab 2: Interactive Claim Verification
  const [customClaimText, setCustomClaimText] = useState(SAMPLE_CLAIMS_TO_VERIFY[0]);
  const [customClaimOrigin, setCustomClaimOrigin] = useState<'USER_CLAIM' | 'AI_GENERATED'>('USER_CLAIM');
  const [verifiedCustomClaim, setVerifiedCustomClaim] = useState<VerifiedScientificClaim | null>(null);

  // Tab 4: Live Audit Telemetry fetch
  const [telemetry, setTelemetry] = useState<AuditSystemTelemetryInput | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  const evidenceCatalog = useMemo(
    () =>
      buildEvidenceCatalog({
        investigations,
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        aiInterpretations,
      }),
    [investigations, ingestedDatasets, analysisHistory, aiInterpretations]
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<EvidenceCategory6, number>();
    for (const item of evidenceCatalog) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [evidenceCatalog]);

  const filteredEvidence = useMemo(() => {
    const q = query.trim().toLowerCase();
    return evidenceCatalog.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (selectedInvestigation !== 'ALL' && item.investigationId !== selectedInvestigation) {
        return false;
      }
      if (!q) return true;
      return (
        item.valueOrText.toLowerCase().includes(q) ||
        item.investigationShortName.toLowerCase().includes(q) ||
        item.sourceId.toLowerCase().includes(q) ||
        item.originalSourceReference.toLowerCase().includes(q)
      );
    });
  }, [evidenceCatalog, query, selectedCategory, selectedInvestigation]);

  const presetVerifiedClaims = useMemo(
    () =>
      [
        ...investigations
          .filter((r) => Boolean(r.reportedFindings))
          .slice(0, 6)
          .map((r) =>
            verifyClaimAgainstEvidence(r.reportedFindings as string, evidenceCatalog, {
              claimId: `dossier-${r.id}`,
              origin: 'DOSSIER_FACT',
              targetInvestigationId: r.id,
            })
          ),
        ...SAMPLE_CLAIMS_TO_VERIFY.slice(2).map((text, idx) =>
          verifyClaimAgainstEvidence(text, evidenceCatalog, {
            claimId: `audit-claim-${idx}`,
            origin: 'USER_CLAIM',
          })
        ),
      ],
    [investigations, evidenceCatalog]
  );

  const activeClaimResult = useMemo(() => {
    if (verifiedCustomClaim) return verifiedCustomClaim;
    return verifyClaimAgainstEvidence(customClaimText, evidenceCatalog, {
      origin: customClaimOrigin,
    });
  }, [verifiedCustomClaim, customClaimText, customClaimOrigin, evidenceCatalog]);

  const conflicts = useMemo(
    () =>
      detectScientificConflicts({
        investigations,
        evidenceCatalog,
        ingestedDatasets,
      }),
    [investigations, evidenceCatalog, ingestedDatasets]
  );

  const auditReport = useMemo(
    () =>
      runPlatformScientificAuditV2({
        investigations,
        gaps: RESEARCH_GAPS,
        evidenceCatalog,
        claims: presetVerifiedClaims,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        reproducibilityRecords,
        aiTelemetry: telemetry,
        checkedSourceCount: checkedSourcesCount,
        generatedReportCount: generatedReportsCount,
        workspaceItemCount,
        workspaceSchemaValid: true,
        availableRouteCount: 14,
      }),
    [
      investigations,
      evidenceCatalog,
      presetVerifiedClaims,
      ingestedDatasets,
      analysisHistory,
      reproducibilityRecords,
      telemetry,
      checkedSourcesCount,
      generatedReportsCount,
      workspaceItemCount,
    ]
  );

  const savedEvidenceSet = useMemo(() => new Set(savedEvidenceIds), [savedEvidenceIds]);

  const handleRunLiveAudit = async () => {
    setTelemetryLoading(true);
    try {
      const resp = await fetch('/api/system-health');
      if (resp.ok) {
        const data = (await resp.json()) as {
          aiProvider?: {
            configured?: boolean;
            telemetry?: {
              totalRequests?: number;
              successfulRequests?: number;
              succeededRequests?: number;
              failedRequests?: number;
              abortedRequests?: number;
              timeoutCount?: number;
            };
          };
          nasaIntegration?: {
            ntrsCacheEntries?: number;
            osdrCacheEntries?: number;
            psiOpenCacheEntries?: number;
            urlCheckCacheEntries?: number;
          };
        };
        const t = data.aiProvider?.telemetry;
        const nasaCaches =
          (data.nasaIntegration?.ntrsCacheEntries ?? 0) +
          (data.nasaIntegration?.osdrCacheEntries ?? 0) +
          (data.nasaIntegration?.psiOpenCacheEntries ?? 0) +
          (data.nasaIntegration?.urlCheckCacheEntries ?? 0);
        setTelemetry({
          configured: Boolean(data.aiProvider?.configured),
          totalRequests: t?.totalRequests ?? 0,
          succeededRequests: t?.successfulRequests ?? t?.succeededRequests ?? 0,
          failedRequests: t?.failedRequests ?? 0,
          abortedRequests: t?.abortedRequests ?? 0,
          timeoutCount: t?.timeoutCount ?? 0,
          nasaCacheEntries: nasaCaches,
        });
      }
    } catch {
      // Leave telemetry null so audit reports NOT TESTED honestly
    } finally {
      setTelemetryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FLAREX 6.0 · Scientific Integrity & Validation"
        title="Evidence Intelligence, Claim Citations & Audit Center"
        description="Traceable evidence registry separating source facts, published results, raw tabular rows, derived statistics, methodology, AI commentary, and knowledge gaps—with zero fabricated confidence percentages."
        meta={
          <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
            {evidenceCatalog.length} evidence items · {conflicts.length} conflict/uncertainty analyses
          </span>
        }
      />

      {/* 4-Tab Lab Selector */}
      <div
        role="tablist"
        aria-label="Evidence Intelligence Lab Sections"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-3"
      >
        {(
          [
            { id: 'catalog', label: `1. Evidence Catalog (${evidenceCatalog.length})`, icon: Scale },
            { id: 'claims', label: '2. Claim Citation Verifier', icon: FileCheck2 },
            { id: 'conflicts', label: `3. Conflict & Uncertainty (${conflicts.length})`, icon: ShieldAlert },
            { id: 'audit', label: '4. Scientific Audit Center', icon: ClipboardCheck },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-[8px] border transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: MODULE A — EVIDENCE INTELLIGENCE CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {ALL_CATEGORIES_6.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    setSelectedCategory((prev) => (prev === cat ? 'ALL' : cat))
                  }
                  className={`p-3 rounded-[10px] border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-blue)]/12 border-[var(--accent-blue)]/45'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span className="block font-mono-tabular text-lg font-bold text-[var(--text-primary)]">
                    {categoryCounts.get(cat) ?? 0}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--text-secondary)] mt-0.5">
                    {EVIDENCE_CATEGORY_LABELS[cat]}
                  </span>
                </button>
              );
            })}
          </div>

          <Card padding="sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 relative">
                <Search
                  className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search evidence text, PSI/NTRS/DOI source ID, units, or study..."
                  aria-label="Search evidence catalog"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div className="md:col-span-4">
                <select
                  value={selectedInvestigation}
                  onChange={(e) => setSelectedInvestigation(e.target.value)}
                  aria-label="Filter evidence by investigation"
                  className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                >
                  <option value="ALL">All Investigations &amp; Session Sources</option>
                  {investigations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.shortName}
                    </option>
                  ))}
                  {ingestedDatasets.length > 0 && (
                    <option value="session-upload">Session Imported Datasets</option>
                  )}
                </select>
              </div>
              <div className="md:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setQuery('');
                    setSelectedCategory('ALL');
                    setSelectedInvestigation('ALL');
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            </div>
          </Card>

          <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
            Showing {Math.min(filteredEvidence.length, 60)} of {filteredEvidence.length} matching evidence records
          </p>

          <div className="space-y-3">
            {filteredEvidence.slice(0, 60).map((item) => {
              const isSaved = savedEvidenceSet.has(item.evidenceId);
              return (
                <Card key={item.evidenceId} padding="md" className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={categoryTone6(item.category)}>
                        {EVIDENCE_CATEGORY_LABELS[item.category]}
                      </Badge>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {item.investigationShortName}
                      </span>
                      <Badge tone="neutral">{item.verificationStatus}</Badge>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-[var(--accent-cyan)]">
                      {item.sourceId} · {item.evidenceId}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                    {item.valueOrText}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[var(--text-secondary)] p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[var(--text-muted)]">Extraction Method:</span>{' '}
                      <strong className="text-[var(--text-primary)]">{item.extractionMethod}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Location / Unit:</span>{' '}
                      <span className="font-mono-tabular">
                        {item.locationReference ?? 'N/A'}
                        {item.unit ? ` · Unit: ${item.unit}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Completeness:</span>{' '}
                      <span>{item.completenessInfo}</span>
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      {investigations.some((r) => r.id === item.investigationId) && (
                        <button
                          type="button"
                          onClick={() => onOpenInvestigation(item.investigationId)}
                          className="text-[var(--accent-blue)] font-medium hover:underline cursor-pointer"
                        >
                          Open Investigation Profile
                        </button>
                      )}
                      {item.sourceUrl.startsWith('http') || item.sourceUrl.startsWith('/assets') ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent-blue)] hover:underline"
                        >
                          <span>{item.originalSourceReference}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-[var(--text-muted)]">{item.originalSourceReference}</span>
                      )}
                    </div>

                    {onToggleSaveEvidence && (
                      <button
                        type="button"
                        onClick={() =>
                          onToggleSaveEvidence({
                            evidenceId: item.evidenceId,
                            investigationId: item.investigationId,
                            investigationShortName: item.investigationShortName,
                            category: EVIDENCE_CATEGORY_LABELS[item.category],
                            summary: item.valueOrText.slice(0, 220),
                            sourceUrl: item.sourceUrl,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] cursor-pointer"
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
                            <span>Saved in Workspace</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Save Evidence</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MODULE B — CLAIM-LEVEL SCIENTIFIC CITATION ENGINE */}
      {activeTab === 'claims' && (
        <div className="space-y-5">
          <Card padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Verify Any Scientific or AI Claim Against Loaded Evidence
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Evaluates whether statements are supported by direct evidence, multiple sources, partially supported, conflicting, insufficient, or unverified AI interpretation. AI text never self-verifies.
                </p>
              </div>
              <Badge tone="cyan">Zero Fake Scores</Badge>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_CLAIMS_TO_VERIFY.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setCustomClaimText(sample);
                      setVerifiedCustomClaim(
                        verifyClaimAgainstEvidence(sample, evidenceCatalog, {
                          origin: customClaimOrigin,
                        })
                      );
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-[6px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] hover:border-[var(--accent-blue)]/40 text-left cursor-pointer"
                  >
                    Test: &ldquo;{sample.slice(0, 62)}…&rdquo;
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                <textarea
                  rows={2}
                  value={customClaimText}
                  onChange={(e) => setCustomClaimText(e.target.value)}
                  aria-label="Enter scientific claim to verify"
                  className="md:col-span-8 px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
                <div className="md:col-span-4 flex flex-col gap-2">
                  <select
                    value={customClaimOrigin}
                    onChange={(e) =>
                      setCustomClaimOrigin(e.target.value as 'USER_CLAIM' | 'AI_GENERATED')
                    }
                    aria-label="Claim origin classification"
                    className="px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="USER_CLAIM">Origin: Researcher Claim</option>
                    <option value="AI_GENERATED">Origin: AI-Generated Statement</option>
                  </select>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setVerifiedCustomClaim(
                        verifyClaimAgainstEvidence(customClaimText, evidenceCatalog, {
                          origin: customClaimOrigin,
                        })
                      )
                    }
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Verify Claim Evidence</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Verification Result */}
            <div className="p-4 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={claimStatusTone(activeClaimResult.verificationStatus)}>
                    {activeClaimResult.verificationStatus}
                  </Badge>
                  <Badge tone="neutral">{activeClaimResult.topicTag}</Badge>
                </div>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  Origin: {activeClaimResult.origin}
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {activeClaimResult.claimText}
              </p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {activeClaimResult.explanation}
              </p>

              {activeClaimResult.conflictingNotes.length > 0 && (
                <div className="p-2.5 rounded-[8px] bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/35 text-xs text-[var(--status-danger)] space-y-1">
                  {activeClaimResult.conflictingNotes.map((n) => (
                    <p key={n}>⚠ {n}</p>
                  ))}
                </div>
              )}

              {activeClaimResult.missingEvidenceNotes.length > 0 && (
                <div className="p-2.5 rounded-[8px] bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/35 text-xs text-[var(--status-warning)] space-y-1">
                  {activeClaimResult.missingEvidenceNotes.map((n) => (
                    <p key={n}>• {n}</p>
                  ))}
                </div>
              )}

              {activeClaimResult.supportingSources.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Linked Evidence Sources ({activeClaimResult.supportingSources.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activeClaimResult.supportingSources.map((src) => (
                      <div
                        key={src.evidenceId}
                        className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInvestigation(src.investigationId)}
                            className="font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
                          >
                            {src.investigationShortName}
                          </button>
                          <span className="font-mono-tabular text-[10px] text-[var(--accent-cyan)]">
                            {src.sourceId}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {src.excerpt}
                        </p>
                        <a
                          href={src.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-blue)] hover:underline"
                        >
                          <span>{src.sourceLabel}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Catalog Claim Audit List */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Pre-Audited Dossier &amp; Benchmark Claims ({presetVerifiedClaims.length})
            </h3>
            {presetVerifiedClaims.map((claim) => (
              <Card key={claim.claimId} padding="sm" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={claimStatusTone(claim.verificationStatus)}>
                    {claim.verificationStatus}
                  </Badge>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    {claim.supportingSources.length} supporting source(s) · {claim.topicTag}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--text-primary)]">{claim.claimText}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">{claim.explanation}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MODULE D — SCIENTIFIC CONFLICT & UNCERTAINTY DETECTOR */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          <Card padding="sm" className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Scientific Conflict Rule:</strong>{' '}
            FLAREX distinguishes genuine cross-study contradictions from differences in gravity regime (0g vs 1g), apparatus scale (MSG bench vs Cygnus vehicle), electrostatic ion-wind testing vs true partial gravity, and unlaunched planned studies.
          </Card>

          <div className="space-y-3">
            {conflicts.map((conf) => (
              <Card key={conf.id} padding="md" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={conflictLevelTone(conf.confirmationLevel)}>
                      {conf.confirmationLevel}
                    </Badge>
                    <Badge tone="neutral">{conf.category}</Badge>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    {conf.investigationA} vs {conf.investigationB}
                  </span>
                </div>

                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {conf.topic}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <p className="font-semibold text-[var(--accent-blue)]">
                      {conf.investigationA} — {conf.sourceA}
                    </p>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {conf.valuesOrStatementsA}
                    </p>
                  </div>
                  <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <p className="font-semibold text-[var(--accent-cyan)]">
                      {conf.investigationB} — {conf.sourceB}
                    </p>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {conf.valuesOrStatementsB}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1 text-xs">
                  <p>
                    <strong className="text-[var(--text-primary)]">Experimental Condition Differences:</strong>{' '}
                    <span className="text-[var(--text-secondary)]">{conf.experimentalConditionDifferences}</span>
                  </p>
                  <p>
                    <strong className="text-[var(--status-warning)]">Why Apparent Conflict Exists:</strong>{' '}
                    <span className="text-[var(--text-secondary)]">{conf.whyApparentConflictExists}</span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: MODULE M — FLAREX SCIENTIFIC AUDIT CENTER */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                FLAREX 7.0 Scientific Audit Center 2.0 (14 Categories)
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Evaluates source integrity, evidence traceability, citations, dataset provenance &amp; validation, unit consistency, numerical integrity, SHA-256 reproducibility, AI separation, report consistency, API health, 14-route readiness, workspace integrity, and unit test verification. Untested items remain explicitly marked <code>NOT TESTED</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={telemetryLoading}
                onClick={() => void handleRunLiveAudit()}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{telemetryLoading ? 'Fetching Telemetry…' : 'Probe Live API Telemetry'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  triggerDownload(
                    renderScientificAuditV2Markdown(auditReport),
                    'flarex7_scientific_audit_v2.md',
                    'text/markdown;charset=utf-8'
                  )
                }
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export MD</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  triggerDownload(
                    JSON.stringify(auditReport, null, 2),
                    'flarex7_scientific_audit_v2.json',
                    'application/json;charset=utf-8'
                  )
                }
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export JSON</span>
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Card padding="sm">
              <span className="text-[var(--text-muted)] block">PASS</span>
              <strong className="font-mono-tabular text-xl text-[var(--status-success)]">
                {auditReport.summaryCounts.PASS}
              </strong>
            </Card>
            <Card padding="sm">
              <span className="text-[var(--text-muted)] block">WARNING</span>
              <strong className="font-mono-tabular text-xl text-[var(--status-warning)]">
                {auditReport.summaryCounts.WARNING}
              </strong>
            </Card>
            <Card padding="sm">
              <span className="text-[var(--text-muted)] block">FAIL</span>
              <strong className="font-mono-tabular text-xl text-[var(--status-danger)]">
                {auditReport.summaryCounts.FAIL}
              </strong>
            </Card>
            <Card padding="sm">
              <span className="text-[var(--text-muted)] block">NOT TESTED</span>
              <strong className="font-mono-tabular text-xl text-[var(--text-secondary)]">
                {auditReport.summaryCounts['NOT TESTED']}
              </strong>
            </Card>
          </div>

          <div className="space-y-3">
            {auditReport.checks.map((chk) => (
              <Card key={chk.id} padding="sm" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={auditStatusTone(chk.status)}>{chk.status}</Badge>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {chk.category}
                    </h3>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    {chk.id}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{chk.description}</p>
                <div className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs space-y-1">
                  <p>
                    <strong className="text-[var(--text-primary)]">Evidence:</strong>{' '}
                    <span className="text-[var(--text-secondary)]">{chk.evidence}</span>
                  </p>
                  <p>
                    <strong className="text-[var(--accent-cyan)]">Recommended Action:</strong>{' '}
                    <span className="text-[var(--text-secondary)]">{chk.recommendedCorrection}</span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

