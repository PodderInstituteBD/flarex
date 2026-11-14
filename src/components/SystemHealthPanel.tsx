import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Download,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { ClientErrorLogItem } from '../App';
import type { AiProviderTelemetry } from '../utils/aiReliability';
import type { ReproducibleAnalysisRun } from '../utils/scientificAnalysis';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ServerSystemHealthResponse {
  ok: boolean;
  serverTimestamp: string;
  database: {
    title: string;
    totalRecords: number;
    integrityPassed: boolean;
    duplicateIdCount: number;
    averageCompletenessPct: number;
    withPsiIdCount: number;
    withRawDatasetCount: number;
  };
  aiProvider: {
    configured: boolean;
    telemetry: AiProviderTelemetry;
  };
  nasaIntegration: {
    ntrsCacheEntries: number;
    osdrCacheEntries: number;
    psiOpenCacheEntries: number;
    urlCheckCacheEntries: number;
  };
  recentErrors: Array<{
    id: string;
    timestamp: string;
    subsystem: string;
    code: string;
    message: string;
  }>;
}

interface SystemHealthPanelProps {
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
  clientErrors: ClientErrorLogItem[];
}

function downloadDiagnostic(content: string, filename: string, mime: string) {
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

export function SystemHealthPanel({
  ingestedDatasets,
  analysisHistory,
  clientErrors,
}: SystemHealthPanelProps) {
  const [health, setHealth] = useState<ServerSystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const resp = await fetch('/api/system-health');
      if (!resp.ok) {
        setFetchError(`HTTP ${resp.status} querying /api/system-health`);
        return;
      }
      const data = (await resp.json()) as ServerSystemHealthResponse;
      setHealth(data);
    } catch {
      setFetchError('Unable to reach /api/system-health endpoint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const exportDiagnosticJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      serverHealth: health,
      sessionState: {
        ingestedDatasetsCount: ingestedDatasets.length,
        ingestedFilenames: ingestedDatasets.map((d) => d.provenance.originalFilename),
        reproducibleAnalysisRuns: analysisHistory.length,
        clientErrorCount: clientErrors.length,
      },
      clientErrors,
    };
    downloadDiagnostic(
      JSON.stringify(payload, null, 2),
      'flarex_system_health_diagnostic.json',
      'application/json;charset=utf-8'
    );
  };

  const exportDiagnosticMarkdown = () => {
    const t = health?.aiProvider.telemetry;
    const lines = [
      '# FLAREX 5.0 System Health & Diagnostic Report',
      '',
      `- **Generated:** ${new Date().toISOString()}`,
      `- **Database Integrity:** ${health?.database.integrityPassed ? 'PASSED' : 'CHECK REQUIRED'} (${health?.database.totalRecords ?? 0} records, ${health?.database.averageCompletenessPct ?? 0}% avg completeness, ${health?.database.duplicateIdCount ?? 0} duplicate IDs)`,
      `- **Session Ingested Datasets:** ${ingestedDatasets.length}`,
      `- **Reproducible Analysis Runs:** ${analysisHistory.length}`,
      `- **AI Provider Telemetry:** ${t ? `${t.providerName} (${t.model}) — Total: ${t.totalRequests}, Success: ${t.successfulRequests}, Failed: ${t.failedRequests}, Timeouts: ${t.timeoutCount}, Last Latency: ${t.lastLatencyMs ?? 'N/A'} ms` : 'Unavailable'}`,
      `- **NASA Cache Entries:** NTRS=${health?.nasaIntegration.ntrsCacheEntries ?? 0}, OSDR=${health?.nasaIntegration.osdrCacheEntries ?? 0}, PSI-Open=${health?.nasaIntegration.psiOpenCacheEntries ?? 0}, URL-Probe=${health?.nasaIntegration.urlCheckCacheEntries ?? 0}`,
      '',
      '## Recorded Server & Client Errors',
      ...(health?.recentErrors.length
        ? health.recentErrors.map((e) => `- [${e.timestamp}] ${e.subsystem} (${e.code}): ${e.message}`)
        : ['- No recent server subsystem errors recorded.']),
      ...(clientErrors.length
        ? clientErrors.map((e) => `- [${e.timestamp}] Client/${e.source}: ${e.message}`)
        : []),
    ];
    downloadDiagnostic(
      lines.join('\n'),
      'flarex_system_health_diagnostic.md',
      'text/markdown;charset=utf-8'
    );
  };

  const telemetry = health?.aiProvider.telemetry;

  return (
    <Card as="section" aria-labelledby="system-health-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            id="system-health-heading"
            className="font-display text-[17px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
          >
            <Activity className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <span>System Health, AI Telemetry &amp; Diagnostics</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Live server telemetry from <code>/api/system-health</code> combined with active session ingestion &amp; error logs. Zero synthetic uptime metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchHealth()}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh Telemetry</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportDiagnosticJson}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportDiagnosticMarkdown}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export MD</span>
          </Button>
        </div>
      </div>

      {fetchError && (
        <p className="text-xs text-[var(--status-warning)]">{fetchError}</p>
      )}

      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <span className="text-[var(--text-muted)] block text-[11px]">DB Integrity &amp; Completeness</span>
            <p className="font-mono-tabular font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--status-success)]" aria-hidden="true" />
              <span>
                {health.database.totalRecords} records · {health.database.averageCompletenessPct}%
              </span>
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Duplicates: {health.database.duplicateIdCount}
            </p>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <span className="text-[var(--text-muted)] block text-[11px]">Session Data &amp; Reproducibility</span>
            <p className="font-mono-tabular font-semibold text-[var(--accent-blue)]">
              {ingestedDatasets.length} imported · {analysisHistory.length} runs
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Stored in local browser session
            </p>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <span className="text-[var(--text-muted)] block text-[11px]">AI Provider ({telemetry?.model})</span>
            <p className="font-mono-tabular font-semibold text-[var(--text-primary)]">
              {telemetry?.successfulRequests ?? 0}/{telemetry?.totalRequests ?? 0} ok ·{' '}
              {telemetry?.timeoutCount ?? 0} timeouts
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Last latency:{' '}
              {telemetry?.lastLatencyMs !== null && telemetry?.lastLatencyMs !== undefined
                ? `${telemetry.lastLatencyMs} ms`
                : 'No calls yet'}
            </p>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <span className="text-[var(--text-muted)] block text-[11px]">NASA API Caches &amp; Errors</span>
            <p className="font-mono-tabular font-semibold text-[var(--text-primary)]">
              NTRS:{health.nasaIntegration.ntrsCacheEntries} · PSI:{health.nasaIntegration.psiOpenCacheEntries} · OSDR:{health.nasaIntegration.osdrCacheEntries}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Errors logged: {health.recentErrors.length + clientErrors.length}
            </p>
          </div>
        </div>
      )}

      {(health?.recentErrors.length || clientErrors.length) ? (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {health?.recentErrors.map((err) => (
            <div
              key={err.id}
              className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-[var(--text-secondary)] truncate">
                <strong className="text-[var(--status-warning)]">[{err.subsystem}]</strong> {err.code}: {err.message}
              </span>
              <Badge tone="warning">{new Date(err.timestamp).toLocaleTimeString()}</Badge>
            </div>
          ))}
          {clientErrors.map((err) => (
            <div
              key={err.id}
              className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-[var(--text-secondary)] truncate">
                <strong className="text-[var(--status-danger)]">[CLIENT/{err.source}]</strong> {err.message}
              </span>
              <Badge tone="danger">{new Date(err.timestamp).toLocaleTimeString()}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          No failed jobs or runtime API errors recorded in this server/browser session.
        </p>
      )}
    </Card>
  );
}
