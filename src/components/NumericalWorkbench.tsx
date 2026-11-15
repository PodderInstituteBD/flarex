import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  GitCompare,
  History,
  Play,
  RefreshCw,
  ShieldCheck,
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
  CancellableWorkerJob,
  startDatasetProcessingJob,
  WorkerProgressInfo,
} from '../utils/dataProcessingWorker';
import {
  FileImportPreviewReport,
  inspectRawFileMetadata,
} from '../utils/fileMetadata';
import {
  compareReproducibilityRuns,
  createReproducibilityRecord,
  renderReproducibilityJson,
  renderReproducibilityMarkdown,
  ReproducibilityRecord,
  verifyDatasetChecksumChanged,
} from '../utils/reproducibilityEngine';
import {
  analyzeGroupedVariable,
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
import {
  buildDatasetQualityReport,
  DatasetReadinessLevel,
} from '../utils/scientificValidation';
import type {
  SavedDatasetSummaryEntry,
  SavedReproducibilityEntry,
} from '../utils/workspaceStore';
import { Badge, BadgeTone } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Select } from './ui/Input';

interface NumericalWorkbenchProps {
  investigations: InvestigationRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
  reproducibilityRecords?: ReproducibilityRecord[];
  onIngestDataset: (pkg: IngestedDatasetPackage) => void;
  onRemoveIngestedDataset: (datasetId: string) => void;
  onRecordAnalysisRun: (run: ReproducibleAnalysisRun) => void;
  onRecordReproducibility?: (record: ReproducibilityRecord) => void;
  onSaveReproducibilityToWorkspace?: (entry: SavedReproducibilityEntry) => void;
  onSaveDatasetSummaryToWorkspace?: (entry: SavedDatasetSummaryEntry) => void;
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
  const rootStyle = getComputedStyle(document.documentElement);
  const serializer = new XMLSerializer();
  let rawSvg = serializer.serializeToString(svg);
  if (!rawSvg.includes('xmlns=')) {
    rawSvg = rawSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  rawSvg = rawSvg.replace(/var\(\s*(--[a-zA-Z0-9-_]+)\s*\)/g, (_m, name: string) => {
    return rootStyle.getPropertyValue(name).trim() || '#94a3b8';
  });
  downloadText(rawSvg, filename, 'image/svg+xml;charset=utf-8');
  return true;
}

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
  reproducibilityRecords = [],
  onIngestDataset,
  onRemoveIngestedDataset,
  onRecordAnalysisRun,
  onRecordReproducibility,
  onSaveReproducibilityToWorkspace,
  onSaveDatasetSummaryToWorkspace,
  onRecordClientError,
}: NumericalWorkbenchProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const workerJobRef = useRef<CancellableWorkerJob | null>(null);

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [rowViewMode, setRowViewMode] = useState<'analysis' | 'normalized' | 'original'>('analysis');
  const [analysisMethod, setAnalysisMethod] = useState<
    'DESCRIPTIVE_STATS' | 'PEARSON_CORRELATION' | 'TIME_SERIES_SUMMARY'
  >('DESCRIPTIVE_STATS');
  const [varX, setVarX] = useState<string>('');
  const [varY, setVarY] = useState<string>('');
  const [groupCol, setGroupCol] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // FLAREX 7.0 Pre-Import Preview & Web Worker Progress
  const [pendingFile, setPendingFile] = useState<{
    filename: string;
    content: string;
    byteSize: number;
    preview: FileImportPreviewReport;
  } | null>(null);
  const [workerProgress, setWorkerProgress] = useState<WorkerProgressInfo | null>(null);
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);

  const [activeRun, setActiveRun] = useState<ReproducibleAnalysisRun | null>(
    analysisHistory[0] ?? null
  );
  const [showValidationDetails, setShowValidationDetails] = useState(true);
  const [compareRunAId, setCompareRunAId] = useState<string>('');
  const [compareRunBId, setCompareRunBId] = useState<string>('');

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

  const categoricalColumns = useMemo(
    () =>
      activeDataset
        ? activeDataset.columns.filter((c) => c.inferredType === 'categorical')
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

  const resolvedGroup = useMemo(() => {
    if (activeDataset?.columns.some((c) => c.normalizedName === groupCol)) return groupCol;
    return categoricalColumns[0]?.normalizedName ?? '';
  }, [activeDataset, categoricalColumns, groupCol]);

  const processSelectedFile = async (file: File) => {
    setUploadError(null);
    setVerifyNotice(null);
    setWorkerNotice(null);

    try {
      if (file.size > 25 * 1024 * 1024) {
        const msg = 'Dataset exceeds 25 MB browser processing cap.';
        setUploadError(msg);
        onRecordClientError?.('DataIngestion', msg);
        return;
      }
      const text = await file.text();
      const preview = inspectRawFileMetadata(file.name, text, 8);
      setPendingFile({
        filename: file.name,
        content: text,
        byteSize: file.size,
        preview,
      });
    } catch {
      const msg = 'Unable to inspect selected file in browser.';
      setUploadError(msg);
      onRecordClientError?.('DataIngestion', msg);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleConfirmPendingImport = async () => {
    if (!pendingFile) return;
    setUploadError(null);
    setWorkerNotice(null);

    const job = startDatasetProcessingJob(
      {
        filename: pendingFile.filename,
        content: pendingFile.content,
        sourceUrl: 'Local file upload (user-supplied)',
        repository: 'Local Research Session',
      },
      (prog) => setWorkerProgress(prog)
    );
    workerJobRef.current = job;

    try {
      const res = await job.promise;
      if (res.dataset.provenance.importStatus === 'FAILED') {
        const errText = res.dataset.summary.errors.join(' ');
        setUploadError(errText || 'Failed to parse tabular file.');
        onRecordClientError?.('DataIngestion', errText);
      } else {
        onIngestDataset(res.dataset);
        setSelectedDatasetId(res.dataset.provenance.datasetId);
        setPendingFile(null);
        if (res.metrics.largeDatasetNotice || res.metrics.usedWebWorker) {
          setWorkerNotice(
            res.metrics.largeDatasetNotice ??
              `Processed ${res.metrics.rowCount.toLocaleString()} rows in ${res.metrics.elapsedMs}ms (${res.metrics.chunkCount} chunks).`
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'PROCESSING_CANCELLED') {
        setUploadError('Large dataset processing cancelled cleanly.');
      } else {
        const msg = 'Dataset ingestion failed during worker execution.';
        setUploadError(msg);
        onRecordClientError?.('DataIngestion', msg);
      }
    } finally {
      workerJobRef.current = null;
      setWorkerProgress(null);
    }
  };

  const handleCancelWorker = () => {
    workerJobRef.current?.cancel();
    workerJobRef.current = null;
    setWorkerProgress(null);
  };

  const handleLoadDossierCatalogTable = () => {
    setUploadError(null);
    setVerifyNotice(null);
    setPendingFile(null);
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
    const repro = createReproducibilityRecord({
      dataset: activeDataset,
      run,
      parameters: { groupColumn: resolvedGroup || null },
    });
    onRecordReproducibility?.(repro);
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
    const existingRepro = reproducibilityRecords.find((r) => r.runId === prior.runId);
    const tamperCheck = existingRepro
      ? verifyDatasetChecksumChanged(existingRepro, ds)
      : null;

    setVerifyNotice(
      matched
        ? `Reproducibility verified: Run ${prior.runId} reproduced bit-for-bit (n = ${rerun.sampleCount}, ${rerun.softwareVersion})${
            tamperCheck ? ` · ${tamperCheck.message}` : ''
          }`
        : `Re-execution completed with differences.${tamperCheck ? ` ${tamperCheck.message}` : ''}`
    );
  };

  const scatterPoints = useMemo(() => {
    if (!activeDataset || !resolvedX || !resolvedY) return [];
    const rows =
      activeDataset.analysisRows && activeDataset.analysisRows.length > 0
        ? activeDataset.analysisRows
        : activeDataset.normalizedRows;
    const out: Array<{ x: number; y: number }> = [];
    for (const row of rows.slice(0, 500)) {
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

  const groupedSummary = useMemo(() => {
    if (!activeDataset || !resolvedGroup || !resolvedX) return [];
    return analyzeGroupedVariable(activeDataset, resolvedGroup, resolvedX);
  }, [activeDataset, resolvedGroup, resolvedX]);

  const qualityReport = useMemo(() => {
    if (!activeDataset) return null;
    const dsRuns = analysisHistory.filter(
      (r) => r.datasetId === activeDataset.provenance.datasetId
    );
    return buildDatasetQualityReport(activeDataset, dsRuns);
  }, [activeDataset, analysisHistory]);

  const activeReproRecord = useMemo(() => {
    if (!activeRun || !activeDataset) return null;
    return (
      reproducibilityRecords.find((r) => r.runId === activeRun.runId) ??
      createReproducibilityRecord({ dataset: activeDataset, run: activeRun })
    );
  }, [activeRun, activeDataset, reproducibilityRecords]);

  const runComparisonResult = useMemo(() => {
    if (reproducibilityRecords.length < 2) return null;
    const runA =
      reproducibilityRecords.find((r) => r.runId === compareRunAId) ??
      reproducibilityRecords[0];
    const runB =
      reproducibilityRecords.find((r) => r.runId === compareRunBId) ??
      reproducibilityRecords[1];
    if (!runA || !runB || runA.runId === runB.runId) return null;
    return compareReproducibilityRuns(runA, runB);
  }, [reproducibilityRecords, compareRunAId, compareRunBId]);

  const readinessTone = (lvl: DatasetReadinessLevel): BadgeTone => {
    switch (lvl) {
      case 'READY_FOR_ANALYSIS':
        return 'success';
      case 'USABLE_WITH_CAVEATS':
        return 'cyan';
      case 'REQUIRES_CLEANING':
        return 'warning';
      case 'NOT_SUITABLE_FOR_NUMERICAL_ANALYSIS':
        return 'danger';
    }
  };

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
            <Badge tone="cyan">FLAREX 7.0 Engine</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Inspect raw file delimiters &amp; encoding before import, process large CSV/TSV/TXT/JSON datasets via Web Worker chunks, enforce 3-layer isolation (<code>originalRows</code>, <code>normalizedRows</code>, <code>analysisRows</code>), and compute SHA-256 reproducible statistics.
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

      {/* Drag-and-Drop Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void processSelectedFile(file);
        }}
        className={`px-4 py-3 rounded-[10px] border border-dashed text-xs flex flex-wrap items-center justify-between gap-2 transition-colors ${
          isDragging
            ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--text-primary)]'
            : 'border-[var(--border-strong)] bg-[var(--bg-secondary)]/60 text-[var(--text-secondary)]'
        }`}
      >
        <span>
          Drag &amp; drop CSV, TSV, TXT, or JSON files here (up to 25 MB; datasets &gt;50,000 rows automatically engage chunked Web Worker processing).
        </span>
        {workerProgress && (
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular text-[var(--accent-cyan)]">
              Worker: {workerProgress.processedRows.toLocaleString()} / {workerProgress.estimatedTotalRows.toLocaleString()} ({workerProgress.percent}%)
            </span>
            <Button type="button" variant="outline" size="sm" onClick={handleCancelWorker}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Pre-Import Metadata Preview Panel */}
      {pendingFile && (
        <div className="p-4 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--accent-blue)]/45 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Pre-Import Metadata Inspection: {pendingFile.filename}
              </span>
              <Badge tone="blue">{pendingFile.preview.detectedEncoding}</Badge>
              <Badge tone="cyan">{pendingFile.preview.delimiterLabel}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPendingFile(null)}
              >
                Dismiss
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!pendingFile.preview.canProceedWithImport || Boolean(workerProgress)}
                onClick={() => void handleConfirmPendingImport()}
              >
                {workerProgress ? 'Importing…' : 'Confirm & Ingest Dataset'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-tabular">
            <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block font-sans text-[11px]">Est. Data Rows</span>
              {pendingFile.preview.estimatedDataRowCount.toLocaleString()}
            </div>
            <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block font-sans text-[11px]">Columns</span>
              {pendingFile.preview.columnCount}
            </div>
            <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block font-sans text-[11px]">Preview Duplicates</span>
              {pendingFile.preview.duplicateRowsInPreview}
            </div>
            <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block font-sans text-[11px]">Payload Size</span>
              {(pendingFile.byteSize / 1024).toFixed(1)} KB
            </div>
          </div>

          {pendingFile.preview.warnings.length > 0 && (
            <div className="text-[11px] text-[var(--status-warning)] space-y-0.5">
              {pendingFile.preview.warnings.map((w) => (
                <p key={w}>• {w}</p>
              ))}
            </div>
          )}
          {pendingFile.preview.errors.length > 0 && (
            <div className="text-[11px] text-[var(--status-danger)] space-y-0.5">
              {pendingFile.preview.errors.map((err) => (
                <p key={err}>✕ {err}</p>
              ))}
            </div>
          )}

          {pendingFile.preview.previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-[8px] border border-[var(--border-subtle)] max-h-40">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    {pendingFile.preview.columns.map((c) => (
                      <th key={c.originalName} className="p-1.5 whitespace-nowrap">
                        {c.originalName} {c.detectedUnit ? `[${c.detectedUnit}]` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {pendingFile.preview.previewRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {pendingFile.preview.headers.map((h) => (
                        <td key={h} className="p-1.5 font-mono-tabular whitespace-nowrap text-[var(--text-secondary)]">
                          {r[h] || <span className="italic text-[var(--text-muted)]">empty</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {workerNotice && (
        <div className="p-2.5 rounded-[8px] bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/35 text-xs text-[var(--accent-cyan)]">
          {workerNotice}
        </div>
      )}

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
            Upload a downloaded NASA PSI telemetry CSV/TSV/JSON file or click &ldquo;Load Dossier Metadata Matrix&rdquo; above to inspect quartiles, Spearman/Pearson correlation, OLS regression, SHA-256 reproducibility ledgers, and 8 interactive plot modes.
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
                {activeDataset.provenance.sha256Checksum && (
                  <Badge tone="cyan" className="font-mono-tabular">
                    SHA-256: {activeDataset.provenance.sha256Checksum.slice(0, 12)}…
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onSaveDatasetSummaryToWorkspace && qualityReport && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onSaveDatasetSummaryToWorkspace({
                        datasetId: activeDataset.provenance.datasetId,
                        filename: activeDataset.provenance.originalFilename,
                        rowCount: activeDataset.summary.rowCount,
                        columnCount: activeDataset.summary.columnCount,
                        sha256Checksum: activeDataset.provenance.sha256Checksum ?? '',
                        readiness: qualityReport.readinessAssessment,
                        sourceUrl: activeDataset.provenance.sourceUrl,
                        savedAt: new Date().toISOString(),
                      })
                    }
                  >
                    Save Dataset Meta
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveIngestedDataset(activeDataset.provenance.datasetId)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--status-danger)] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Remove</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Rows × Columns</span>
                <strong className="font-mono-tabular text-[var(--text-primary)]">
                  {activeDataset.summary.rowCount.toLocaleString()} × {activeDataset.summary.columnCount}
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

          {/* Module E: 12-Check Data Quality & Extended Sampling Diagnostics */}
          {qualityReport && (
            <div className="p-3.5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Dataset Quality &amp; Scientific Validation (12 Checks)
                  </span>
                  <Badge tone={readinessTone(qualityReport.readinessAssessment)}>
                    {qualityReport.readinessAssessment}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setShowValidationDetails((v) => !v)}
                  className="text-xs font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
                >
                  {showValidationDetails ? 'Collapse 12 Checks' : 'Inspect 12 Checks'}
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {qualityReport.readinessRationale}
              </p>

              {qualityReport.extendedDiagnostics && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono-tabular">
                  <span>
                    Metadata Completeness:{' '}
                    <strong className="text-[var(--accent-cyan)]">
                      {qualityReport.extendedDiagnostics.metadataCompletenessPct}%
                    </strong>
                  </span>
                  <span>
                    Sampling Interval Irregularity:{' '}
                    <strong
                      className={
                        qualityReport.extendedDiagnostics.samplingIrregularityDetected
                          ? 'text-[var(--status-warning)]'
                          : 'text-[var(--status-success)]'
                      }
                    >
                      {qualityReport.extendedDiagnostics.samplingIrregularityDetected
                        ? `Irregular (CV=${qualityReport.extendedDiagnostics.samplingCvPct ?? 0}%)`
                        : 'Uniform / N/A'}
                    </strong>
                  </span>
                  <span>
                    Abrupt Jumps (&gt;8× median step):{' '}
                    <strong className="text-[var(--text-primary)]">
                      {qualityReport.extendedDiagnostics.discontinuityFlags.length}
                    </strong>
                  </span>
                </div>
              )}

              {showValidationDetails && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    {qualityReport.checks.map((chk) => (
                      <div
                        key={chk.checkNumber}
                        className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {chk.checkNumber}. {chk.checkName}
                          </span>
                          <Badge
                            tone={
                              chk.status === 'PASS'
                                ? 'success'
                                : chk.status === 'FAIL'
                                ? 'danger'
                                : chk.status === 'WARNING'
                                ? 'warning'
                                : 'neutral'
                            }
                          >
                            {chk.status}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {chk.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] space-y-0.5 pt-1 border-t border-[var(--border-subtle)]">
                    {qualityReport.statisticalGuardrails.map((g) => (
                      <p key={g}>• {g}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Schema + 3-Layer Isolation Table Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Detected Column Schema &amp; Units
              </h3>
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
                  3-Layer Data Isolation (Top 8 Rows)
                </h3>
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {(
                    [
                      { id: 'analysis', label: 'Layer 3: Cleaned Analysis' },
                      { id: 'normalized', label: 'Layer 2: Normalized' },
                      { id: 'original', label: 'Layer 1: Original Raw' },
                    ] as const
                  ).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setRowViewMode(layer.id)}
                      className={`px-2 py-1 rounded border cursor-pointer ${
                        rowViewMode === layer.id
                          ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {layer.label}
                    </button>
                  ))}
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
                      : rowViewMode === 'analysis' && activeDataset.analysisRows?.length
                      ? activeDataset.analysisRows.slice(0, 8)
                      : activeDataset.normalizedRows.slice(0, 8)
                    ).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {activeDataset.columns.map((c) => {
                          const key =
                            rowViewMode === 'original' ? c.originalName : c.normalizedName;
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

          {/* Analysis Controls & Extended Output */}
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
                  <option value="DESCRIPTIVE_STATS">Extended Descriptive + Quartiles/IQR</option>
                  <option value="PEARSON_CORRELATION">Pearson r, Spearman rho &amp; OLS Fit</option>
                  <option value="TIME_SERIES_SUMMARY">Ordered Sequence + Moving Avg</option>
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

                  {categoricalColumns.length > 0 && (
                    <div className="space-y-1">
                      <label
                        htmlFor="workbench-group-col"
                        className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block"
                      >
                        Group By (Optional)
                      </label>
                      <Select
                        id="workbench-group-col"
                        value={resolvedGroup}
                        onChange={(e) => setGroupCol(e.target.value)}
                        className="py-1.5 text-xs"
                      >
                        {categoricalColumns.map((c) => (
                          <option key={c.normalizedName} value={c.normalizedName}>
                            {c.originalName}
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
                                reproducibilityRecord: activeReproRecord,
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
                      Click &ldquo;Execute Reproducible Analysis&rdquo; to compute quartiles, variance, Spearman rho, OLS fit, and SHA-256 provenance.
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
                          <div>SD (n-1) = {activeRun.descriptive.stdDev ?? 'N/A'}</div>
                          <div>Var = {activeRun.descriptive.variance ?? 'N/A'}</div>
                          <div>Q1 = {activeRun.descriptive.q1 ?? 'N/A'}</div>
                          <div>Q3 = {activeRun.descriptive.q3 ?? 'N/A'}</div>
                          <div>IQR = {activeRun.descriptive.iqr ?? 'N/A'}</div>
                          <div>Range = {activeRun.descriptive.range ?? 'N/A'}</div>
                          <div>P10 = {activeRun.descriptive.p10 ?? 'N/A'}</div>
                          <div>P90 = {activeRun.descriptive.p90 ?? 'N/A'}</div>
                          <div className="col-span-2 text-[var(--status-warning)]">
                            IQR Outliers Flagged = {activeRun.descriptive.outlierCount ?? 0}
                          </div>
                        </div>
                      )}
                      {activeRun.correlation && (
                        <div className="space-y-1.5">
                          <p className="font-mono-tabular font-semibold text-[var(--accent-cyan)]">
                            Pearson r = {activeRun.correlation.pearsonR} · Spearman rho ={' '}
                            {activeRun.correlation.spearmanRho ?? 'N/A'} (pairs = {activeRun.correlation.pairCount})
                          </p>
                          {activeRun.correlation.regressionEquation && (
                            <p className="font-mono-tabular text-[var(--accent-blue)]">
                              OLS Fit: {activeRun.correlation.regressionEquation}
                            </p>
                          )}
                          {activeRun.correlation.unitCompatibilityWarning && (
                            <p className="text-[var(--status-warning)]">
                              Unit Advisory: {activeRun.correlation.unitCompatibilityWarning}
                            </p>
                          )}
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
                          {activeRun.timeSeriesSummary.movingAverageWindow && (
                            <div className="col-span-2 text-[var(--accent-cyan)]">
                              Moving Average: {activeRun.timeSeriesSummary.movingAverageWindow}-point preview computed
                            </div>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1.5">
                        Run ID: <span className="font-mono-tabular">{activeRun.runId}</span> · {activeRun.softwareVersion}
                      </p>
                      <p className="text-[11px] text-[var(--status-warning)]">
                        {activeRun.limitations[0]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grouped Categorical Comparison Table when applicable */}
            {groupedSummary.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Grouped Comparison ({xColMeta?.originalName ?? resolvedX} grouped by {resolvedGroup})
                </p>
                <div className="overflow-x-auto rounded-[8px] border border-[var(--border-subtle)]">
                  <table className="w-full text-left border-collapse text-[11px] font-mono-tabular">
                    <thead>
                      <tr className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                        <th className="p-2">Group</th>
                        <th className="p-2">n</th>
                        <th className="p-2">Mean</th>
                        <th className="p-2">Median</th>
                        <th className="p-2">SD (n-1)</th>
                        <th className="p-2">IQR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {groupedSummary.slice(0, 8).map((g) => (
                        <tr key={g.groupValue}>
                          <td className="p-2 font-sans font-medium text-[var(--text-primary)]">
                            {g.groupValue}
                          </td>
                          <td className="p-2">{g.count}</td>
                          <td className="p-2">{g.mean}</td>
                          <td className="p-2">{g.median}</td>
                          <td className="p-2">{g.sampleStdDev ?? 'N/A'}</td>
                          <td className="p-2">{g.iqr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module D: SHA-256 Reproducibility Ledger & Run Comparator */}
      {analysisHistory.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reproducibility Ledger ({analysisHistory.length} runs)</span>
            </h3>
            {verifyNotice && (
              <span className="text-xs text-[var(--status-success)] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{verifyNotice}</span>
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {analysisHistory.slice(0, 8).map((run) => {
              const rec = reproducibilityRecords.find((r) => r.runId === run.runId);
              return (
                <div
                  key={run.runId}
                  className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">
                      {run.calculationMethodLabel} — {run.inputVariables.join(', ')}
                    </p>
                    <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      {run.datasetFilename} ({run.sourceVersion}) · n={run.sampleCount}
                      {rec ? ` · sha256:${rec.sha256Checksum.slice(0, 10)}…` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleReproduceRun(run)}
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      <span>Re-run &amp; Verify</span>
                    </Button>
                    {rec && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            downloadText(
                              renderReproducibilityMarkdown(rec),
                              `flarex_repro_${rec.runId}.md`,
                              'text/markdown;charset=utf-8'
                            )
                          }
                        >
                          MD
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            downloadText(
                              renderReproducibilityJson(rec),
                              `flarex_repro_${rec.runId}.json`,
                              'application/json;charset=utf-8'
                            )
                          }
                        >
                          JSON
                        </Button>
                        {onSaveReproducibilityToWorkspace && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              onSaveReproducibilityToWorkspace({
                                runId: rec.runId,
                                datasetId: rec.datasetId,
                                filename: rec.filename,
                                sha256Checksum: rec.sha256Checksum,
                                statisticalMethod: rec.statisticalMethod,
                                selectedVariables: rec.selectedVariables,
                                timestamp: rec.timestamp,
                                resultSummary: rec.resultSummary,
                              })
                            }
                          >
                            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                            <span>Save to Workspace</span>
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {reproducibilityRecords.length >= 2 && (
            <div className="p-3.5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
                  <span>Compare Reproducibility Runs</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Reproducibility Run A"
                    value={compareRunAId || reproducibilityRecords[0].runId}
                    onChange={(e) => setCompareRunAId(e.target.value)}
                    className="py-1 text-xs !w-auto"
                  >
                    {reproducibilityRecords.map((r) => (
                      <option key={r.runId} value={r.runId}>
                        {r.runId} ({r.selectedVariables.join(', ')})
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Reproducibility Run B"
                    value={compareRunBId || reproducibilityRecords[1].runId}
                    onChange={(e) => setCompareRunBId(e.target.value)}
                    className="py-1 text-xs !w-auto"
                  >
                    {reproducibilityRecords.map((r) => (
                      <option key={r.runId} value={r.runId}>
                        {r.runId} ({r.selectedVariables.join(', ')})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {runComparisonResult && (
                <div className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        runComparisonResult.verdict === 'BIT_IDENTICAL'
                          ? 'success'
                          : runComparisonResult.verdict === 'DATASET_VERSION_CHANGED'
                          ? 'danger'
                          : 'warning'
                      }
                    >
                      {runComparisonResult.verdict}
                    </Badge>
                    <span className="text-[var(--text-secondary)]">
                      {runComparisonResult.summaryNote}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

