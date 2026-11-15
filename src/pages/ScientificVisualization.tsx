import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Download,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  ShieldAlert,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { InvestigationRecord } from '../types/research';
import {
  analyzeGroupedVariable,
  analyzeMovingAverage,
  ReproducibleAnalysisRun,
} from '../utils/scientificAnalysis';
import {
  checkUnitCompatibility,
  computeExtendedDescriptiveStats,
  computePearsonR,
  computeSimpleLinearRegression,
  computeSpearmanRankCorrelation,
} from '../utils/scientificComputation';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';

export type ScientificChartMode =
  | 'scatter_regression'
  | 'line'
  | 'timeseries_ma'
  | 'histogram'
  | 'boxplot'
  | 'grouped_bar'
  | 'correlation_heatmap'
  | 'multi_overlay';

interface ScientificVisualizationProps {
  investigations: InvestigationRecord[];
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadTextFile(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

function resolveCssVarsInSvgString(svgEl: SVGSVGElement): {
  svgString: string;
  width: number;
  height: number;
  bgColor: string;
} {
  const rootStyle = getComputedStyle(document.documentElement);
  const bgColor = rootStyle.getPropertyValue('--bg-card').trim() || '#0f172a';
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(640, Math.round(rect.width) || 760);
  const height = Math.max(300, Math.round(rect.height) || 340);

  const serializer = new XMLSerializer();
  let raw = serializer.serializeToString(svgEl);
  if (!raw.includes('xmlns=')) {
    raw = raw.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  raw = raw.replace(/var\(\s*(--[a-zA-Z0-9-_]+)\s*\)/g, (_m, varName: string) => {
    const val = rootStyle.getPropertyValue(varName).trim();
    return val || '#94a3b8';
  });

  // Ensure explicit pixel width/height when exporting Recharts SVG
  if (!/width="/.test(raw.slice(0, 220))) {
    raw = raw.replace('<svg', `<svg width="${width}" height="${height}"`);
  }
  return { svgString: raw, width, height, bgColor };
}

async function exportSvgAsPng(svgEl: SVGSVGElement, filename: string): Promise<boolean> {
  const { svgString, width, height, bgColor } = resolveCssVarsInSvgString(svgEl);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(svgUrl);
          resolve(false);
          return;
        }
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          URL.revokeObjectURL(svgUrl);
          if (!pngBlob) {
            resolve(false);
            return;
          }
          downloadBlob(pngBlob, filename);
          resolve(true);
        }, 'image/png');
      } catch {
        URL.revokeObjectURL(svgUrl);
        resolve(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(false);
    };
    img.src = svgUrl;
  });
}

export function ScientificVisualization({
  investigations,
  ingestedDatasets,
}: ScientificVisualizationProps) {
  const studioChartRef = useRef<HTMLDivElement | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [chartMode, setChartMode] = useState<ScientificChartMode>('scatter_regression');
  const [varX, setVarX] = useState<string>('');
  const [varY, setVarY] = useState<string>('');
  const [groupCol, setGroupCol] = useState<string>('');
  const [maWindow, setMaWindow] = useState<number>(3);
  const [heatmapMetric, setHeatmapMetric] = useState<'pearson' | 'spearman'>('pearson');
  const [exportNote, setExportNote] = useState<string | null>(null);

  const activeDataset = useMemo(
    () =>
      ingestedDatasets.find((d) => d.provenance.datasetId === selectedDatasetId) ??
      ingestedDatasets[0] ??
      null,
    [ingestedDatasets, selectedDatasetId]
  );

  const sourceRows = useMemo(
    () =>
      activeDataset
        ? activeDataset.analysisRows && activeDataset.analysisRows.length > 0
          ? activeDataset.analysisRows
          : activeDataset.normalizedRows
        : [],
    [activeDataset]
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
    return categoricalColumns[0]?.normalizedName ?? activeDataset?.columns[0]?.normalizedName ?? '';
  }, [activeDataset, categoricalColumns, groupCol]);

  const xMeta = numericColumns.find((c) => c.normalizedName === resolvedX);
  const yMeta = numericColumns.find((c) => c.normalizedName === resolvedY);
  const gMeta = activeDataset?.columns.find((c) => c.normalizedName === resolvedGroup);

  const pairedPoints = useMemo(() => {
    if (!resolvedX || !resolvedY) return [];
    const pts: Array<{ index: number; x: number; y: number }> = [];
    const maxPts = 600;
    for (let i = 0; i < sourceRows.length && pts.length < maxPts; i += 1) {
      const xv = sourceRows[i][resolvedX];
      const yv = sourceRows[i][resolvedY];
      if (typeof xv === 'number' && Number.isFinite(xv) && typeof yv === 'number' && Number.isFinite(yv)) {
        pts.push({ index: i + 1, x: xv, y: yv });
      }
    }
    return pts;
  }, [sourceRows, resolvedX, resolvedY]);

  const regression = useMemo(() => {
    if (pairedPoints.length < 3) return null;
    return computeSimpleLinearRegression(
      pairedPoints.map((p) => p.x),
      pairedPoints.map((p) => p.y)
    );
  }, [pairedPoints]);

  const spearman = useMemo(() => {
    if (pairedPoints.length < 3) return null;
    return computeSpearmanRankCorrelation(
      pairedPoints.map((p) => p.x),
      pairedPoints.map((p) => p.y)
    );
  }, [pairedPoints]);

  const pearson = useMemo(() => {
    if (pairedPoints.length < 2) return null;
    return computePearsonR(
      pairedPoints.map((p) => p.x),
      pairedPoints.map((p) => p.y)
    );
  }, [pairedPoints]);

  const scatterWithFit = useMemo(() => {
    if (!regression || pairedPoints.length === 0) {
      return pairedPoints.map((p) => ({ ...p, fitY: null as number | null }));
    }
    return [...pairedPoints]
      .sort((a, b) => a.x - b.x)
      .map((p) => ({
        ...p,
        fitY: Number((regression.slope * p.x + regression.intercept).toFixed(4)),
      }));
  }, [pairedPoints, regression]);

  const timeSeriesMaData = useMemo(() => {
    if (!activeDataset || !resolvedY) return [];
    return analyzeMovingAverage(activeDataset, resolvedX || null, resolvedY, maWindow)
      .slice(0, 400)
      .map((pt, i) => ({
        step: pt.x ?? i + 1,
        value: pt.value,
        movingAvg: pt.movingAvg,
      }));
  }, [activeDataset, resolvedX, resolvedY, maWindow]);

  const histogramBins = useMemo(() => {
    if (!resolvedX) return [];
    const vals = sourceRows
      .map((r) => r[resolvedX])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length === 0) return [];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) {
      return [{ bin: String(min), count: vals.length }];
    }
    const bins = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(vals.length))));
    const width = (max - min) / bins;
    const out: Array<{ bin: string; count: number }> = [];
    for (let i = 0; i < bins; i += 1) {
      const lo = min + i * width;
      const hi = i === bins - 1 ? max : min + (i + 1) * width;
      const count = vals.filter((v) =>
        i === bins - 1 ? v >= lo && v <= hi : v >= lo && v < hi
      ).length;
      out.push({ bin: `${lo.toFixed(2)}–${hi.toFixed(2)}`, count });
    }
    return out;
  }, [sourceRows, resolvedX]);

  const boxPlotStats = useMemo(() => {
    if (!resolvedX) return null;
    const raw = sourceRows.map((r) => {
      const v = r[resolvedX];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
    return computeExtendedDescriptiveStats(
      raw,
      xMeta?.originalName ?? resolvedX,
      xMeta?.detectedUnit ?? null
    );
  }, [sourceRows, resolvedX, xMeta]);

  const groupedRows = useMemo(() => {
    if (!activeDataset || !resolvedGroup || !resolvedY) return [];
    return analyzeGroupedVariable(activeDataset, resolvedGroup, resolvedY);
  }, [activeDataset, resolvedGroup, resolvedY]);

  const unitCheckOverlay = useMemo(
    () => checkUnitCompatibility(xMeta?.detectedUnit, yMeta?.detectedUnit, 'DIRECT_COMPARISON'),
    [xMeta, yMeta]
  );

  const multiOverlayPoints = useMemo(() => {
    if (!resolvedX || !resolvedY) return [];
    const out: Array<{ idx: number; valX: number; valY: number }> = [];
    for (let i = 0; i < sourceRows.length && out.length < 300; i += 1) {
      const a = sourceRows[i][resolvedX];
      const b = sourceRows[i][resolvedY];
      if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) {
        out.push({ idx: i + 1, valX: a, valY: b });
      }
    }
    return out;
  }, [sourceRows, resolvedX, resolvedY]);

  const correlationMatrix = useMemo(() => {
    const cols = numericColumns.slice(0, 6);
    if (cols.length < 2) return null;
    const cells: Array<{
      rowCol: string;
      colCol: string;
      value: number | null;
      n: number;
    }> = [];
    for (const rCol of cols) {
      for (const cCol of cols) {
        if (rCol.normalizedName === cCol.normalizedName) {
          cells.push({
            rowCol: rCol.originalName,
            colCol: cCol.originalName,
            value: 1,
            n: rCol.validNumericCount,
          });
          continue;
        }
        const xs: number[] = [];
        const ys: number[] = [];
        for (const row of sourceRows) {
          const a = row[rCol.normalizedName];
          const b = row[cCol.normalizedName];
          if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) {
            xs.push(a);
            ys.push(b);
          }
        }
        const stat =
          heatmapMetric === 'spearman'
            ? computeSpearmanRankCorrelation(xs, ys)?.rho ?? null
            : computePearsonR(xs, ys);
        cells.push({
          rowCol: rCol.originalName,
          colCol: cCol.originalName,
          value: stat !== null ? Number(stat.toFixed(3)) : null,
          n: xs.length,
        });
      }
    }
    return { cols, cells };
  }, [numericColumns, sourceRows, heatmapMetric]);

  const handleExportSvg = () => {
    setExportNote(null);
    const svg = studioChartRef.current?.querySelector('svg');
    if (!svg) {
      setExportNote('No vector SVG element found for the current view.');
      return;
    }
    const { svgString } = resolveCssVarsInSvgString(svg as SVGSVGElement);
    downloadTextFile(
      svgString,
      `flarex7_chart_${chartMode}.svg`,
      'image/svg+xml;charset=utf-8'
    );
    setExportNote(`Exported standalone vector SVG (flarex7_chart_${chartMode}.svg).`);
  };

  const handleExportPng = async () => {
    setExportNote(null);
    const svg = studioChartRef.current?.querySelector('svg');
    if (!svg) {
      setExportNote('PNG export requires a vector chart SVG canvas.');
      return;
    }
    const ok = await exportSvgAsPng(svg as SVGSVGElement, `flarex7_chart_${chartMode}.png`);
    setExportNote(
      ok
        ? `Exported 2x PNG image (flarex7_chart_${chartMode}.png).`
        : 'Unable to rasterize PNG in browser canvas.'
    );
  };

  const handleExportChartCsv = () => {
    if (!activeDataset) return;
    let csv = '';
    if (chartMode === 'histogram') {
      csv = ['bin,count', ...histogramBins.map((b) => `"${b.bin}",${b.count}`)].join('\n');
    } else if (chartMode === 'grouped_bar') {
      csv = [
        'group,count,mean,median,min,max,iqr',
        ...groupedRows.map(
          (g) => `"${g.groupValue}",${g.count},${g.mean},${g.median},${g.min},${g.max},${g.iqr}`
        ),
      ].join('\n');
    } else if (chartMode === 'timeseries_ma') {
      csv = [
        `step,${yMeta?.originalName ?? 'value'},moving_average_${maWindow}`,
        ...timeSeriesMaData.map((d) => `${d.step},${d.value},${d.movingAvg}`),
      ].join('\n');
    } else {
      csv = [
        `${xMeta?.originalName ?? 'x'},${yMeta?.originalName ?? 'y'}`,
        ...pairedPoints.map((p) => `${p.x},${p.y}`),
      ].join('\n');
    }
    downloadTextFile(csv, `flarex7_plot_data_${chartMode}.csv`, 'text/csv;charset=utf-8');
    setExportNote(`Exported chart CSV (flarex7_plot_data_${chartMode}.csv).`);
  };

  const handleExportChartJson = () => {
    if (!activeDataset) return;
    const payload = {
      platform: 'FLAREX 7.0 Scientific Visualization Studio',
      chartMode,
      dataset: {
        filename: activeDataset.provenance.originalFilename,
        sha256Checksum: activeDataset.provenance.sha256Checksum ?? null,
        rowCount: activeDataset.summary.rowCount,
      },
      axes: {
        x: xMeta ? { name: xMeta.originalName, unit: xMeta.detectedUnit } : null,
        y: yMeta ? { name: yMeta.originalName, unit: yMeta.detectedUnit } : null,
      },
      statistics: {
        samplePairs: pairedPoints.length,
        pearsonR: pearson !== null ? Number(pearson.toFixed(4)) : null,
        spearmanRho: spearman?.rho ?? null,
        linearRegression: regression,
      },
    };
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `flarex7_chart_spec_${chartMode}.json`,
      'application/json;charset=utf-8'
    );
    setExportNote(`Exported chart specification JSON (flarex7_chart_spec_${chartMode}.json).`);
  };

  return (
    <Card as="section" aria-labelledby="sci-viz-studio-heading" className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="sci-viz-studio-heading"
              className="font-display text-[18px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
            >
              <BarChart2 className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Publication-Grade Scientific Visualization Studio</span>
            </h2>
            <Badge tone="cyan">8 Chart Types · SVG / PNG / CSV / JSON</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Interactive exploratory &amp; publication plots with units, SHA-256 dataset attribution, moving averages, OLS regression fit, box-plot quartiles, correlation heatmaps, and cross-unit overlay guards ({investigations.length} dossier records indexed).
          </p>
        </div>

        {activeDataset && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={handleExportSvg}>
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>SVG</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExportPng()}>
              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PNG</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExportChartCsv}>
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CSV</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExportChartJson}>
              <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>JSON</span>
            </Button>
          </div>
        )}
      </div>

      {!activeDataset ? (
        <div className="p-5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)]">
          Import a CSV, TSV, TXT, or JSON dataset—or click &ldquo;Load Dossier Metadata Matrix&rdquo; in the Numerical Workbench above—to unlock all 8 interactive visualization modes.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls */}
          <div className="p-3.5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label htmlFor="viz-dataset-select" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                Dataset
              </label>
              <Select
                id="viz-dataset-select"
                value={activeDataset.provenance.datasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="py-1.5 text-xs"
              >
                {ingestedDatasets.map((ds) => (
                  <option key={ds.provenance.datasetId} value={ds.provenance.datasetId}>
                    {ds.provenance.originalFilename}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="viz-mode-select" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                Chart Type
              </label>
              <Select
                id="viz-mode-select"
                value={chartMode}
                onChange={(e) => setChartMode(e.target.value as ScientificChartMode)}
                className="py-1.5 text-xs"
              >
                <option value="scatter_regression">Scatter + Regression Fit</option>
                <option value="line">Line Plot</option>
                <option value="timeseries_ma">Time-Series + Moving Avg</option>
                <option value="histogram">Histogram Distribution</option>
                <option value="boxplot">Box Plot (Q1/Q2/Q3/IQR)</option>
                <option value="grouped_bar">Categorical Group Bars</option>
                <option value="correlation_heatmap">Correlation Heatmap</option>
                <option value="multi_overlay">Multi-Variable Overlay</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="viz-x-select" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                {chartMode === 'histogram' || chartMode === 'boxplot' ? 'Target Variable' : 'Variable X / Axis'}
              </label>
              <Select
                id="viz-x-select"
                value={resolvedX}
                onChange={(e) => setVarX(e.target.value)}
                className="py-1.5 text-xs"
              >
                {numericColumns.map((c) => (
                  <option key={c.normalizedName} value={c.normalizedName}>
                    {c.originalName}{c.detectedUnit ? ` (${c.detectedUnit})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            {chartMode === 'grouped_bar' ? (
              <div className="space-y-1">
                <label htmlFor="viz-group-select" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Group Column
                </label>
                <Select
                  id="viz-group-select"
                  value={resolvedGroup}
                  onChange={(e) => setGroupCol(e.target.value)}
                  className="py-1.5 text-xs"
                >
                  {activeDataset.columns.map((c) => (
                    <option key={c.normalizedName} value={c.normalizedName}>
                      {c.originalName} ({c.inferredType})
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <label htmlFor="viz-y-select" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Variable Y / Response
                </label>
                <Select
                  id="viz-y-select"
                  value={resolvedY}
                  onChange={(e) => setVarY(e.target.value)}
                  className="py-1.5 text-xs"
                >
                  {numericColumns.map((c) => (
                    <option key={c.normalizedName} value={c.normalizedName}>
                      {c.originalName}{c.detectedUnit ? ` (${c.detectedUnit})` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-1">
              {chartMode === 'timeseries_ma' ? (
                <>
                  <label htmlFor="viz-ma-window" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                    Moving Avg Window
                  </label>
                  <Select
                    id="viz-ma-window"
                    value={String(maWindow)}
                    onChange={(e) => setMaWindow(Number(e.target.value))}
                    className="py-1.5 text-xs"
                  >
                    {[2, 3, 5, 7, 10].map((w) => (
                      <option key={w} value={String(w)}>
                        {w}-point MA
                      </option>
                    ))}
                  </Select>
                </>
              ) : chartMode === 'correlation_heatmap' ? (
                <>
                  <label htmlFor="viz-heat-metric" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                    Matrix Metric
                  </label>
                  <Select
                    id="viz-heat-metric"
                    value={heatmapMetric}
                    onChange={(e) => setHeatmapMetric(e.target.value as 'pearson' | 'spearman')}
                    className="py-1.5 text-xs"
                  >
                    <option value="pearson">Pearson r</option>
                    <option value="spearman">Spearman rho</option>
                  </Select>
                </>
              ) : (
                <div className="flex flex-col justify-end h-full pb-1">
                  <span className="text-[11px] text-[var(--text-muted)]">Source SHA-256</span>
                  <span className="font-mono-tabular text-xs text-[var(--accent-cyan)]">
                    {activeDataset.provenance.sha256Checksum?.slice(0, 12) ?? 'not computed'}…
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Chart Metadata Disclosure Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px]">
            <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Provenance:</strong>
              <span>{activeDataset.provenance.originalFilename}</span>
              <span>· Units: X=[{xMeta?.detectedUnit ?? 'unspecified'}], Y=[{yMeta?.detectedUnit ?? 'unspecified'}]</span>
              <span>· Pairs/Rows plotted: {pairedPoints.length} of {activeDataset.summary.rowCount}</span>
            </div>
            <Badge tone="neutral">DERIVED_STATISTIC / EXPLORATORY</Badge>
          </div>

          {exportNote && (
            <p className="text-xs text-[var(--status-success)] font-medium">{exportNote}</p>
          )}

          {/* Unit Guardrail for Multi-Variable Overlay */}
          {chartMode === 'multi_overlay' && !unitCheckOverlay.compatibleForDirectComparison && (
            <div className="p-3.5 rounded-[10px] bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/40 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold text-[var(--status-warning)]">
                  Cross-Unit Overlay Blocked ({unitCheckOverlay.status})
                </p>
                <p className="text-[var(--text-secondary)]">
                  {unitCheckOverlay.warningMessage} Select two variables with identical physical units (e.g., both in <code>K</code> or both in <code>cm/s</code>) to overlay curves on a shared Y axis, or switch to Scatter + Regression Fit.
                </p>
              </div>
            </div>
          )}

          {/* Chart Render Area */}
          <div
            ref={studioChartRef}
            className="w-full min-h-[320px] p-3 rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)]"
          >
            {numericColumns.length === 0 ? (
              <p className="text-xs text-[var(--status-warning)] p-4">
                Dataset contains zero numeric columns for quantitative plotting.
              </p>
            ) : chartMode === 'correlation_heatmap' && correlationMatrix ? (
              <div className="space-y-3 overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">
                    Pairwise {heatmapMetric === 'spearman' ? 'Spearman Rank (rho)' : 'Pearson Linear (r)'} Matrix (Up to 6 Numeric Columns)
                  </span>
                  <span className="text-[var(--status-warning)]">
                    Association only — never implies causation.
                  </span>
                </div>
                <table className="w-full border-collapse text-xs font-mono-tabular min-w-[480px]">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-[var(--text-muted)]">Variable</th>
                      {correlationMatrix.cols.map((c) => (
                        <th key={c.normalizedName} className="p-2 text-center text-[var(--text-secondary)]">
                          {c.originalName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correlationMatrix.cols.map((rCol) => (
                      <tr key={rCol.normalizedName} className="border-t border-[var(--border-subtle)]">
                        <td className="p-2 font-semibold text-[var(--text-primary)]">
                          {rCol.originalName}
                        </td>
                        {correlationMatrix.cols.map((cCol) => {
                          const cell = correlationMatrix.cells.find(
                            (x) => x.rowCol === rCol.originalName && x.colCol === cCol.originalName
                          );
                          const val = cell?.value ?? null;
                          const intensity = val === null ? 0 : Math.min(0.45, Math.abs(val) * 0.45);
                          const bg =
                            val === null
                              ? 'transparent'
                              : val >= 0
                              ? `rgba(56, 189, 248, ${intensity})`
                              : `rgba(249, 115, 22, ${intensity})`;
                          return (
                            <td
                              key={cCol.normalizedName}
                              style={{ backgroundColor: bg }}
                              className="p-2 text-center border border-[var(--border-subtle)] text-[var(--text-primary)]"
                              title={`n=${cell?.n ?? 0} valid pairs`}
                            >
                              {val === null ? 'N/A' : val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : chartMode === 'boxplot' && boxPlotStats ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">
                    Box-Plot Quantile Distribution: {boxPlotStats.variable} {boxPlotStats.unit ? `[${boxPlotStats.unit}]` : ''}
                  </span>
                  <span className="font-mono-tabular text-[var(--text-secondary)]">
                    Min={boxPlotStats.min} · Q1={boxPlotStats.q1} · Median={boxPlotStats.median} · Q3={boxPlotStats.q3} · Max={boxPlotStats.max} · IQR={boxPlotStats.iqr}
                  </span>
                </div>
                {(() => {
                  const span = Math.max(1e-9, boxPlotStats.max - boxPlotStats.min);
                  const toX = (v: number) => 60 + ((v - boxPlotStats.min) / span) * 600;
                  const xMin = toX(boxPlotStats.min);
                  const xQ1 = toX(boxPlotStats.q1);
                  const xMed = toX(boxPlotStats.median);
                  const xQ3 = toX(boxPlotStats.q3);
                  const xMax = toX(boxPlotStats.max);
                  return (
                    <svg viewBox="0 0 720 180" className="w-full h-44" role="img" aria-label={`Box plot for ${boxPlotStats.variable}`}>
                      <line x1="60" y1="140" x2="660" y2="140" stroke="var(--border-strong)" strokeWidth="1.5" />
                      {/* Whisker line */}
                      <line x1={xMin} y1="75" x2={xMax} y2="75" stroke="var(--accent-cyan)" strokeWidth="2" />
                      <line x1={xMin} y1="55" x2={xMin} y2="95" stroke="var(--accent-cyan)" strokeWidth="2.5" />
                      <line x1={xMax} y1="55" x2={xMax} y2="95" stroke="var(--accent-cyan)" strokeWidth="2.5" />
                      {/* IQR Box */}
                      <rect
                        x={xQ1}
                        y="44"
                        width={Math.max(4, xQ3 - xQ1)}
                        height="62"
                        fill="var(--accent-blue)"
                        fillOpacity="0.28"
                        stroke="var(--accent-blue)"
                        strokeWidth="2.5"
                        rx="4"
                      />
                      {/* Median */}
                      <line x1={xMed} y1="44" x2={xMed} y2="106" stroke="var(--status-warning)" strokeWidth="3" />
                      {/* Outliers */}
                      {boxPlotStats.outlierValues.slice(0, 20).map((ov, i) => (
                        <circle key={i} cx={toX(ov)} cy="75" r="4" fill="var(--status-danger)" />
                      ))}
                      {/* Labels */}
                      <text x={xMin} y="160" textAnchor="middle" fill="var(--text-secondary)" fontSize="11" fontFamily="monospace">
                        Min {boxPlotStats.min}
                      </text>
                      <text x={xMed} y="28" textAnchor="middle" fill="var(--status-warning)" fontSize="11" fontFamily="monospace">
                        Median {boxPlotStats.median}
                      </text>
                      <text x={xMax} y="160" textAnchor="middle" fill="var(--text-secondary)" fontSize="11" fontFamily="monospace">
                        Max {boxPlotStats.max}
                      </text>
                    </svg>
                  );
                })()}
                <p className="text-[11px] text-[var(--text-muted)]">
                  Outliers flagged beyond 1.5×IQR ({boxPlotStats.outlierLowFence} to {boxPlotStats.outlierHighFence}): {boxPlotStats.outlierCount} observation(s). Retained intact (never deleted).
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'histogram' ? (
                    <BarChart data={histogramBins} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="bin" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                      <Bar dataKey="count" name={`Frequency (${xMeta?.originalName ?? ''})`} fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chartMode === 'grouped_bar' ? (
                    <BarChart data={groupedRows} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="groupValue" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="mean" name={`Mean (${gMeta?.originalName ?? 'Group'})`} fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="median" name="Median" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chartMode === 'timeseries_ma' ? (
                    <LineChart data={timeSeriesMaData} margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="step" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <YAxis domain={['auto', 'auto']} padding={{ top: 12, bottom: 12 }} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="value" name={yMeta?.originalName ?? 'Value'} stroke="var(--accent-blue)" strokeWidth={1.8} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="movingAvg" name={`${maWindow}-pt Moving Avg`} stroke="var(--status-warning)" strokeWidth={2.4} dot={false} />
                    </LineChart>
                  ) : chartMode === 'line' ? (
                    <LineChart data={[...pairedPoints].sort((a, b) => a.x - b.x)} margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <YAxis domain={['auto', 'auto']} padding={{ top: 12, bottom: 12 }} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="y" name={yMeta?.originalName ?? 'Y'} stroke="var(--accent-cyan)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  ) : chartMode === 'multi_overlay' ? (
                    unitCheckOverlay.compatibleForDirectComparison ? (
                      <LineChart data={multiOverlayPoints} margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="idx" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                        <YAxis domain={['auto', 'auto']} padding={{ top: 12, bottom: 12 }} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="valX" name={`${xMeta?.originalName ?? 'X'} (${xMeta?.detectedUnit ?? 'same unit'})`} stroke="var(--accent-blue)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="valY" name={`${yMeta?.originalName ?? 'Y'} (${yMeta?.detectedUnit ?? 'same unit'})`} stroke="var(--accent-cyan)" strokeWidth={2} dot={false} />
                      </LineChart>
                    ) : (
                      <BarChart data={histogramBins}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="bin" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                        <Bar dataKey="count" name={`Fallback Single-Axis Histogram: ${xMeta?.originalName ?? 'X'}`} fill="var(--border-strong)" />
                      </BarChart>
                    )
                  ) : (
                    <ComposedChart data={scatterWithFit} margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} padding={{ left: 10, right: 10 }} name={xMeta?.originalName ?? 'X'} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <YAxis dataKey="y" type="number" domain={['auto', 'auto']} padding={{ top: 12, bottom: 12 }} name={yMeta?.originalName ?? 'Y'} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-strong)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Scatter dataKey="y" name="Observed Points" fill="var(--accent-cyan)" />
                      {regression && (
                        <Line type="linear" dataKey="fitY" name={`OLS Fit (${regression.equationLabel})`} stroke="var(--status-warning)" strokeWidth={2} dot={false} />
                      )}
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Quantitative Summary Footer */}
          {chartMode === 'scatter_regression' && pairedPoints.length >= 3 && (
            <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 font-mono-tabular">
                <span className="text-[var(--accent-cyan)]">
                  Pearson r = {pearson !== null ? pearson.toFixed(4) : 'N/A'}
                </span>
                <span className="text-[var(--accent-blue)]">
                  Spearman rho = {spearman ? spearman.rho : 'N/A'}
                </span>
                {regression && (
                  <span className="text-[var(--text-primary)]">
                    OLS: {regression.equationLabel}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[var(--status-warning)] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Linear / monotonic association only; does not establish physical causation.
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
