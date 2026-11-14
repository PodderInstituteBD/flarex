import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Info,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ClientErrorLogItem } from '../App';
import { NumericalWorkbench } from '../components/NumericalWorkbench';
import { SystemHealthPanel } from '../components/SystemHealthPanel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, NoticeBanner } from '../components/ui/States';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import {
  exportDatasetCatalogCsv,
  exportDatasetCatalogJson,
  extractDatasetCatalog,
  extractPublishedCountsFromRecords,
  recommendValidChartType,
  UnitFamilyId,
} from '../utils/dataExplorer';
import { validateResearchDatabase } from '../utils/databaseValidator';
import { LinkCheckResult, runDataQualityAudit } from '../utils/dataQualityMonitor';
import { buildEvidenceClaims } from '../utils/evidenceEngine';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import { computeScientificTrends } from '../utils/trendAnalysis';

interface ScientificDataExplorerProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
  ingestedDatasets?: IngestedDatasetPackage[];
  analysisHistory?: ReproducibleAnalysisRun[];
  onIngestDataset?: (pkg: IngestedDatasetPackage) => void;
  onRemoveIngestedDataset?: (datasetId: string) => void;
  onRecordAnalysisRun?: (run: ReproducibleAnalysisRun) => void;
  clientErrors?: ClientErrorLogItem[];
  onRecordClientError?: (source: string, message: string) => void;
}

type AuditFilter =
  | 'ALL'
  | 'PUBLISHED_VALUES'
  | 'EXPERIMENTAL_RANGES'
  | 'QUALITATIVE_ONLY';

type ChartVariableView =
  | 'PUBLISHED_COUNTS'
  | 'TIMELINE_SPANS'
  | 'TIMELINE_SCATTER'
  | 'ARCHIVE_DISTRIBUTION'
  | 'ERA_HISTOGRAM'
  | 'EXPERIMENTAL_BOUNDS';

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

export function ScientificDataExplorer({
  investigations,
  onOpenInvestigation,
  ingestedDatasets = [],
  analysisHistory = [],
  onIngestDataset = () => {},
  onRemoveIngestedDataset = () => {},
  onRecordAnalysisRun = () => {},
  clientErrors = [],
  onRecordClientError,
}: ScientificDataExplorerProps) {
  const [auditTab, setAuditTab] = useState<AuditFilter>('ALL');
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string>('ALL');
  const [variableView, setVariableView] = useState<ChartVariableView>('PUBLISHED_COUNTS');
  const [unitFamilyFilter, setUnitFamilyFilter] = useState<UnitFamilyId>('ALL');

  const dbAudit = useMemo(
    () => validateResearchDatabase(investigations),
    [investigations]
  );

  const trends = useMemo(
    () => computeScientificTrends(investigations),
    [investigations]
  );

  const claims = useMemo(
    () => buildEvidenceClaims(investigations, RESEARCH_GAPS),
    [investigations]
  );

  const qualityAudit = useMemo(
    () => runDataQualityAudit(investigations, claims),
    [investigations, claims]
  );

  const [linkResults, setLinkResults] = useState<LinkCheckResult[]>([]);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [lastAuditRunAt, setLastAuditRunAt] = useState<string | null>(null);

  const runLiveLinkCheck = async () => {
    if (checkingLinks) return;
    setCheckingLinks(true);
    try {
      const sampleUrls = qualityAudit.uniqueCheckableUrls.slice(0, 8);
      const resp = await fetch('/api/check-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: sampleUrls.map((u) => u.url) }),
      });
      const payload = (await resp.json()) as {
        results?: Array<{
          url: string;
          ok: boolean;
          status: number | null;
          checkedAt: string;
          note?: string;
        }>;
      };
      if (resp.ok && payload.results) {
        const mapped: LinkCheckResult[] = payload.results.map((r) => {
          const meta = sampleUrls.find((u) => u.url === r.url);
          return {
            url: r.url,
            investigationId: meta?.investigationId ?? '',
            label: meta?.label ?? r.url,
            ok: r.ok,
            status: r.status,
            checkedAt: r.checkedAt,
            note: r.note,
          };
        });
        setLinkResults(mapped);
        setLastAuditRunAt(new Date().toISOString());
      }
    } finally {
      setCheckingLinks(false);
    }
  };

  const archiveDistributionData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of investigations) {
      counts.set(
        inv.dataAvailabilityLabel.includes('NASA PSI')
          ? 'Public in NASA PSI'
          : inv.dataAvailability === 'PARTIAL_OR_NTRS'
          ? 'Partial / NTRS Reports'
          : inv.dataAvailability === 'ARCHIVED_OR_CONDITIONAL'
          ? 'Archived / Conditional'
          : inv.dataAvailability === 'PLANNED_NO_PUBLIC_DATA'
          ? 'Planned (No Public Data)'
          : 'Terrestrial Lab Only (1g)',
        (counts.get(
          inv.dataAvailabilityLabel.includes('NASA PSI')
            ? 'Public in NASA PSI'
            : inv.dataAvailability === 'PARTIAL_OR_NTRS'
            ? 'Partial / NTRS Reports'
            : inv.dataAvailability === 'ARCHIVED_OR_CONDITIONAL'
            ? 'Archived / Conditional'
            : inv.dataAvailability === 'PLANNED_NO_PUBLIC_DATA'
            ? 'Planned (No Public Data)'
            : 'Terrestrial Lab Only (1g)'
        ) ?? 0) + 1
      );
    }
    return Array.from(counts.entries()).map(([bucket, count]) => ({
      bucket,
      count,
    }));
  }, [investigations]);

  const selectedInvestigation = useMemo(
    () =>
      selectedInvestigationId === 'ALL'
        ? null
        : investigations.find((r) => r.id === selectedInvestigationId) ?? null,
    [investigations, selectedInvestigationId]
  );

  // Verified timeline span chart (purely documented start/end years from dossier)
  const timelineChartData = useMemo(
    () =>
      investigations
        .filter(
          (r) =>
            r.startYear !== null &&
            r.endYear !== null &&
            r.id !== 'dossier-literature-review' &&
            (selectedInvestigationId === 'ALL' || r.id === selectedInvestigationId)
        )
        .map((r) => ({
          name: r.shortName,
          startYear: r.startYear as number,
          durationYears: Math.max(
            1,
            (r.endYear as number) - (r.startYear as number) + 1
          ),
          timeframe: r.timeframe,
          gravity: r.gravityContext,
          status: r.isPlannedOrOngoing
            ? 'Planned / Ongoing'
            : 'Completed / Historical',
        }))
        .sort((a, b) => a.startYear - b.startYear),
    [investigations, selectedInvestigationId]
  );

  // Dynamic published count series computed strictly from researchDatabase.json records
  const publishedCountsChartData = useMemo(
    () => extractPublishedCountsFromRecords(investigations, selectedInvestigationId),
    [investigations, selectedInvestigationId]
  );

  // Experimental condition min/max chart from strictly documented quantitativeData ranges
  const experimentalRangeChartData = useMemo(() => {
    const items = investigations.flatMap((inv) =>
      inv.quantitativeData
        .filter(
          (q) =>
            (selectedInvestigationId === 'ALL' ||
              inv.id === selectedInvestigationId) &&
            typeof q.max === 'number'
        )
        .map((q) => ({
          label: `${inv.shortName}: ${q.label.slice(0, 22)}${
            q.label.length > 22 ? '…' : ''
          }`,
          fullLabel: `${inv.shortName} — ${q.label}`,
          minVal: typeof q.min === 'number' ? q.min : 0,
          maxVal: q.max as number,
          unit: q.unit,
          source: q.sourceCitation,
        }))
    );
    return items;
  }, [investigations, selectedInvestigationId]);

  const datasetCatalog = useMemo(
    () =>
      extractDatasetCatalog(investigations).filter((item) => {
        if (
          selectedInvestigationId !== 'ALL' &&
          item.investigationId !== selectedInvestigationId
        ) {
          return false;
        }
        if (unitFamilyFilter !== 'ALL' && item.unitFamily !== unitFamilyFilter) {
          return false;
        }
        return true;
      }),
    [investigations, selectedInvestigationId, unitFamilyFilter]
  );

  const eraHistogramData = useMemo(
    () =>
      trends.eraTimeline.map((b) => ({
        bucket: b.era.split(' (')[0],
        era: b.era,
        count: b.count,
      })),
    [trends.eraTimeline]
  );

  const activePointCount =
    variableView === 'PUBLISHED_COUNTS'
      ? publishedCountsChartData.length
      : variableView === 'EXPERIMENTAL_BOUNDS'
      ? experimentalRangeChartData.length
      : variableView === 'TIMELINE_SCATTER' || variableView === 'TIMELINE_SPANS'
      ? timelineChartData.length
      : variableView === 'ERA_HISTOGRAM'
      ? eraHistogramData.length
      : archiveDistributionData.length;

  const chartRecommendation = useMemo(
    () => recommendValidChartType(variableView, activePointCount),
    [variableView, activePointCount]
  );

  const quantitativeEntries = useMemo(
    () =>
      investigations
        .filter(
          (inv) =>
            selectedInvestigationId === 'ALL' || inv.id === selectedInvestigationId
        )
        .flatMap((inv) =>
          inv.quantitativeData.map((q) => ({
            investigation: inv,
            datum: q,
          }))
        ),
    [investigations, selectedInvestigationId]
  );

  const qualitativeRecords = useMemo(
    () =>
      investigations.filter(
        (inv) =>
          inv.quantitativeData.length === 0 &&
          (selectedInvestigationId === 'ALL' || inv.id === selectedInvestigationId)
      ),
    [investigations, selectedInvestigationId]
  );

  const filteredQuantitative = useMemo(() => {
    if (auditTab === 'PUBLISHED_VALUES') {
      return quantitativeEntries.filter(
        (e) => e.datum.kind !== 'EXPERIMENTAL_CONDITION_RANGE'
      );
    }
    if (auditTab === 'EXPERIMENTAL_RANGES') {
      return quantitativeEntries.filter(
        (e) => e.datum.kind === 'EXPERIMENTAL_CONDITION_RANGE'
      );
    }
    return quantitativeEntries;
  }, [auditTab, quantitativeEntries]);

  const selectedHasNoQuantitative =
    selectedInvestigation !== null &&
    selectedInvestigation.quantitativeData.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Epistemic Data Audit"
        title="Scientific Data Explorer"
        description="Inspect source-backed quantitative figures, experimental condition bounds, and campaign timelines while separating local dossier summaries from raw NASA PSI telemetry files."
      />

      {/* Mandatory Raw Dataset Availability Notice */}
      <NoticeBanner
        tone="warning"
        title="No verified raw numerical telemetry dataset is currently embedded in the loaded records."
      >
        <p>
          The loaded research database documents NASA PSI dataset IDs, published summary counts, operating ranges, and qualitative findings, without bundling raw AVI/MOV flame videos, spectral TXT logs, or CSV time series. FLAREX never synthesizes raw experimental curves.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="https://psi.nasa.gov/physci/repo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[8px] bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] hover:bg-[var(--accent-blue-hover)]"
          >
            <span>Open NASA PSI Repository</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          <a
            href="https://registry.opendata.aws/nasa-psi/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/50"
          >
            <span>NASA PSI AWS Open Data</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </NoticeBanner>

      {/* Five-Tier Information Taxonomy */}
      <section
        aria-label="Data classification summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5"
      >
        <Card padding="sm">
          <p className="text-xs text-[var(--text-secondary)]">Session Tabular Datasets</p>
          <p className="mt-1 text-xl font-bold font-mono-tabular text-[var(--accent-cyan)]">
            {ingestedDatasets.length} dataset{ingestedDatasets.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            0 bundled telemetry CSVs; import PSI/NTRS files below.
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-[var(--text-secondary)]">Published Numerical Values</p>
          <p className="mt-1 text-xl font-bold font-mono-tabular text-[var(--status-success)]">
            {
              investigations
                .flatMap((i) => i.quantitativeData)
                .filter((d) => d.kind !== 'EXPERIMENTAL_CONDITION_RANGE').length
            }{' '}
            items
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Test counts, thresholds (&lt;100 W), &amp; soot multipliers.
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-[var(--text-secondary)]">Experimental Ranges</p>
          <p className="mt-1 text-xl font-bold font-mono-tabular text-[var(--accent-blue)]">
            {
              investigations
                .flatMap((i) => i.quantitativeData)
                .filter((d) => d.kind === 'EXPERIMENTAL_CONDITION_RANGE').length
            }{' '}
            ranges
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Operating bounds (0–10 kV, 600–1000 K, 0.1–1 μm).
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-[var(--text-secondary)]">Qualitative Observations</p>
          <p className="mt-1 text-xl font-bold font-mono-tabular text-[var(--text-primary)]">
            {investigations.filter((i) => Boolean(i.reportedFindings)).length} records
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Preserved as prose findings; never converted to scores.
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-[var(--text-secondary)]">Descriptive / Planned</p>
          <p className="mt-1 text-xl font-bold font-mono-tabular text-[var(--accent-violet)]">
            {investigations.filter((i) => i.isPlannedOrOngoing).length} suites
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Objectives only (SoFIE, unlaunched ACME parts).
          </p>
        </Card>
      </section>

      {/* FLAREX 5.0 Modules 2, 3, 4 & 7: Raw Data Ingestion, Numerical Analysis & Reproducibility */}
      <NumericalWorkbench
        investigations={investigations}
        ingestedDatasets={ingestedDatasets}
        analysisHistory={analysisHistory}
        onIngestDataset={onIngestDataset}
        onRemoveIngestedDataset={onRemoveIngestedDataset}
        onRecordAnalysisRun={onRecordAnalysisRun}
        onRecordClientError={onRecordClientError}
      />

      {/* Investigation, Unit Family & Variable Selector Controls */}
      <Card as="section" padding="sm" aria-label="Dataset explorer controls" className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="space-y-1">
            <label
              htmlFor="data-investigation-select"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Inspect Investigation Record
            </label>
            <Select
              id="data-investigation-select"
              value={selectedInvestigationId}
              onChange={(e) => setSelectedInvestigationId(e.target.value)}
            >
              <option value="ALL">All Investigations ({investigations.length} records)</option>
              {investigations.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.shortName} —{' '}
                  {inv.quantitativeData.length > 0
                    ? `${inv.quantitativeData.length} documented figures`
                    : 'Qualitative / Descriptive only'}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="data-unit-family-select"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Unit-Compatible Filter
            </label>
            <Select
              id="data-unit-family-select"
              value={unitFamilyFilter}
              onChange={(e) => setUnitFamilyFilter(e.target.value as UnitFamilyId)}
            >
              <option value="ALL">All Unit Families ({investigations.length} studies)</option>
              <option value="COUNTS">Counts &amp; Dimensionless Factors (tests, flames, ratios)</option>
              <option value="THERMAL_POWER">Thermal, Energy &amp; Gas (K, W, psi, O2%)</option>
              <option value="FLOW_ELECTRIC">Airflow &amp; Electric Field (cm/s, kV)</option>
              <option value="SIZE_TIME">Particulate Size &amp; Duration (μm, days)</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="data-variable-select"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Visualization Variable Focus
            </label>
            <Select
              id="data-variable-select"
              value={variableView}
              onChange={(e) =>
                setVariableView(e.target.value as ChartVariableView)
              }
            >
              <option value="PUBLISHED_COUNTS">
                Published Test, Flame &amp; Multiplier Counts (Bar)
              </option>
              <option value="TIMELINE_SPANS">
                Documented Campaign Duration Spans (Bar)
              </option>
              <option value="TIMELINE_SCATTER">
                Campaign Start Year vs. Span (Scatter Plot)
              </option>
              <option value="ERA_HISTOGRAM">
                Campaign Start Era Distribution (Histogram)
              </option>
              <option value="ARCHIVE_DISTRIBUTION">
                Database Archive Availability Distribution (Bar)
              </option>
              <option value="EXPERIMENTAL_BOUNDS">
                Documented Operating Upper Bounds (Ranges Only)
              </option>
            </Select>
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">Auto-Chart: {chartRecommendation.chartType}</Badge>
            <span className="text-[var(--text-secondary)]">{chartRecommendation.reason}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  exportDatasetCatalogCsv(datasetCatalog),
                  'flarex_dataset_catalog.csv',
                  'text/csv;charset=utf-8'
                )
              }
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  exportDatasetCatalogJson(datasetCatalog),
                  'flarex_dataset_catalog.json',
                  'application/json;charset=utf-8'
                )
              }
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export JSON</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Honest Empty State if a Specific Qualitative-Only Study is Selected */}
      {selectedHasNoQuantitative && selectedInvestigation ? (
        <EmptyState
          icon={<Database className="w-5 h-5" aria-hidden="true" />}
          title={`No verified numerical dataset is currently available for ${selectedInvestigation.shortName}.`}
          description={`${selectedInvestigation.dataAvailabilityLabel}. ${
            selectedInvestigation.reportedFindings ?? selectedInvestigation.overview
          }`}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <a
                href={selectedInvestigation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-[8px] bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] hover:bg-[var(--accent-blue-hover)]"
              >
                <span>Inspect Official Source</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => onOpenInvestigation(selectedInvestigation.id)}
                className="px-3.5 py-2 text-xs font-medium rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer"
              >
                Open Full Study Profile
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvestigationId('ALL')}
                className="px-3.5 py-2 text-xs font-medium rounded-[8px] text-[var(--accent-blue)] hover:underline cursor-pointer"
              >
                Show All Investigations
              </button>
            </div>
          }
        />
      ) : (
        /* Verified Source-Supported Charts */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(variableView === 'PUBLISHED_COUNTS' ||
            variableView === 'EXPERIMENTAL_BOUNDS' ||
            variableView === 'ARCHIVE_DISTRIBUTION' ||
            variableView === 'ERA_HISTOGRAM' ||
            variableView === 'TIMELINE_SCATTER') && (
            <Card as="section" className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
                    <span>
                      {variableView === 'EXPERIMENTAL_BOUNDS'
                        ? 'Experimental Condition Bounds (Min / Max)'
                        : variableView === 'TIMELINE_SCATTER'
                        ? 'Campaign Start Year vs. Active Span'
                        : variableView === 'ERA_HISTOGRAM'
                        ? 'Campaign Start Era Histogram'
                        : variableView === 'ARCHIVE_DISTRIBUTION'
                        ? 'Archive Availability Distribution'
                        : 'Published Experiment & Count Figures (DB-Derived)'}
                    </span>
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {variableView === 'EXPERIMENTAL_BOUNDS'
                      ? 'Heterogeneous physical units (kV, K, μm, days, tests) — inspect tooltip per bar for unit & source.'
                      : variableView === 'TIMELINE_SCATTER'
                      ? 'X-axis: Start Year · Y-axis: Calendar Duration (years) · Source: Curated NASA Dossier'
                      : variableView === 'ERA_HISTOGRAM'
                      ? 'X-axis: Campaign Era Bin · Y-axis: Study Frequency (count)'
                      : variableView === 'ARCHIVE_DISTRIBUTION'
                      ? 'X-axis: Availability Classification · Y-axis: Number of Records (count)'
                      : 'Extracted dynamically from researchDatabase.json quantitativeData records'}
                  </p>
                </div>
                <Badge tone="blue">Source-Backed</Badge>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {variableView === 'TIMELINE_SCATTER' ? (
                    <ScatterChart margin={{ top: 10, right: 20, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis
                        type="number"
                        dataKey="startYear"
                        name="Start Year"
                        domain={['dataMin - 1', 'dataMax + 1']}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        label={{
                          value: 'Campaign Start Year',
                          position: 'insideBottom',
                          offset: -10,
                          fill: 'var(--text-secondary)',
                          fontSize: 11,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="durationYears"
                        name="Duration (Years)"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        label={{
                          value: 'Span (Years)',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--text-secondary)',
                          fontSize: 11,
                        }}
                      />
                      <ZAxis range={[70, 140]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value, name) => [String(value ?? ''), String(name ?? '')]}
                        labelFormatter={(_label, items) => {
                          const p = items?.[0]?.payload as { name?: string; timeframe?: string } | undefined;
                          return p ? `${p.name} (${p.timeframe})` : '';
                        }}
                      />
                      <Scatter
                        name="Documented Investigation Campaigns"
                        data={timelineChartData}
                        fill="var(--accent-cyan)"
                      />
                    </ScatterChart>
                  ) : variableView === 'ERA_HISTOGRAM' ? (
                    <BarChart
                      data={eraHistogramData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
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
                      />
                      <Bar
                        dataKey="count"
                        name="Studies in Era"
                        fill="var(--accent-blue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : variableView === 'ARCHIVE_DISTRIBUTION' ? (
                    <BarChart
                      data={archiveDistributionData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        label={{
                          value: 'Records',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--text-secondary)',
                          fontSize: 11,
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Curated Records"
                        fill="var(--accent-cyan)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : variableView === 'EXPERIMENTAL_BOUNDS' &&
                  experimentalRangeChartData.length > 0 ? (
                    <BarChart
                      data={experimentalRangeChartData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 28 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-subtle)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        label={{
                          value: 'Reported Bound',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--text-secondary)',
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value, name, item) => {
                          const p = item?.payload as
                            | { unit?: string; fullLabel?: string; source?: string }
                            | undefined;
                          return [
                            `${value ?? ''} ${p?.unit ?? ''}`,
                            `${name} (${p?.fullLabel ?? ''})`,
                          ];
                        }}
                      />
                      <Bar
                        dataKey="minVal"
                        name="Lower Bound"
                        fill="var(--accent-cyan)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="maxVal"
                        name="Upper Bound"
                        fill="var(--accent-blue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <BarChart
                      data={publishedCountsChartData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-subtle)"
                      />
                      <XAxis
                        dataKey="experiment"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        label={{
                          value: 'Reported Count',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--text-secondary)',
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value, _name, item) => {
                          const p = item?.payload as
                            | { unit?: string; metric?: string }
                            | undefined;
                          return [
                            `${value ?? ''} ${p?.unit ?? ''}`,
                            p?.metric ?? 'Count',
                          ];
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Documented Campaign Count"
                        fill="var(--accent-blue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-1.5">
                <p>
                  <strong className="text-[var(--text-primary)]">Sample &amp; Context:</strong>{' '}
                  {variableView === 'TIMELINE_SCATTER'
                    ? 'Shuttle, ISS (MSG/CIR/MDCA), Cygnus cargo bay, and 1g UL ground baseline.'
                    : variableView === 'ERA_HISTOGRAM'
                    ? `${investigations.length} records binned by documented campaign start year.`
                    : variableView === 'ARCHIVE_DISTRIBUTION'
                    ? `${investigations.length} curated records indexed across PSI, NTRS, and terrestrial baselines.`
                    : 'All plotted counts and thresholds come directly from embedded quantitativeData entries in researchDatabase.json.'}
                </p>
                <p className="text-[var(--status-warning)]">
                  <strong>Chart &amp; Time-Series Boundary:</strong> {chartRecommendation.lineChartReason}
                </p>
              </div>
            </Card>
          )}

          {/* Chart 2: Documented Investigation Active Window Durations */}
          <Card
            as="section"
            className={`space-y-4 ${
              variableView === 'TIMELINE_SPANS' ? 'lg:col-span-2' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                  Documented Campaign Duration (Years)
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Units: Calendar Years (inclusive window) · Source: Research Dossier &amp; Structured JSON
                </p>
              </div>
              <Badge tone="violet">Timeline Audit</Badge>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={timelineChartData}
                  layout="vertical"
                  margin={{ top: 6, right: 20, left: 8, bottom: 16 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-subtle)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                    label={{
                      value: 'Span (Years)',
                      position: 'insideBottom',
                      offset: -8,
                      fill: 'var(--text-secondary)',
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    interval={0}
                    width={148}
                    tick={{ fill: 'var(--text-primary)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value, _name, item) => {
                      const p = item?.payload as
                        | { timeframe?: string; gravity?: string; status?: string }
                        | undefined;
                      return [
                        `${value ?? ''} yr(s) (${p?.timeframe ?? ''})`,
                        `${p?.gravity ?? ''} · ${p?.status ?? ''}`,
                      ];
                    }}
                  />
                  <Bar
                    dataKey="durationYears"
                    name="Campaign Span (Calendar Years)"
                    fill="var(--accent-violet)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-1.5">
              <p>
                <strong className="text-[var(--text-primary)]">Experimental Conditions:</strong>{' '}
                Covers Shuttle (1997), ISS MSG/CIR/MDCA, Cygnus Saffire (2016–2021), and 2020 terrestrial UL battery workshop.
              </p>
              <p className="text-[var(--status-warning)]">
                <strong>Data-Quality Note:</strong> Multi-year windows for ACME (2017–2026) and SoFIE (2021–2027) reflect program flight windows with shifted launches, not continuous active burning hours.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Structured Dataset Metadata Catalog Table */}
      <Card as="section" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
              Dataset Metadata Registry ({datasetCatalog.length} entries)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Every local quantitative bound and external PSI/NTRS dataset pointer with exact units, measurement context, availability status, and original source link.
            </p>
          </div>
          <Badge tone="neutral">{unitFamilyFilter === 'ALL' ? 'All Units' : unitFamilyFilter}</Badge>
        </div>

        <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse min-w-[780px] text-xs">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] text-[11px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                <th scope="col" className="p-3">Dataset / Metric Title</th>
                <th scope="col" className="p-3">Investigation</th>
                <th scope="col" className="p-3">Repository</th>
                <th scope="col" className="p-3">Units &amp; Type</th>
                <th scope="col" className="p-3">Availability</th>
                <th scope="col" className="p-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {datasetCatalog.slice(0, 18).map((item) => (
                <tr key={item.id} className="hover:bg-[var(--bg-elevated)]/40">
                  <td className="p-3 align-top">
                    <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2">
                      {item.measurementContext}
                    </p>
                  </td>
                  <td className="p-3 align-top whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenInvestigation(item.investigationId)}
                      className="text-[var(--accent-blue)] font-medium hover:underline cursor-pointer"
                    >
                      {item.investigationShortName}
                    </button>
                  </td>
                  <td className="p-3 align-top font-mono-tabular text-[var(--text-secondary)]">
                    {item.repository}
                  </td>
                  <td className="p-3 align-top">
                    <span className="block font-mono-tabular text-[var(--text-primary)]">
                      {item.units.join(', ')}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {item.dataType}
                    </span>
                  </td>
                  <td className="p-3 align-top text-[var(--text-secondary)]">
                    {item.availabilityLabel}
                  </td>
                  <td className="p-3 align-top whitespace-nowrap">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Module 5: Scientific Trend Analysis (Computed strictly from FLAREX DB) */}
      <Card as="section" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Scientific Trend Analysis Across Indexed Studies</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {trends.scopeNotice}
            </p>
          </div>
          <Badge tone="cyan">DB-Derived Trends</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Most Studied Materials / Fuel Groups
            </p>
            <div className="space-y-1.5">
              {trends.materialFrequency.slice(0, 6).map((m) => (
                <div key={m.label} className="space-y-0.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-secondary)] truncate">{m.label}</span>
                    <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {m.count}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-blue)]"
                      style={{
                        width: `${Math.round((m.count / investigations.length) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Environmental Variables Representation
            </p>
            <div className="space-y-1.5">
              {trends.variableCoverage.map((v) => (
                <div key={v.label} className="space-y-0.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-secondary)] truncate">{v.label}</span>
                    <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {v.count}/{investigations.length}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-cyan)]"
                      style={{
                        width: `${Math.round((v.count / investigations.length) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Sensor &amp; Measurement Method Adoption
            </p>
            <div className="space-y-1.5">
              {trends.sensorAndMethodCoverage.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)] truncate">{s.label}</span>
                  <span className="font-mono-tabular font-semibold text-[var(--accent-violet)]">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
              <p className="text-[11px] font-semibold text-[var(--status-warning)]">
                Underrepresented Areas in FLAREX:
              </p>
              {trends.underrepresentedAreas.map((u) => (
                <p key={u.area} className="text-[11px] text-[var(--text-muted)]">
                  • {u.area}: {u.recordCount} records
                </p>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Module 12: Automated Data Quality Monitoring & Live Link Check */}
      <Card as="section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
              Data Quality Monitoring &amp; URL Availability Audit
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Evaluated {qualityAudit.totalChecksEvaluated} checks across {dbAudit.totalRecords} records: Critical ({qualityAudit.criticalCount}), Warnings ({qualityAudit.warningCount}), Info Notices ({qualityAudit.infoCount}), Duplicate IDs ({dbAudit.duplicateIds.length}), Avg. Completeness ({qualityAudit.averageCompletenessPct}%).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={qualityAudit.criticalCount === 0 ? 'success' : 'danger'}>
              {qualityAudit.criticalCount === 0 ? '0 Critical Errors' : `${qualityAudit.criticalCount} Critical`}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={checkingLinks}
              onClick={() => void runLiveLinkCheck()}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${checkingLinks ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{checkingLinks ? 'Verifying URLs…' : 'Verify NASA Links Live'}</span>
            </Button>
          </div>
        </div>

        {lastAuditRunAt && linkResults.length > 0 && (
          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2 text-xs">
            <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              Last live check completed: {new Date(lastAuditRunAt).toLocaleString()}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {linkResults.map((res) => (
                <div
                  key={res.url}
                  className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]"
                >
                  <span className="truncate text-[var(--text-primary)]">{res.label}</span>
                  <span
                    className={`font-mono-tabular text-[11px] shrink-0 inline-flex items-center gap-1 ${
                      res.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    {res.status ? `HTTP ${res.status}` : res.note}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {qualityAudit.issues.slice(0, 12).map((iss) => (
            <div
              key={iss.id}
              className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <span className="font-semibold text-[var(--text-primary)]">
                  [{iss.category}] {iss.targetName}:
                </span>{' '}
                <span className="text-[var(--text-secondary)]">{iss.message}</span>
              </div>
              <Badge
                tone={
                  iss.severity === 'CRITICAL'
                    ? 'danger'
                    : iss.severity === 'WARNING'
                    ? 'warning'
                    : 'neutral'
                }
              >
                {iss.severity}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* FLAREX 5.0 Module 11: Live System Health & AI Telemetry Monitoring */}
      <SystemHealthPanel
        ingestedDatasets={ingestedDatasets}
        analysisHistory={analysisHistory}
        clientErrors={clientErrors}
      />

      {/* Filterable Epistemic Ledger */}
      <Card as="section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
              Evidence &amp; Measurement Audit Ledger
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Inspect how every numerical figure and qualitative study in FLAREX is classified and cited.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            {(
              [
                { id: 'ALL', label: 'All Items' },
                { id: 'PUBLISHED_VALUES', label: 'Published Values' },
                { id: 'EXPERIMENTAL_RANGES', label: 'Experimental Ranges' },
                { id: 'QUALITATIVE_ONLY', label: 'Qualitative Only' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAuditTab(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
                  auditTab === tab.id
                    ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {auditTab !== 'QUALITATIVE_ONLY' && filteredQuantitative.length > 0 && (
          <div className="space-y-3">
            {filteredQuantitative.map(({ investigation, datum }) => (
              <div
                key={datum.id}
                className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      tone={
                        datum.kind === 'EXPERIMENTAL_CONDITION_RANGE'
                          ? 'blue'
                          : 'success'
                      }
                    >
                      {datum.kind === 'EXPERIMENTAL_CONDITION_RANGE'
                        ? 'EXPERIMENTAL CONDITION (NOT OUTCOME)'
                        : datum.kind.replace(/_/g, ' ')}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => onOpenInvestigation(investigation.id)}
                      className="text-[var(--accent-blue)] hover:underline font-semibold cursor-pointer"
                    >
                      {investigation.shortName}
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {datum.label}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {datum.conditionContext} · Source: {datum.sourceCitation}
                  </p>
                  <p className="text-xs text-[var(--status-warning)] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{datum.qualityNote}</span>
                  </p>
                </div>

                <div className="shrink-0 text-left md:text-right">
                  <p className="font-mono-tabular text-xl font-bold text-[var(--text-primary)]">
                    {datum.valueDisplay}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Unit: {datum.unit}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {(auditTab === 'ALL' || auditTab === 'QUALITATIVE_ONLY') &&
          qualitativeRecords.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Records Without Embedded Numerical Summaries ({qualitativeRecords.length} records — Qualitative / Descriptive / Planned)
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {qualitativeRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenInvestigation(rec.id)}
                        className="text-sm font-semibold text-[var(--accent-blue)] hover:underline text-left cursor-pointer"
                      >
                        {rec.shortName}
                      </button>
                      <Badge tone={rec.isPlannedOrOngoing ? 'violet' : 'neutral'}>
                        {rec.isPlannedOrOngoing
                          ? 'Descriptive / Planned'
                          : rec.isMicrogravity
                          ? 'Qualitative Summary'
                          : 'Terrestrial 1g'}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {rec.reportedFindings ?? rec.overview}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                      <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{rec.dataAvailabilityLabel}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
      </Card>
    </div>
  );
}
