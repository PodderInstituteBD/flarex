import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { ActiveAiDocumentContext } from '../App';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingSkeleton, NoticeBanner } from '../components/ui/States';
import { InvestigationRecord } from '../types/research';
import type { AiAnswerMode } from '../utils/aiReliability';
import {
  buildRetrievedSourceRefs,
  CitationValidationSummary,
  RagQueryClassification,
  RagRetrievalDiagnostics,
  RetrievedSourceCitation,
  runAdvancedRagRetrieval,
  validateCitations,
} from '../utils/ragPipeline';

type AnalysisMode = 'concept' | 'comparison' | 'evidence' | 'outline';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  model?: string;
  answerMode?: AiAnswerMode;
  latencyMs?: number;
  classification?: RagQueryClassification;
  sources?: RetrievedSourceCitation[];
  diagnostics?: RagRetrievalDiagnostics;
  citationValidation?: CitationValidationSummary;
  retryPrompt?: string;
}

interface AiAssistantProps {
  investigations: InvestigationRecord[];
  initialFocusId?: string | null;
  initialPrompt?: string | null;
  inputFocusTrigger?: number;
  onOpenInvestigation: (id: string) => void;
  attachedDocument?: ActiveAiDocumentContext | null;
  onClearAttachedDocument?: () => void;
  onRecordClientError?: (source: string, message: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'Explain how combustion differs in microgravity.',
  'Compare BASS-II and Saffire.',
  'What is the purpose of ACME?',
  'Which investigations study smoke detection?',
  'What are the major research gaps in partial-gravity combustion?',
  'Explain the difference between FLEX and FLEX-2.',
];

export function AiAssistant({
  investigations,
  initialFocusId = null,
  initialPrompt = null,
  inputFocusTrigger = 0,
  onOpenInvestigation,
  attachedDocument = null,
  onClearAttachedDocument,
  onRecordClientError,
}: AiAssistantProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [focusId, setFocusId] = useState<string>(initialFocusId ?? '');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('concept');
  const [answerMode, setAnswerMode] = useState<AiAnswerMode>(
    attachedDocument ? 'document' : 'grounded'
  );
  const [expandedDiagnosticsId, setExpandedDiagnosticsId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    aiConfigured: boolean;
    model: string;
  } | null>(null);

  useEffect(() => {
    if (attachedDocument) {
      setAnswerMode('document');
    }
  }, [attachedDocument]);

  useEffect(() => {
    if (inputFocusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [inputFocusTrigger]);

  useEffect(() => {
    if (initialFocusId) setFocusId(initialFocusId);
    if (initialPrompt) setInput(initialPrompt);
  }, [initialFocusId, initialPrompt]);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { aiConfigured?: boolean; model?: string }) => {
        if (active) {
          setHealthInfo({
            aiConfigured: Boolean(data.aiConfigured),
            model: data.model || 'gemini-4-hydrogen',
          });
        }
      })
      .catch(() => {
        if (active) setHealthInfo(null);
      });
    return () => {
      active = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const generateDeterministicBrief = (questionText: string) => {
    setValidationError(null);
    const query = questionText.trim() || 'Microgravity fire safety overview';
    const rag = runAdvancedRagRetrieval(query, investigations, {
      maxResults: 4,
      focusInvestigationId: focusId || undefined,
      documentTitle: attachedDocument?.title,
    });
    const hits = rag.selectedRecords;
    const refs = buildRetrievedSourceRefs(hits);
    const facts = hits
      .map(
        (r) =>
          `• ${r.shortName} (${r.platform} · ${r.gravityContext} · ${r.evidenceType}): ${r.reportedFindings ?? r.overview} [Source: ${r.sourceUrl}]`
      )
      .join('\n');
    const caveats = hits
      .map((r) => `• ${r.shortName} caveat: ${r.limitations[0] ?? 'See source dossier.'}`)
      .join('\n');
    const briefText = `Documented Dossier Facts (Extracted Deterministically — Non-Generative Local Brief Mode):\n${facts}\n\nDocumented Limitations & Boundaries:\n${caveats}`;

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: query },
      {
        id: `a-${Date.now() + 1}`,
        role: 'assistant',
        answerMode: 'local',
        model: 'Mode C: Deterministic Local Brief (Non-Generative)',
        classification: rag.diagnostics.classification,
        text: briefText,
        sources: refs,
        diagnostics: rag.diagnostics,
        citationValidation: validateCitations(briefText, refs, investigations),
      },
    ]);
  };

  const handleCancelRequest = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  };

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (trimmed.length < 2) {
      setValidationError('Enter at least 2 characters to submit a research query.');
      return;
    }
    if (loading) return;
    setValidationError(null);

    if (answerMode === 'local') {
      setInput('');
      generateDeterministicBrief(trimmed);
      return;
    }

    if (answerMode === 'document' && !attachedDocument) {
      setValidationError(
        'Document Analysis Mode requires an attached document (fetch an NTRS .txt in Sources or load a file in Document Intelligence).'
      );
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const historyPayload = messages
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
        m.role === 'user' || m.role === 'assistant'
      )
      .slice(-6)
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          focusInvestigationId: focusId || undefined,
          analysisMode,
          answerMode,
          documentContext:
            answerMode === 'document' && attachedDocument
              ? {
                  title: attachedDocument.title,
                  sourceUrl: attachedDocument.sourceUrl,
                  excerpt: attachedDocument.content.slice(0, 5000),
                }
              : undefined,
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        model?: string;
        latencyMs?: number;
        answerMode?: AiAnswerMode;
        queryClassification?: RagQueryClassification;
        retrievedSources?: RetrievedSourceCitation[];
        ragDiagnostics?: RagRetrievalDiagnostics;
        citationValidation?: CitationValidationSummary;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        const errMsg =
          payload.message ||
          `Assistant request failed (HTTP ${response.status}). FLAREX never fabricates an AI answer when the API call fails.`;
        onRecordClientError?.('AiAssistant', errMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'error',
            retryPrompt: trimmed,
            text: errMsg,
          },
        ]);
        return;
      }

      const fallbackRag = runAdvancedRagRetrieval(trimmed, investigations, {
        maxResults: 4,
        focusInvestigationId: focusId || undefined,
        documentTitle: attachedDocument?.title,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          answerMode: payload.answerMode ?? answerMode,
          latencyMs: payload.latencyMs,
          text: payload.answer || 'No response text returned.',
          model: payload.model,
          classification:
            payload.queryClassification ?? fallbackRag.diagnostics.classification,
          sources: payload.retrievedSources ?? [],
          diagnostics: payload.ragDiagnostics ?? fallbackRag.diagnostics,
          citationValidation: payload.citationValidation,
        },
      ]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'error',
            retryPrompt: trimmed,
            text: 'Request cancelled by researcher. Switch to Mode C (Local Brief) for instant deterministic extraction.',
          },
        ]);
      } else {
        const errMsg =
          'Network error reaching the FLAREX backend assistant endpoint. All local exploration tools remain operational.';
        onRecordClientError?.('AiAssistant', errMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'error',
            retryPrompt: trimmed,
            text: errMsg,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleCopyAnswer = async (msg: ChatMessage) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.text);
        setCopiedId(msg.id);
        window.setTimeout(() => {
          setCopiedId((cur) => (cur === msg.id ? null : cur));
        }, 2000);
      }
    } catch {
      // Ignore clipboard rejection in restricted iframes
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Grounded Synthesis Workspace"
        title="FLAREX Research Intelligence"
        description="Ask microgravity combustion questions grounded in deterministic top-4 dossier retrieval, explicit PSI/NTRS source citations, and documented data-quality boundaries."
        actions={
          messages.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Conversation</span>
            </Button>
          ) : undefined
        }
      />

      {healthInfo && !healthInfo.aiConfigured && (
        <NoticeBanner tone="warning" title="Server Gemini API Key Not Configured">
          <code>GEMINI_API_KEY</code> is not set in the server environment (Settings &gt; Secrets or <code>.env</code>). Submitting a prompt returns an honest error notice rather than a simulated answer. All local FLAREX search, comparison, gap audit, and source tools remain 100% functional.
        </NoticeBanner>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Conversation Workspace */}
        <Card
          as="section"
          padding="none"
          aria-label="FLAREX Research Intelligence chat"
          className="lg:col-span-8 flex flex-col min-h-[540px] overflow-hidden"
        >
          {/* Mode A / Mode B / Mode C Selector Bar */}
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] flex flex-wrap items-center justify-between gap-2">
            <div
              role="radiogroup"
              aria-label="Select FLAREX answer mode"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: 'grounded', label: 'Mode A: Grounded Research' },
                  { id: 'document', label: 'Mode B: Document Analysis' },
                  { id: 'local', label: 'Mode C: Local Brief (Non-AI)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={answerMode === m.id}
                  onClick={() => setAnswerMode(m.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-[6px] border transition-colors cursor-pointer whitespace-nowrap ${
                    answerMode === m.id
                      ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {attachedDocument && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/35 text-[11px] text-[var(--accent-cyan)]">
                <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[200px]">{attachedDocument.title}</span>
                {onClearAttachedDocument && (
                  <button
                    type="button"
                    aria-label="Detach attached document"
                    onClick={onClearAttachedDocument}
                    className="hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Context Bar */}
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0 flex-1">
              <MessageSquareText
                className="w-4 h-4 text-[var(--accent-blue)] shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">
                {answerMode === 'local'
                  ? 'Mode C: Deterministic retrieval (instant, zero LLM calls)'
                  : answerMode === 'document'
                  ? 'Mode B: Live Gemini over attached document + top-4 dossier records'
                  : `Mode A: Bounded top-4 RAG${healthInfo?.model ? ` · ${healthInfo.model}` : ''}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select
                id="assistant-mode"
                aria-label="Select AI analysis mode"
                value={analysisMode}
                onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
                className="py-1.5 text-xs !w-full sm:!w-[170px]"
              >
                <option value="concept">Concept &amp; Design</option>
                <option value="comparison">Cross-Study Compare</option>
                <option value="evidence">Evidence &amp; Limitations</option>
                <option value="outline">Review Outline &amp; Gaps</option>
              </Select>
              <label
                htmlFor="assistant-focus"
                className="text-xs text-[var(--text-muted)] shrink-0 whitespace-nowrap"
              >
                Focus:
              </label>
              <Select
                id="assistant-focus"
                value={focusId}
                onChange={(e) => setFocusId(e.target.value)}
                className="py-1.5 text-xs !w-full sm:!w-[175px]"
              >
                <option value="">
                  Auto ({investigations.length} records)
                </option>
                {investigations.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.shortName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[540px]">
            {messages.length === 0 ? (
              <div className="py-12 text-center max-w-md mx-auto space-y-3">
                <div className="w-10 h-10 mx-auto rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-blue)]">
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <p className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Ask a scientific question grounded in the FLAREX database
                </p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Select a prompt from the Suggested Questions panel or enter your own query below. Every answer cites retrieved PSI IDs, NTRS records, and source boundaries.
                </p>
              </div>
            ) : (
              messages.map((msg) =>
                msg.role === 'error' ? (
                  <div key={msg.id} className="space-y-2">
                    <ErrorState
                      title="AI Service Unavailable"
                      message={msg.text}
                    />
                    {msg.retryPrompt && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => generateDeterministicBrief(msg.retryPrompt!)}
                        >
                          <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Deterministic Grounded Brief</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={() => void sendQuestion(msg.retryPrompt!)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Retry AI Request</span>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className={`rounded-[12px] p-4 space-y-3 border ${
                      msg.role === 'user'
                        ? 'bg-[var(--accent-blue)]/8 border-[var(--accent-blue)]/30 ml-4 sm:ml-12'
                        : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] mr-2 sm:mr-6'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={msg.role === 'user' ? 'blue' : 'violet'}>
                          {msg.role === 'user'
                            ? 'Researcher Query'
                            : 'FLAREX Research Intelligence'}
                        </Badge>
                        {msg.classification && (
                          <Badge tone="cyan">{msg.classification.label}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {msg.model && (
                          <span className="font-mono-tabular text-[var(--text-muted)]">
                            {msg.model}
                            {msg.latencyMs ? ` (${(msg.latencyMs / 1000).toFixed(1)}s)` : ''}
                          </span>
                        )}
                        {msg.role === 'assistant' && msg.diagnostics && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDiagnosticsId((cur) =>
                                cur === msg.id ? null : msg.id
                              )
                            }
                            aria-expanded={expandedDiagnosticsId === msg.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] cursor-pointer"
                          >
                            {expandedDiagnosticsId === msg.id ? (
                              <ChevronUp className="w-3 h-3" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3 h-3" aria-hidden="true" />
                            )}
                            <span>Retrieval Diagnostics</span>
                          </button>
                        )}
                        {msg.role === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => void handleCopyAnswer(msg)}
                            aria-label="Copy AI response"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-[var(--status-success)]" aria-hidden="true" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" aria-hidden="true" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[14px] leading-[1.65] text-[var(--text-primary)] whitespace-pre-wrap">
                      {msg.text}
                    </div>

                    {msg.diagnostics && expandedDiagnosticsId === msg.id && (
                      <div className="p-3 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold uppercase tracking-wider text-[var(--accent-cyan)]">
                            RAG Retrieval Diagnostics
                          </span>
                          {msg.citationValidation && (
                            <Badge
                              tone={
                                msg.citationValidation.allCitationsValid
                                  ? 'success'
                                  : 'warning'
                              }
                            >
                              Citations Validated: {msg.citationValidation.validRefs}/
                              {msg.citationValidation.totalRefs}
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono-tabular text-[var(--text-secondary)]">
                          Normalized Tokens: [{msg.diagnostics.normalizedQuery.tokens.join(', ') || 'none'}] · Expanded: [{msg.diagnostics.normalizedQuery.expandedTokens.slice(0, 10).join(', ')}]
                        </p>
                        <div className="space-y-1">
                          <p className="font-semibold text-[var(--text-primary)]">
                            Selected Top-{msg.diagnostics.selectedRecords.length} of {msg.diagnostics.totalCorpusCount}:
                          </p>
                          {msg.diagnostics.selectedRecords.map((cand) => (
                            <p key={cand.id} className="font-mono-tabular text-[var(--text-secondary)]">
                              • {cand.shortName} (score {cand.score}) — fields: {cand.matchedFields.join(', ') || 'fallback'}
                            </p>
                          ))}
                        </div>
                        {msg.diagnostics.missingEvidenceWarnings.length > 0 && (
                          <div className="text-[var(--status-warning)] space-y-0.5">
                            {msg.diagnostics.missingEvidenceWarnings.map((w, i) => (
                              <p key={i}>⚠ {w}</p>
                            ))}
                          </div>
                        )}
                        <p className="text-[var(--text-muted)]">
                          Excluded ({msg.diagnostics.excludedRecords.length} records):{' '}
                          {msg.diagnostics.excludedRecords
                            .slice(0, 4)
                            .map((ex) => `${ex.shortName} (score ${ex.score})`)
                            .join(', ')}
                        </p>
                      </div>
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          Grounded Citations &amp; Limitations ({msg.sources.length} Retrieved Records)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src) => (
                            <div
                              key={src.id}
                              className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenInvestigation(src.id)}
                                  className="text-[var(--accent-blue)] hover:underline font-semibold text-left cursor-pointer"
                                >
                                  {src.shortName}
                                </button>
                                <Badge tone="neutral">{src.evidenceType}</Badge>
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                                {src.sourceLabel}
                                {src.psiId ? ` · PSI ${src.psiId}` : ''}
                                {src.ntrsDocumentId ? ` · NTRS ${src.ntrsDocumentId}` : ''}
                              </p>
                              <p className="text-[11px] text-[var(--status-warning)]">
                                Limitation: {src.primaryLimitation}
                              </p>
                              <a
                                href={src.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open external source for ${src.shortName}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-cyan)] hover:underline"
                              >
                                <span>Open Original Source</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )
            )}

            {loading && (
              <div aria-live="polite" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Running RAG pipeline: Query normalization → Top-4 retrieval → Grounded Gemini synthesis...
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelRequest}
                  >
                    <Square className="w-3 h-3" aria-hidden="true" />
                    <span>Cancel Request</span>
                  </Button>
                </div>
                <LoadingSkeleton rows={2} />
              </div>
            )}
          </div>

          {/* Prompt Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-2"
          >
            <div className="flex items-center gap-2.5">
              <label htmlFor="assistant-input" className="sr-only">
                Ask FLAREX Research Intelligence
              </label>
              <Input
                ref={inputRef}
                id="assistant-input"
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (validationError && e.target.value.trim().length >= 2) {
                    setValidationError(null);
                  }
                }}
                placeholder="Ask about microgravity flames, PSI datasets, limitations, or gaps..."
                disabled={loading}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => generateDeterministicBrief(input)}
                title="Generate instant factual brief from retrieved FLAREX records without calling Gemini"
              >
                <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Local Brief</span>
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Ask</span>
              </Button>
            </div>
            {validationError && (
              <p role="alert" className="text-xs text-[var(--status-warning)]">
                {validationError}
              </p>
            )}
          </form>
        </Card>

        {/* Suggested Questions & Scientific Guardrails */}
        <aside className="lg:col-span-4 space-y-4">
          <Card as="section" className="space-y-3">
            <h2 className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
              Suggested Questions
            </h2>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => void sendQuestion(q)}
                  className="w-full p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)]/55 text-left text-xs font-medium text-[var(--text-primary)] leading-relaxed transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {q}
                </button>
              ))}
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void sendQuestion(
                    'Generate 3 open student research questions grounded in documented FLAREX limitations and missing partial-gravity or SoFIE flight data.'
                  )
                }
                className="w-full p-3 rounded-[8px] bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/35 hover:border-[var(--accent-blue)] text-left text-xs font-semibold text-[var(--accent-blue)] leading-relaxed transition-colors disabled:opacity-50 cursor-pointer"
              >
                Generate 3 Open Research Questions
              </button>
            </div>
          </Card>

          <Card as="section" className="space-y-2.5 text-xs text-[var(--text-secondary)]">
            <h2 className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
              AI Scientific Guardrails
            </h2>
            <ul className="space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Retrieves only the top 4 relevant records rather than sending the entire database.</li>
              <li>Distinguishes documented dossier facts from AI synthesis.</li>
              <li>Never fabricates DOIs, raw measurements, or outcomes for planned SoFIE/ACME studies.</li>
              <li>Separates terrestrial 1g battery tests and E-FIELD electrostatic tests from partial gravity.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
