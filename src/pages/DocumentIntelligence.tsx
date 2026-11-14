import React, { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileCode2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import {
  BUNDLED_DATABASE_JSON_PATH,
  BUNDLED_DOSSIER_PDF_PATH,
  DocumentEvidenceLabel,
  DocumentExtractionResult,
  DOSSIER_PAGE_LOCATOR,
  extractDocumentIntelligence,
  ExtractedDocumentField,
} from '../utils/documentIntelligence';

interface DocumentIntelligenceProps {
  onOpenInvestigation: (id: string) => void;
}

function labelTone(label: DocumentEvidenceLabel): BadgeTone {
  switch (label) {
    case 'Directly stated in source':
      return 'success';
    case 'Extracted from source':
      return 'blue';
    case 'AI-generated interpretation':
      return 'violet';
    case 'Not verified':
      return 'warning';
    case 'Not available':
      return 'neutral';
  }
}

function FieldListCard({
  title,
  items,
  emptyLabel = 'Not available in parsed source content.',
}: {
  title: string;
  items: ExtractedDocumentField[];
  emptyLabel?: string;
}) {
  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
          {title}
        </h3>
        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
          {items.length} item(s)
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>{emptyLabel}</span>
          <Badge tone="neutral">Not available</Badge>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li
              key={`${item.label}-${idx}`}
              className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {item.label} · <span className="font-mono-tabular">{item.sourceLocation}</span>
                </span>
                <Badge tone={labelTone(item.evidenceLabel)}>
                  {item.evidenceLabel}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                {item.value}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DocumentIntelligence({
  onOpenInvestigation,
}: DocumentIntelligenceProps) {
  const [result, setResult] = useState<DocumentExtractionResult | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setAiAnalysisText(null);
    try {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Please select a scientific document under 5 MB.');
        return;
      }
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(buffer);
        setResult(extractDocumentIntelligence(file.name, raw, file.size));
      } else {
        const text = await file.text();
        setResult(extractDocumentIntelligence(file.name, text, file.size));
      }
    } catch {
      setErrorMsg('Unable to read the selected file.');
    }
  };

  const loadBundledAsset = async (
    url: string,
    fileName: string,
    isPdf: boolean
  ) => {
    setLoadingSample(true);
    setErrorMsg(null);
    setAiAnalysisText(null);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      if (isPdf) {
        const buf = await resp.arrayBuffer();
        const raw = new TextDecoder('latin1').decode(buf);
        setResult(extractDocumentIntelligence(fileName, raw, buf.byteLength));
      } else {
        const txt = await resp.text();
        setResult(extractDocumentIntelligence(fileName, txt, txt.length));
      }
    } catch {
      setErrorMsg(`Could not load bundled document (${fileName}).`);
    } finally {
      setLoadingSample(false);
    }
  };

  const loadBuiltInCsvSample = () => {
    setErrorMsg(null);
    setAiAnalysisText(null);
    const sampleCsv = [
      'test_id,fuel,oxygen_pct,airflow_cm_s,pressure_atm,observation',
      'BASS2-TM-01,Cotton fabric (thin solid),18.2,0.8,1.0,Sustained dim flame extinction threshold observed',
      'BASS2-TM-02,PMMA cylindrical rod,21.0,1.5,1.0,Radiative loss limits spread in low coflow',
      'BASS2-TM-03,Silicone wire insulation,20.9,0.5,1.0,Sustained glowing combustion noted in microgravity',
    ].join('\n');
    setResult(
      extractDocumentIntelligence('sample_psi_combustion_log.csv', sampleCsv, sampleCsv.length)
    );
  };

  const runAiExcerptInterpretation = async () => {
    if (!result) return;
    setAiLoading(true);
    setAiAnalysisText(null);
    try {
      const excerpt = [
        `Document: ${result.fileName} (${result.format})`,
        `Title: ${result.title}`,
        `Scientific Terms: ${result.scientificTerms.join(', ') || 'None'}`,
        `Preview:\n${result.rawPreview.slice(0, 900)}`,
      ].join('\n');
      const resp = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisMode: 'evidence',
          message: `Review this uploaded document excerpt strictly against the FLAREX dossier without inventing facts:\n\n${excerpt}`,
        }),
      });
      const data = (await resp.json()) as { answer?: string; message?: string };
      if (!resp.ok) {
        setAiAnalysisText(
          data.message || 'AI excerpt interpretation unavailable from backend API.'
        );
      } else {
        setAiAnalysisText(data.answer ?? 'No AI output returned.');
      }
    } catch {
      setAiAnalysisText('Network error contacting /api/assistant.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scientific Document Intelligence"
        title="Multi-Format Document Parser & Dossier Page Locator"
        description="Inspect JSON, CSV, XML, TXT, and PDF files locally in your browser. Extracted fields are strictly labeled as directly stated, extracted, AI interpretation, not verified, or not available."
      />

      {/* Upload & Bundled Source Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card padding="md" className="lg:col-span-7 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Inspect Local File or Bundled FLAREX Sources
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[8px] bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] text-xs font-semibold cursor-pointer hover:bg-[var(--accent-blue-hover)] transition-colors">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload CSV / JSON / TXT / XML / PDF</span>
              <input
                type="file"
                accept=".csv,.json,.txt,.xml,.pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <Button
              variant="secondary"
              size="sm"
              disabled={loadingSample}
              onClick={() =>
                void loadBundledAsset(
                  BUNDLED_DATABASE_JSON_PATH,
                  'flarex_research_database.json',
                  false
                )
              }
            >
              <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Parse Bundled JSON DB</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={loadingSample}
              onClick={() =>
                void loadBundledAsset(
                  BUNDLED_DOSSIER_PDF_PATH,
                  'Project_Research_Dossier_2026.pdf',
                  true
                )
              }
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Inspect Bundled Dossier PDF</span>
            </Button>

            <Button variant="outline" size="sm" onClick={loadBuiltInCsvSample}>
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sample PSI CSV</span>
            </Button>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">
              Direct download / browser PDF viewer for original dossier:
            </span>
            <a
              href={BUNDLED_DOSSIER_PDF_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[var(--accent-blue)] font-medium hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Original Research Dossier PDF</span>
            </a>
          </div>

          {errorMsg && (
            <p className="text-xs text-[var(--status-danger)]">{errorMsg}</p>
          )}
        </Card>

        {/* PDF Page & Section Locator */}
        <Card padding="md" className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Dossier Page-to-Investigation Locator
            </h2>
            <Badge tone="cyan">PDF Map</Badge>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {DOSSIER_PAGE_LOCATOR.map((entry) => (
              <div
                key={entry.page}
                className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-blue)]">
                    Dossier Page {entry.page}
                  </span>
                  <a
                    href={`${BUNDLED_DOSSIER_PDF_PATH}#page=${entry.page}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Jump to p.{entry.page}</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
                <p className="text-xs font-medium text-[var(--text-primary)]">
                  {entry.sectionTitle}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {entry.keyContents}
                </p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {entry.coveredInvestigations.slice(0, 4).map((invId) => (
                    <button
                      key={invId}
                      type="button"
                      onClick={() => onOpenInvestigation(invId)}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] cursor-pointer"
                    >
                      {invId}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Extracted Results */}
      {!result ? (
        <Card padding="lg" className="text-center space-y-2">
          <FileSearch
            className="w-8 h-8 text-[var(--accent-blue)] mx-auto"
            aria-hidden="true"
          />
          <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
            No document loaded yet
          </p>
          <p className="text-xs text-[var(--text-secondary)] max-w-xl mx-auto">
            Upload a scientific CSV, JSON, XML, TXT, or PDF file—or click &ldquo;Parse Bundled JSON DB&rdquo; or &ldquo;Sample PSI CSV&rdquo; above—to extract metadata, variables, methods, findings, limitations, and references with strict provenance tags.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card padding="md" className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{result.format}</Badge>
                  <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                    {(result.byteSize / 1024).toFixed(1)} KB
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)] mt-1">
                  {result.title}
                </h2>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void runAiExcerptInterpretation()}
                disabled={aiLoading}
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-violet)]" aria-hidden="true" />
                <span>
                  {aiLoading ? 'Analyzing Excerpt...' : 'AI Interpret Excerpt'}
                </span>
              </Button>
            </div>

            {result.warnings.length > 0 && (
              <div className="p-3 rounded-[8px] bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/30 flex items-start gap-2 text-xs text-[var(--text-primary)]">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            {result.scientificTerms.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Detected Combustion Terminology
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {result.scientificTerms.join(' · ')}
                </p>
              </div>
            )}

            {aiAnalysisText && (
              <div className="p-3.5 rounded-[10px] bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/30 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    AI Interpretation Output
                  </span>
                  <Badge tone="violet">AI-generated interpretation</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                  {aiAnalysisText}
                </p>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FieldListCard title="Document Metadata" items={result.metadata} />
            <FieldListCard title="Objectives & Scientific Purpose" items={result.objectives} />
            <FieldListCard title="Experimental Variables & Schema" items={result.experimentalVariables} />
            <FieldListCard title="Sensors & Measurement Methods" items={result.measurementMethods} />
            <FieldListCard title="Reported Findings" items={result.findings} />
            <FieldListCard title="Documented Limitations & Caveats" items={result.limitations} />
          </div>

          <FieldListCard title="Extracted References & Identifiers" items={result.references} />

          {result.rawPreview && (
            <Card padding="md" className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Raw Source Excerpt Preview
              </p>
              <pre className="p-3 rounded-[8px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] font-mono-tabular text-[var(--text-secondary)] overflow-x-auto max-h-64">
                {result.rawPreview}
              </pre>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
