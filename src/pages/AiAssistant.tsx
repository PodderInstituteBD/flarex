import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingSkeleton, NoticeBanner } from '../components/ui/States';
import { InvestigationRecord } from '../types/research';

interface RetrievedSourceRef {
  id: string;
  shortName: string;
  name: string;
  evidenceType: string;
  psiId: string | null;
  sourceUrl: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  model?: string;
  sources?: RetrievedSourceRef[];
  retryPrompt?: string;
}

interface AiAssistantProps {
  investigations: InvestigationRecord[];
  initialFocusId?: string | null;
  initialPrompt?: string | null;
  inputFocusTrigger?: number;
  onOpenInvestigation: (id: string) => void;
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
}: AiAssistantProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [focusId, setFocusId] = useState<string>(initialFocusId ?? '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [healthInfo, setHealthInfo] = useState<{
    aiConfigured: boolean;
    model: string;
  } | null>(null);

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
    };
  }, []);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

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

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          focusInvestigationId: focusId || undefined,
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        model?: string;
        retrievedSources?: RetrievedSourceRef[];
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'error',
            retryPrompt: trimmed,
            text:
              payload.message ||
              `Assistant request failed (HTTP ${response.status}). FLAREX never fabricates an AI answer when the API call fails.`,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: payload.answer || 'No response text returned.',
          model: payload.model,
          sources: payload.retrievedSources ?? [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'error',
          retryPrompt: trimmed,
          text: 'Network error reaching the FLAREX backend assistant endpoint. All local exploration tools remain operational.',
        },
      ]);
    } finally {
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
          {/* Context Bar */}
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0 flex-1">
              <MessageSquareText
                className="w-4 h-4 text-[var(--accent-blue)] shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">
                Bounded retrieval: Top 4 matching records
                {healthInfo?.model ? ` · ${healthInfo.model}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="assistant-focus"
                className="text-xs text-[var(--text-muted)] shrink-0 whitespace-nowrap"
              >
                Focus study:
              </label>
              <Select
                id="assistant-focus"
                value={focusId}
                onChange={(e) => setFocusId(e.target.value)}
                className="py-1.5 text-xs !w-full sm:!w-[210px]"
              >
                <option value="">
                  Auto-retrieve ({investigations.length} records)
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
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={() => void sendQuestion(msg.retryPrompt!)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Retry Question</span>
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
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <Badge tone={msg.role === 'user' ? 'blue' : 'violet'}>
                        {msg.role === 'user'
                          ? 'Researcher Query'
                          : 'FLAREX Research Intelligence'}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {msg.model && (
                          <span className="font-mono-tabular text-[var(--text-muted)]">
                            {msg.model}
                          </span>
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

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          Cited Dossier Sources ({msg.sources.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((src) => (
                            <div
                              key={src.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => onOpenInvestigation(src.id)}
                                className="text-[var(--accent-blue)] hover:underline font-medium cursor-pointer"
                              >
                                {src.shortName}
                              </button>
                              {src.psiId && (
                                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                                  ({src.psiId})
                                </span>
                              )}
                              <a
                                href={src.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open external source for ${src.shortName}`}
                                className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
                              >
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
                <p className="text-xs text-[var(--text-secondary)]">
                  Retrieving relevant dossier records and querying Gemini...
                </p>
                <LoadingSkeleton rows={2} />
              </div>
            )}
          </div>

          {/* Prompt Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center gap-2.5"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask FLAREX Research Intelligence
            </label>
            <Input
              ref={inputRef}
              id="assistant-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about microgravity flames, PSI datasets, limitations, or gaps..."
              disabled={loading}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={loading || input.trim().length < 2}
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Ask</span>
            </Button>
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
