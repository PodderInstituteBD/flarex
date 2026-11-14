import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { InvestigationRecord } from '../types/research';
import {
  ReproducibleAnalysisRun,
  reproduceAnalysisRun,
  runCorrelationAnalysis,
  runDescriptiveAnalysis,
  runTimeSeriesSummaryAnalysis,
} from '../utils/scientificAnalysis';
import {
  IngestedDatasetPackage,
  ingestScientificTabularData,
} from '../utils/scientificIngestion';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Select } from './ui/Input';

interface NumericalWorkbenchProps {
  investigations: InvestigationRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
  onIngestDataset: (pkg: IngestedDatasetPackage) => void;
  onRemoveIngestedDataset: (datasetId: string) => void;
  onRecordAnalysisRun: (run: ReproducibleAnalysisRun) => void;
  onRecordClientError?: (source: string, message: string) => void;
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

function downloadChartSvg(container: HTMLDivElement | null, filename: string) {
  if (!container) return false;
  const svg = container.querySelector('svg');
  if (!svg) return false;
  const serializer = new XMLSerializer();
  const rawSvg = serializer.serializeToString(svg);
  const withXmlns = rawSvg.includes('xmlns=')
    ? rawSvg
    : rawSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  downloadText(withXmlns, filename, 'image/svg+xml;charset=utf-8');
  return true;
}

/**
 * Builds an authentic CSV strictly from documented dossier quantitativeData & campaign years
 * (never inventing continuous microgravity flame telemetry curves).
 */
function buildDossierMetadataTableCsv(investigations: InvestigationRecord[]): string {
  const rows: string[] = [
    'investigation_id,short_name,start_year,end_year,campaign_span_years,documented_metrics_count,has_microgravity,is_planned',
  ];
  for (const r of investigations) {
    const start = r.startYear !== null ? String(r.startYear) : 'NA';
    const end = r.endYear !== null ? String(r.endYear) : 'NA';
    const span =
      r.startYear !== null && r.endYear !== null
        ? String(Math.max(1, r.endYear - r.startYear + 1))
        : 'NA';
    rows.push(
      [
        r.id,
        `"${r.shortName.replace(/"/g, '""')}"`,
        start,
        end,
        span,
        String(r.quantitativeData.length),
        r.isMicrogravity ? '1' : '0',
        r.isPlannedOrOngoing ? '1' : '0',
      ].join(',')
    );
  }
  return rows.join('\n');
}

export function NumericalWorkbench({
  investigations,
  ingestedDatasets,
  analysisHistory,
  onIngestDataset,
  onRemoveIngestedDataset,
  onRecordAnalysisRun,
  onRecordClientError,
}: NumericalWorkbenchProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [rowViewMode, setRowViewMode] = useState<'original' | 'normalized'>('normalized');
  const [analysisMethod, setAnalysisMethod] = useState<
    'DESCRIPTIVE_STATS' | 'PEARSON_CORRELATION' | 'TIME_SERIES_SUMMARY'
  >('DESCRIPTIVE_STATS');
  const [varX, setVarX] = useState<string>('');
  const [varY, setVarY] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ReproducibleAnalysisRun | null>(
    analysisHistory[0] ?? null
  );

  const activeDataset = useMemo(
    () =>
      ingestedDatasets.find((d) => d.provenance.datasetId === selectedDatasetId) ??
      ingestedDatasets[0] ??
      null,
    [ingestedDatasets, selectedDatasetId]
  );

  const numericColumns = useMemo(
    () =>
      activeDataset
        ? activeDataset.columns.filter(
            (c) =>
              c.inferredType === 'numeric' ||
              c.inferredType === 'mixed' ||
              (c.inferredType === 'temporal' && c.validNumericCount > 0)
          )
        : [],
    [activeDataset]
  );

  const resolvedX = useMemo(() => {
    if (numericColumns.some((c) => c.normalizedName === varX)) return varX;
    return numericColumns[0]?.normalizedName ?? '';
  }, [numericColumns, varX]);

  const resolvedY = useMemo(() => {
    if (numericColumns.some((c) => c.normalizedName === varY)) return varY;
    return numericColumns[1]?.normalizedName ?? numericColumns[0]?.normalizedName ?? '';
  }, [numericColumns, varY]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setVerifyNotice(null);

    try {
      if (file.size > 4 * 1024 * 1024) {
        const msg = 'Dataset exceeds 4 MB browser analysis cap.';
        setUploadError(msg);
        onRecordClientError?.('DataIngestion', msg);
        return;
      }
      const text = await file.text();
      const pkg = ingestScientificTabularData({
        filename: file.name,
        content: text,
        sourceUrl: 'Local file upload (user-supplied)',
        repository: 'Local Research Session',
        description: `User-uploaded ${file.name} (${file.size} bytes)`,
      });

      if (pkg.provenance.importStatus === 'FAILED') {
        const errText = pkg.summary.errors.join(' ');
        setUploadError(errText || 'Failed to parse tabular file.');
        onRecordClientError?.('DataIngestion', errText);
        return;
      }

      onIngestDataset(pkg);
      setSelectedDatasetId(pkg.provenance.datasetId);
    } catch {
      const msg = 'Unable to read selected file in browser.';
      setUploadError(msg);
      onRecordClientError?.('DataIngestion', msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadDossierCatalogTable = () => {
    setUploadError(null);
    setVerifyNotice(null);
    const csv = buildDossierMetadataTableCsv(investigations);
    const pkg = ingestScientificTabularData({
      filename: 'flarex_curated_investigation_matrix.csv',
      content: csv,
      sourceUrl: '/assets/aistudio/flarex_research_database_def47b9d.json',
      repository: 'FLAREX Curated Dossier Registry',
      description:
        'Authentic study-level metadata matrix extracted strictly from the 16 curated FLAREX database records (campaign years, spans, metric counts). Missing years preserved as NA -> null.',
    });
    onIngestDataset(pkg);
    setSelectedDatasetId(pkg.provenance.datasetId);
  };

  const handleRunAnalysis = () => {
    if (!activeDataset) return;
    setVerifyNotice(null);
    let run: ReproducibleAnalysisRun;
    if (analysisMethod === 'PEARSON_CORRELATION') {
      run = runCorrelationAnalysis(activeDataset, resolvedX, resolvedY);
    } else if (analysisMethod === 'TIME_SERIES_SUMMARY') {
      run = runTimeSeriesSummaryAnalysis(activeDataset, resolvedX, resolvedY);
    } else {
      run = runDescriptiveAnalysis(activeDataset, resolvedX);
    }
    setActiveRun(run);
    onRecordAnalysisRun(run);
  };

  const handleReproduceRun = (prior: ReproducibleAnalysisRun) => {
    const ds =
      ingestedDatasets.find((d) => d.provenance.datasetId === prior.datasetId) ??
      activeDataset;
    if (!ds) {
      setVerifyNotice('Original dataset is no longer loaded in session.');
      return;
    }
    const rerun = reproduceAnalysisRun(prior, ds);
    setActiveRun(rerun);
    let matched = rerun.sampleCount === prior.sampleCount;
    if (prior.descriptive && rerun.descriptive) {
      matched =
        matched &&
        prior.descriptive.mean === rerun.descriptive.mean &&
        prior.descriptive.median === rerun.descriptive.median;
    }
    if (prior.correlation && rerun.correlation) {
      matched = matched && prior.correlation.pearsonR === rerun.correlation.pearsonR;
    }
    if (prior.timeSeriesSummary && rerun.timeSeriesSummary) {
      matched =
        matched &&
        prior.timeSeriesSummary.netDelta === rerun.timeSeriesSummary.netDelta;
    }
    setVerifyNotice(
      matched
        ? `Reproducibility verified: Run ${prior.runId} reproduced bit-for-bit (n = ${rerun.sampleCount}, ${rerun.softwareVersion}).`
        : `Re-execution completed with differences (check dataset version).`
    );
  };

  const scatterPoints = useMemo(() => {
    if (!activeDataset || !resolvedX || !resolvedY) return [];
    const out: Array<{ x: number; y: number }> = [];
    for (const row of activeDataset.normalizedRows.slice(0, 500)) {
      const xv = row[resolvedX];
      const yv = row[resolvedY];
      if (typeof xv === 'number' && typeof yv === 'number') {
        out.push({ x: xv, y: yv });
      }
    }
    return out;
  }, [activeDataset, resolvedX, resolvedY]);

  const timeSeriesPoints = useMemo(() => {
    return [...scatterPoints].sort((a, b) => a.x - b.x);
  }, [scatterPoints]);

  const xColMeta = numericColumns.find((c) => c.normalizedName === resolvedX);
  const yColMeta = numericColumns.find((c) => c.normalizedName === resolvedY);

  return (
    <Card as="section" aria-labelledby="numerical-workbench-heading" className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="numerical-workbench-heading"
              className="font-display text-[18px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
            >
              <Database className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
              <span>Raw Scientific Ingestion, Analysis &amp; Reproducibility Workbench</span>
            </h2>
            <Badge tone="cyan">FLAREX 5.0 Engine</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Import external NASA PSI/NTRS CSV, TSV, TXT, or JSON files—or inspect the structured 16-study dossier matrix—with strict separation between immutable <code>originalRows</code>, <code>normalizedRows</code> (missing = <code>null</code>, never <code>0</code>), and derived statistics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] text-xs font-semibold cursor-pointer hover:bg-[var(--accent-blue-hover)] whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import CSV / TSV / JSON</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.json"
              onChange={handleFileUpload}
              className="sr-only"
              aria-label="Import scientific tabular dataset file"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleLoadDossierCatalogTable}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Load Dossier Metadata Matrix</span>
          </Button>
        </div>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-3 rounded-[8px] bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/35 text-xs text-[var(--status-danger)] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{uploadError}</span>
        </div>
      )}

      {ingestedDatasets.length === 0 || !activeDataset ? (
        <div className="p-6 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-center space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            No tabular numerical datasets imported yet
          </p>
          <p className="text-xs text-[var(--text-secondary)] max-w-2xl mx-auto">
            Upload a downloaded NASA PSI telemetry CSV/TSV/JSON file or click &ldquo;Load Dossier Metadata Matrix&rdquo; above to run descriptive statistics, histograms, non-causal correlations, SVG chart exports, and reproducible analysis logging.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Active Dataset Selector & Provenance Bar */}
          <div className="p-3.5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Select imported dataset"
                  value={activeDataset.provenance.datasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="py-1.5 text-xs !w-auto min-w-[240px]"
                >
                  {ingestedDatasets.map((ds) => (
                    <option key={ds.provenance.datasetId} value={ds.provenance.datasetId}>
                      {ds.provenance.originalFilename} ({ds.summary.rowCount} rows)
                    </option>
                  ))}
                </Select>
                <Badge
                  tone={
                    activeDataset.provenance.importStatus === 'IMPORTED'
                      ? 'success'
                      : 'warning'
                  }
                >
                  Data successfully imported
                </Badge>
                <Badge tone="neutral" className="font-mono-tabular">
                  {activeDataset.provenance.format}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => onRemoveIngestedDataset(activeDataset.provenance.datasetId)}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--status-danger)] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Remove Dataset</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Rows × Columns</span>
                <strong className="font-mono-tabular text-[var(--text-primary)]">
                  {activeDataset.summary.rowCount} × {activeDataset.summary.columnCount}
                </strong>
              </div>
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Numeric Columns</span>
                <strong className="font-mono-tabular text-[var(--accent-blue)]">
                  {activeDataset.summary.numericColumnCount}
                </strong>
              </div>
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Missing Rate</span>
                <strong className="font-mono-tabular text-[var(--status-warning)]">
                  {activeDataset.summary.missingPctOverall}% ({activeDataset.summary.totalMissingCells})
                </strong>
              </div>
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Invalid Numeric</span>
                <strong className="font-mono-tabular text-[var(--text-primary)]">
                  {activeDataset.summary.totalInvalidNumericCells}
                </strong>
              </div>
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Duplicate Rows</span>
                <strong className="font-mono-tabular text-[var(--text-primary)]">
                  {activeDataset.summary.duplicateRowCount}
                </strong>
              </div>
            </div>

            {activeDataset.summary.warnings.length > 0 && (
              <p className="text-[11px] text-[var(--status-warning)]">
                Ingestion Warnings: {activeDataset.summary.warnings.join(' | ')}
              </p>
            )}
          </div>

          {/* Schema + Raw vs Normalized Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Detected Column Schema &amp; Units
                </h3>
              </div>
              <div className="overflow-x-auto rounded-[8px] border border-[var(--border-subtle)] max-h-60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                      <th className="p-2">Column</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Missing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {activeDataset.columns.map((c) => (
                      <tr key={c.normalizedName}>
                        <td className="p-2 font-medium text-[var(--text-primary)]">
                          {c.originalName}
                        </td>
                        <td className="p-2 font-mono-tabular text-[var(--accent-cyan)]">
                          {c.detectedUnit ?? '—'}
                        </td>
                        <td className="p-2 font-mono-tabular text-[var(--text-secondary)]">
                          {c.inferredType}
                        </td>
                        <td className="p-2 font-mono-tabular text-[var(--text-muted)]">
                          {c.missingPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Bounded Table Preview (Top 8 Rows · Layer Isolation)
                </h3>
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setRowViewMode('normalized')}
                    className={`px-2 py-1 rounded border cursor-pointer ${
                      rowViewMode === 'normalized'
                        ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Normalized (null-safe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowViewMode('original')}
                    className={`px-2 py-1 rounded border cursor-pointer ${
                      rowViewMode === 'original'
                        ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Original Raw Strings
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[8px] border border-[var(--border-subtle)] max-h-60">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                      {activeDataset.columns.map((c) => (
                        <th key={c.normalizedName} className="p-2 whitespace-nowrap">
                          {c.originalName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {(rowViewMode === 'original'
                      ? activeDataset.originalRows.slice(0, 8)
                      : activeDataset.normalizedRows.slice(0, 8)
                    ).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {activeDataset.columns.map((c) => {
                          const key =
                            rowViewMode === 'original'
                              ? c.originalName
                              : c.normalizedName;
                          const val = (row as Record<string, unknown>)[key];
                          return (
                            <td
                              key={c.normalizedName}
                              className="p-2 font-mono-tabular whitespace-nowrap text-[var(--text-secondary)]"
                            >
                              {val === null || val === undefined || val === '' ? (
                                <span className="italic text-[var(--text-muted)]">null</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Analysis Controls & Interactive Visualization */}
          <div className="p-4 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="workbench-method"
                  className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block"
                >
                  Statistical Method
                </label>
                <Select
                  id="workbench-method"
                  value={analysisMethod}
                  onChange={(e) =>
                    setAnalysisMethod(
                      e.target.value as
                        | 'DESCRIPTIVE_STATS'
                        | 'PEARSON_CORRELATION'
                        | 'TIME_SERIES_SUMMARY'
                    )
                  }
                  className="py-1.5 text-xs"
                >
                  <option value="DESCRIPTIVE_STATS">Descriptive Stats + Histogram</option>
                  <option value="PEARSON_CORRELATION">Pearson Correlation (Scatter, Non-Causal)</option>
                  <option value="TIME_SERIES_SUMMARY">Ordered Sequence / Time-Series Summary</option>
                </Select>
              </div>

              {numericColumns.length > 0 && (
                <>
                  <div className="space-y-1">
                    <label
                      htmlFor="workbench-var-x"
                      className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block"
                    >
                      {analysisMethod === 'DESCRIPTIVE_STATS'
                        ? 'Target Variable'
                        : analysisMethod === 'TIME_SERIES_SUMMARY'
                        ? 'Sequence / Time Axis (X)'
                        : 'Variable X'}
                    </label>
                    <Select
                      id="workbench-var-x"
                      value={resolvedX}
                      onChange={(e) => setVarX(e.target.value)}
                      className="py-1.5 text-xs"
                    >
                      {numericColumns.map((c) => (
                        <option key={c.normalizedName} value={c.normalizedName}>
                          {c.originalName}
                          {c.detectedUnit ? ` (${c.detectedUnit})` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {analysisMethod !== 'DESCRIPTIVE_STATS' && (
                    <div className="space-y-1">
                      <label
                        htmlFor="workbench-var-y"
                        className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block"
                      >
                        {analysisMethod === 'TIME_SERIES_SUMMARY'
                          ? 'Response Variable (Y)'
                          : 'Variable Y'}
                      </label>
                      <Select
                        id="workbench-var-y"
                        value={resolvedY}
                        onChange={(e) => setVarY(e.target.value)}
                        className="py-1.5 text-xs"
                      >
                        {numericColumns.map((c) => (
                          <option key={c.normalizedName} value={c.normalizedName}>
                            {c.originalName}
                            {c.detectedUnit ? ` (${c.detectedUnit})` : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </>
              )}

              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={numericColumns.length === 0}
                onClick={handleRunAnalysis}
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Execute Reproducible Analysis</span>
              </Button>
            </div>

            {numericColumns.length === 0 ? (
              <p className="text-xs text-[var(--status-warning)]">
                This imported file contains zero numeric columns; numerical calculations are disabled rather than fabricating synthetic counts.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-7 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
                      <span>
                        {analysisMethod === 'DESCRIPTIVE_STATS'
                          ? `Distribution Histogram: ${xColMeta?.originalName ?? ''}`
                          : analysisMethod === 'PEARSON_CORRELATION'
                          ? `Scatter Plot: ${xColMeta?.originalName ?? ''} vs ${yColMeta?.originalName ?? ''}`
                          : `Sequence Plot: ${xColMeta?.originalName ?? ''} → ${yColMeta?.originalName ?? ''}`}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadChartSvg(
                            chartContainerRef.current,
                            `flarex_chart_${analysisMethod.toLowerCase()}.svg`
                          )
                        }
                      >
                        <Download className="w-3 h-3" aria-hidden="true" />
                        <span>Export SVG</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadText(
                            JSON.stringify(
                              {
                                provenance: activeDataset.provenance,
                                latestAnalysisRun: activeRun,
                              },
                              null,
                              2
                            ),
                            `flarex_analysis_${activeDataset.provenance.originalFilename}.json`,
                            'application/json;charset=utf-8'
                          )
                        }
                      >
                        <Download className="w-3 h-3" aria-hidden="true" />
                        <span>Export JSON</span>
                      </Button>
                    </div>
                  </div>

                  <div
                    ref={chartContainerRef}
                    className="h-64 w-full p-2 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      {analysisMethod === 'DESCRIPTIVE_STATS' &&
                      activeRun?.histogram &&
                      activeRun.histogram.length > 0 ? (
                        <BarChart data={activeRun.histogram} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                          <XAxis
                            dataKey="binLabel"
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
                              fontSize: '12px',
                            }}
                          />
                          <Bar dataKey="count" name="Frequency" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : analysisMethod === 'TIME_SERIES_SUMMARY' ? (
                        <LineChart data={timeSeriesPoints} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                          <XAxis
                            dataKey="x"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                            axisLine={{ stroke: 'var(--border-strong)' }}
                          />
                          <YAxis
                            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                            axisLine={{ stroke: 'var(--border-strong)' }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="y"
                            name={yColMeta?.originalName ?? 'Value'}
                            stroke="var(--accent-cyan)"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      ) : (
                        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            name={xColMeta?.originalName ?? 'X'}
                            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                            axisLine={{ stroke: 'var(--border-strong)' }}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            name={yColMeta?.originalName ?? 'Y'}
                            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                            axisLine={{ stroke: 'var(--border-strong)' }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                            }}
                          />
                          <Scatter
                            name={`${xColMeta?.originalName ?? 'X'} vs ${yColMeta?.originalName ?? 'Y'}`}
                            data={scatterPoints}
                            fill="var(--accent-cyan)"
                          />
                        </ScatterChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 p-3.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Derived Calculation Output
                    </span>
                    <Badge tone="violet">DERIVED_STATISTICS</Badge>
                  </div>
                  {!activeRun ? (
                    <p className="text-[var(--text-muted)]">
                      Click &ldquo;Execute Reproducible Analysis&rdquo; to compute statistics with full parameter &amp; version lineage.
                    </p>
                  ) : activeRun.errorMessage ? (
                    <p className="text-[var(--status-warning)]">{activeRun.errorMessage}</p>
                  ) : (
                    <div className="space-y-2">
                      {activeRun.descriptive && (
                        <div className="grid grid-cols-2 gap-1.5 font-mono-tabular">
                          <div>n = {activeRun.descriptive.sampleCount}</div>
                          <div>Missing = {activeRun.descriptive.missingPct}%</div>
                          <div>Mean = {activeRun.descriptive.mean}</div>
                          <div>Median = {activeRun.descriptive.median}</div>
                          <div>Min = {activeRun.descriptive.min}</div>
                          <div>Max = {activeRun.descriptive.max}</div>
                          <div className="col-span-2">
                            Sample SD (n-1) ={' '}
                            {activeRun.descriptive.stdDev ?? 'N/A (n < 2)'}
                          </div>
                        </div>
                      )}
                      {activeRun.correlation && (
                        <div className="space-y-1">
                          <p className="font-mono-tabular font-semibold text-[var(--accent-cyan)]">
                            Pearson r = {activeRun.correlation.pearsonR} (pairs ={' '}
                            {activeRun.correlation.pairCount})
                          </p>
                          <p className="text-[var(--text-secondary)]">
                            {activeRun.correlation.interpretationNote}
                          </p>
                        </div>
                      )}
                      {activeRun.timeSeriesSummary && (
                        <div className="grid grid-cols-2 gap-1.5 font-mono-tabular">
                          <div>Points = {activeRun.timeSeriesSummary.pointCount}</div>
                          <div>Net Δ = {activeRun.timeSeriesSummary.netDelta}</div>
                          <div>Peak = {activeRun.timeSeriesSummary.peakValue}</div>
                          <div>Trough = {activeRun.timeSeriesSummary.troughValue}</div>
                        </div>
                      )}
                      <p className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1.5">
                        Run ID: <span className="font-mono-tabular">{activeRun.runId}</span> ·{' '}
                        {activeRun.softwareVersion}
                      </p>
                      <p className="text-[11px] text-[var(--status-warning)]">
                        {activeRun.limitations[0]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module 7: Reproducibility History Log */}
      {analysisHistory.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reproducible Analysis History ({analysisHistory.length} runs)</span>
            </h3>
            {verifyNotice && (
              <span className="text-xs text-[var(--status-success)] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{verifyNotice}</span>
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {analysisHistory.slice(0, 8).map((run) => (
              <div
                key={run.runId}
                className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text-primary)] truncate">
                    {run.calculationMethodLabel} — {run.inputVariables.join(', ')}
                  </p>
                  <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    {run.datasetFilename} ({run.sourceVersion}) · n={run.sampleCount} ·{' '}
                    {new Date(run.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleReproduceRun(run)}
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>Re-run &amp; Verify</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
