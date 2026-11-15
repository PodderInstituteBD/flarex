import {
  Activity,
  ArrowRight,
  BarChart3,
  BatteryCharging,
  BookOpen,
  Compass,
  Droplets,
  ExternalLink,
  Flame,
  Layers,
  MessageSquareText,
  Search,
  ShieldAlert,
  Wind,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AvailabilityIndicator, EvidenceLabel } from '../components/EvidenceLabel';
import { AppPage } from '../components/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, Panel } from '../components/ui/Card';
import { NoticeBanner } from '../components/ui/States';
import { DOSSIER_METADATA } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import { validateResearchDatabase } from '../utils/databaseValidator';
import {
  computeCategoryBreakdown,
  DomainCategoryId,
  ResearchStats,
} from '../utils/researchLogic';
import { computeScientificTrends } from '../utils/trendAnalysis';

interface HomeOverviewProps {
  stats: ResearchStats;
  investigations: InvestigationRecord[];
  recentIds: string[];
  onNavigate: (page: AppPage) => void;
  onOpenInvestigation: (id: string) => void;
  onSelectCategoryFilter: (categoryId: DomainCategoryId) => void;
  onOpenDemoMode?: () => void;
  evidenceSummary?: {
    totalEvidence: number;
    supportedClaims: number;
    multiSourceClaims: number;
    needsVerificationClaims: number;
    potentialConflicts: number;
    readinessCheckedCount: number;
  };
  sessionMetrics?: {
    checkedSourcesCount: number;
    retrievedDocumentsCount: number;
    generatedReportsCount: number;
    importedDatasetsCount: number;
    analysisRunsCount: number;
    reproducibilityRunsCount?: number;
    workspaceCount?: number;
  };
  onOpenEvidenceTab?: (tab: 'catalog' | 'claims' | 'conflicts' | 'audit') => void;
}

const CATEGORY_ICON_MAP: Record<DomainCategoryId, typeof Flame> = {
  'solid-fuel': Flame,
  'liquid-droplet': Droplets,
  'flame-dynamics': Wind,
  'smoke-aerosol': Activity,
  'material-flammability': Layers,
  'battery-fire': BatteryCharging,
  'fire-safety-modeling': Compass,
};

export function HomeOverview({
  stats,
  investigations,
  recentIds,
  onNavigate,
  onOpenInvestigation,
  onSelectCategoryFilter,
  onOpenDemoMode,
  evidenceSummary,
  sessionMetrics,
  onOpenEvidenceTab,
}: HomeOverviewProps) {
  const categories = useMemo(
    () => computeCategoryBreakdown(investigations),
    [investigations]
  );

  const trends = useMemo(
    () => computeScientificTrends(investigations),
    [investigations]
  );

  const dbAudit = useMemo(
    () => validateResearchDatabase(investigations),
    [investigations]
  );

  const recentRecords = recentIds
    .map((id) => investigations.find((r) => r.id === id))
    .filter((r): r is InvestigationRecord => Boolean(r));

  const recommendedStarter = useMemo(
    () =>
      ['bass-ii', 'saffire', 'same']
        .map((id) => investigations.find((r) => r.id === id))
        .filter((r): r is InvestigationRecord => Boolean(r)),
    [investigations]
  );

  const activityRecords =
    recentRecords.length > 0 ? recentRecords : recommendedStarter;

  const featuredIds = ['bass-ii', 'saffire', 'flex-cfi-g', 'sofie-mist'];
  const featuredRecords = featuredIds
    .map((id) => investigations.find((r) => r.id === id))
    .filter((r): r is InvestigationRecord => Boolean(r));

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <Panel className="lab-grid-bg p-6 sm:p-8 lg:p-10 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">NASA Space Apps Challenge 2026</Badge>
              <Badge tone="neutral">Flame in Freefall</Badge>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-[30px] sm:text-[36px] font-extrabold tracking-[-0.02em] leading-[1.15] text-[var(--text-primary)] text-balance">
                Turning Microgravity Combustion Data into Space Fire Safety Insights.
              </h1>
              <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--text-secondary)] max-w-2xl">
                FLAREX (Fire Learning and Research Explorer) helps students, educators, and combustion researchers discover, compare, and inspect microgravity fire investigations while preserving exact source provenance, evidence classifications, and dataset boundaries.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => onNavigate('explorer')}
              >
                <Search className="w-4 h-4" aria-hidden="true" />
                <span>Explore Investigations</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => onNavigate('data')}
              >
                <BarChart3 className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
                <span>Open Data Explorer</span>
              </Button>
              {onOpenDemoMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={onOpenDemoMode}
                >
                  <Compass className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
                  <span>Demonstration Mode</span>
                </Button>
              )}
            </div>
          </div>

          {/* Original calibrated combustion chamber & spherical flame schematic SVG */}
          <div className="hidden lg:flex lg:col-span-4 justify-end">
            <div className="w-full max-w-[300px] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/85 p-4">
              <svg
                viewBox="0 0 260 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="Schematic of spherical microgravity diffusion flame in a calibrated flow chamber"
                className="w-full h-auto"
              >
                {/* Coordinate grid axes */}
                <line x1="20" y1="180" x2="242" y2="180" stroke="var(--border-strong)" strokeWidth="1" />
                <line x1="24" y1="20" x2="24" y2="184" stroke="var(--border-strong)" strokeWidth="1" />
                {/* Flow velocity vectors */}
                <path d="M36 62 H74 M70 58 L75 62 L70 66" stroke="var(--accent-cyan)" strokeWidth="1.2" opacity="0.65" />
                <path d="M36 100 H80 M76 96 L81 100 L76 104" stroke="var(--accent-cyan)" strokeWidth="1.2" opacity="0.85" />
                <path d="M36 138 H74 M70 134 L75 138 L70 142" stroke="var(--accent-cyan)" strokeWidth="1.2" opacity="0.65" />

                {/* Thermal radiation envelope rings */}
                <circle cx="146" cy="100" r="56" stroke="var(--accent-violet)" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                <circle cx="146" cy="100" r="40" stroke="var(--accent-blue)" strokeWidth="1.4" strokeDasharray="5 3" opacity="0.8" />
                {/* Spherical diffusion flame zone */}
                <circle cx="146" cy="100" r="24" fill="var(--accent-blue)" fillOpacity="0.16" stroke="var(--accent-cyan)" strokeWidth="1.8" />
                {/* Fuel core */}
                <circle cx="146" cy="100" r="8" fill="var(--accent-blue)" />
                {/* Sample mount stem */}
                <line x1="146" y1="108" x2="146" y2="180" stroke="var(--text-muted)" strokeWidth="1.8" />
                {/* Labels */}
                <text x="34" y="34" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">
                  0g DIFFUSION ENVELOPE
                </text>
                <text x="152" y="172" fill="var(--text-muted)" fontSize="8.5" fontFamily="monospace">
                  O2 / VELOCITY AXIS
                </text>
              </svg>
              <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                <span>0g Buoyancy-Free</span>
                <span>PSI · NTRS Index</span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Calculated Database KPI Summary Cards */}
      <section aria-labelledby="kpi-overview-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2
              id="kpi-overview-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
            >
              Research Dossier Coverage
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Metrics calculated strictly from the loaded database; raw experiment telemetry remains in NASA PSI and NTRS.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('sources')}
            className="text-xs font-medium text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Inspect Source Library</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('explorer')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">Investigations Indexed</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--text-primary)]">
              {stats.totalRecords}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {stats.nasaInvestigations} NASA · {stats.reviewPapers + stats.complementaryTerrestrial} review/1g
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sources')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">Indexed Publications</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--accent-blue)]">
              {trends.publicationCoverage.totalPrimaryAndPeerPublications}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {trends.publicationCoverage.withPeerReviewedDoi} w/ DOI · {trends.publicationCoverage.withNtrsId} NTRS
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sources')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">PSI Dataset IDs</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--accent-cyan)]">
              {trends.publicationCoverage.withPsiId}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {stats.publicInPsi} publicly indexed in PSI
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('explorer')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">Research Categories</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--text-primary)]">
              {categories.length}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Across {stats.familyCounts.length} dossier families
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('data')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">Quantitative Summaries</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--status-success)]">
              {stats.withQuantitativeSummary}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Published counts / ranges
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('data')}
            className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors cursor-pointer"
          >
            <p className="text-[12px] text-[var(--text-secondary)]">Without Local Raw CSV</p>
            <p className="mt-1.5 text-[28px] font-bold font-mono-tabular text-[var(--status-warning)]">
              {stats.withoutRawNumericalData}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Raw logs hosted in PSI
            </p>
          </button>
        </div>

        {/* Interactive Era Chart + Repository & Database Scope Transparency */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
          <Card padding="sm" className="lg:col-span-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Campaign Coverage by Era (Click bar to inspect)
              </p>
              <Badge tone="cyan">DB-Derived</Badge>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trends.eraTimeline.map((b) => ({
                    shortEra: b.era.includes('Multi-Year')
                      ? 'Undated/Rev'
                      : b.era.split(' (')[0],
                    era: b.era,
                    count: b.count,
                  }))}
                  margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="shortEra"
                    interval={0}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [`${value ?? 0} records`, 'Indexed Studies']}
                    labelFormatter={(_lbl, items) => {
                      const p = items?.[0]?.payload as { era?: string } | undefined;
                      return p?.era ?? '';
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--accent-blue)"
                    radius={[4, 4, 0, 0]}
                    className="cursor-pointer"
                    onClick={() => onNavigate('data')}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding="sm" className="lg:col-span-3 space-y-2.5">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Repository Coverage
            </p>
            <div className="space-y-1.5">
              {trends.repositoryDistribution.map((repo) => (
                <button
                  key={repo.label}
                  type="button"
                  onClick={() => onNavigate('sources')}
                  className="w-full flex items-center justify-between text-xs hover:text-[var(--accent-blue)] transition-colors cursor-pointer"
                >
                  <span className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)]">
                    {repo.label}
                  </span>
                  <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                    {repo.count} {repo.count === 1 ? 'record' : 'records'}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card padding="sm" className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Database Snapshot &amp; Audit Scope
              </p>
              <Badge tone="neutral">{dbAudit.averageCompletenessPct}% avg. fields</Badge>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Source: <strong className="text-[var(--text-primary)]">{DOSSIER_METADATA.sourceDocumentTitle}</strong> ({stats.totalRecords} records, {dbAudit.duplicateIds.length} duplicate IDs).
            </p>
            <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
              {trends.variableCoverage.slice(0, 3).map((v) => (
                <div key={v.label} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)] truncate">{v.label}</span>
                  <span className="font-mono-tabular font-semibold text-[var(--accent-blue)]">
                    {v.count}/{stats.totalRecords}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
              Static curated JSON snapshot; &ldquo;Recently Explored&rdquo; reflects local browser session navigation rather than live upstream repository edits.
            </p>
          </Card>
        </div>
      </section>

      {/* FLAREX 6.0 Evidence Intelligence & Honest Session Activity */}
      {evidenceSummary && sessionMetrics && (
        <section aria-labelledby="evidence-intelligence-overview" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2
                id="evidence-intelligence-overview"
                className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
              >
                Evidence Intelligence &amp; Session Activity
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Claim-level citation classification and live counts from your actual session actions (zero simulated telemetry).
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenEvidenceTab ? onOpenEvidenceTab('audit') : onNavigate('evidence')
              }
              className="text-xs font-medium text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <span>Open Scientific Audit Center</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <button
              type="button"
              onClick={() =>
                onOpenEvidenceTab ? onOpenEvidenceTab('catalog') : onNavigate('evidence')
              }
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Evidence Catalog Items</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--accent-blue)]">
                {evidenceSummary.totalEvidence}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">7 typed evidence classes</p>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenEvidenceTab ? onOpenEvidenceTab('claims') : onNavigate('evidence')
              }
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Direct / Multi-Source Claims</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--status-success)]">
                {evidenceSummary.supportedClaims + evidenceSummary.multiSourceClaims}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {evidenceSummary.multiSourceClaims} multi-source verified
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenEvidenceTab ? onOpenEvidenceTab('claims') : onNavigate('evidence')
              }
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Needs Verification</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--status-warning)]">
                {evidenceSummary.needsVerificationClaims}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Partial / planned / AI-only</p>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenEvidenceTab ? onOpenEvidenceTab('conflicts') : onNavigate('evidence')
              }
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Conflicts &amp; Uncertainty</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--accent-cyan)]">
                {evidenceSummary.potentialConflicts}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Scale, gravity, regime notes</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('data')}
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Session Data &amp; Runs</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--text-primary)]">
                {sessionMetrics.importedDatasetsCount} / {sessionMetrics.analysisRunsCount}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {sessionMetrics.reproducibilityRunsCount ?? 0} SHA-256 repro logs
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('sources')}
              className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/60 p-4 text-left transition-colors cursor-pointer"
            >
              <p className="text-[12px] text-[var(--text-secondary)]">Live Session Activity</p>
              <p className="mt-1.5 text-[24px] font-bold font-mono-tabular text-[var(--text-primary)]">
                {sessionMetrics.checkedSourcesCount} · {sessionMetrics.retrievedDocumentsCount} · {sessionMetrics.generatedReportsCount}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">URL checks · Docs · Reports</p>
            </button>
          </div>

          <Card padding="sm" className="bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="cyan">
                SHA-256 Reproducibility Runs: {sessionMetrics.reproducibilityRunsCount ?? 0}
              </Badge>
              <Badge tone="blue">
                Workspace Saved Items: {sessionMetrics.workspaceCount ?? 0}
              </Badge>
              <Badge tone="success">
                Session Datasets Ready: {evidenceSummary.readinessCheckedCount}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('workspace')}
                className="text-xs font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
              >
                Open Workspace 3.0
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenEvidenceTab ? onOpenEvidenceTab('audit') : onNavigate('evidence')
                }
                className="text-xs font-semibold text-[var(--accent-cyan)] hover:underline cursor-pointer"
              >
                Inspect 14-Check Audit Center 2.0
              </button>
            </div>
          </Card>
        </section>
      )}

      {/* 7 Research Domain Categories */}
      <section aria-labelledby="domain-categories-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2
              id="domain-categories-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
            >
              Research Categories
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Select any combustion domain to open Investigation Explorer filtered to matching records.
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            Counts derived dynamically from loaded JSON
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICON_MAP[cat.id];
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategoryFilter(cat.id)}
                className="group rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/55 hover:bg-[var(--bg-elevated)] p-4 text-left transition-colors flex flex-col justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-blue)]">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <Badge tone="blue" className="font-mono-tabular">
                      {cat.count} {cat.count === 1 ? 'record' : 'records'}
                    </Badge>
                  </div>
                  <h3 className="font-display text-[16px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                    {cat.label}
                  </h3>
                  <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {cat.description}
                  </p>
                </div>

                <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-blue)]">
                  <span>Filter investigations</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Investigations */}
      <section aria-labelledby="featured-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2
              id="featured-heading"
              className="font-display text-[20px] font-semibold text-[var(--text-primary)]"
            >
              Featured Investigations
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Key microgravity fire safety studies spanning solid fuels, Cygnus vehicle scale, cool flames, and ISS next-generation testing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('explorer')}
            className="text-xs font-medium text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>View Full Catalog</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featuredRecords.map((rec) => (
            <Card key={rec.id} as="article" className="flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {rec.family} · {rec.platform}
                  </span>
                  <EvidenceLabel type={rec.evidenceType} />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenInvestigation(rec.id)}
                  className="text-left block group cursor-pointer"
                >
                  <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                    {rec.name}
                  </h3>
                </button>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                  {rec.overview}
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                <AvailabilityIndicator
                  status={rec.dataAvailability}
                  label={rec.psiId ? `PSI ID: ${rec.psiId}` : rec.dataAvailabilityLabel}
                />
                <div className="flex items-center gap-3">
                  <a
                    href={rec.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
                  >
                    <span>Source</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenInvestigation(rec.id)}
                    className="text-xs font-semibold text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect Profile</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent Activity & Source Coverage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card as="section" aria-labelledby="recent-heading" className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="recent-heading"
              className="font-display text-[17px] font-semibold text-[var(--text-primary)]"
            >
              {recentRecords.length > 0 ? 'Recently Explored' : 'Recommended Starting Studies'}
            </h2>
            <Badge tone="neutral">
              {recentRecords.length > 0 ? 'Session' : 'Suggested'}
            </Badge>
          </div>

          <ul className="space-y-2">
            {activityRecords.map((rec) => (
              <li key={rec.id}>
                <button
                  type="button"
                  onClick={() => onOpenInvestigation(rec.id)}
                  className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text-primary)] truncate">
                      {rec.shortName}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] truncate mt-0.5">
                      {rec.platform} · {rec.timeframe}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card as="section" aria-labelledby="coverage-heading" className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="coverage-heading"
              className="font-display text-[17px] font-semibold text-[var(--text-primary)]"
            >
              Source Coverage Breakdown
            </h2>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              {stats.totalRecords} total records
            </span>
          </div>

          <div className="space-y-2.5">
            {stats.evidenceCounts.map(({ evidenceType, count }) => {
              const pct = Math.round((count / stats.totalRecords) * 100);
              return (
                <div key={evidenceType} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--text-primary)] font-medium truncate">
                      {evidenceType}
                    </span>
                    <span className="font-mono-tabular text-[var(--text-secondary)] shrink-0">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden border border-[var(--border-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent-blue)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <NoticeBanner tone="info">
            Descriptive NASA investigation summaries and peer-reviewed reports are strictly separated from raw PSI numerical telemetry files ({stats.withRawNumericalDataset} raw CSV telemetry bundles loaded locally).
          </NoticeBanner>
        </Card>
      </div>

      {/* Research Tools Shortcuts */}
      <section aria-labelledby="quick-nav-heading" className="space-y-3">
        <h2
          id="quick-nav-heading"
          className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
        >
          Analytical Workspaces
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="p-4 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors space-y-1.5 cursor-pointer"
          >
            <MessageSquareText className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              FLAREX Research Intelligence
            </span>
            <span className="block text-xs text-[var(--text-secondary)]">
              Ask grounded questions with dossier citations &amp; uncertainty checks.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('gaps')}
            className="p-4 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors space-y-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-[var(--status-warning)]" aria-hidden="true" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              Research Gap Explorer
            </span>
            <span className="block text-xs text-[var(--text-secondary)]">
              Audit partial-gravity, battery fire, and solid-kinetics knowledge gaps.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('compare')}
            className="p-4 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors space-y-1.5 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-[var(--status-success)]" aria-hidden="true" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              Investigation Comparison
            </span>
            <span className="block text-xs text-[var(--text-secondary)]">
              Compare 2–3 studies side by side while preserving 0g vs 1g caveats.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('graph')}
            className="p-4 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors space-y-1.5 cursor-pointer"
          >
            <Compass className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              Knowledge Graph
            </span>
            <span className="block text-xs text-[var(--text-secondary)]">
              Explore 10 entity types, fuels, sensors, and verified vs. inferred links.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="p-4 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50 text-left transition-colors space-y-1.5 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[var(--accent-violet)]" aria-hidden="true" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              Document Intelligence
            </span>
            <span className="block text-xs text-[var(--text-secondary)]">
              Parse JSON, CSV, TXT, XML, &amp; PDF files with 5 provenance labels.
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
