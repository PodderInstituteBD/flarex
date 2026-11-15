import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  Compass,
  Download,
  HelpCircle,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord, ResearchGapRecord } from '../types/research';
import { buildGapIntelligence } from '../utils/gapIntelligence';
import {
  exploreResearchQuestion,
  renderResearchBriefMarkdown,
  SAMPLE_RESEARCH_QUESTIONS,
} from '../utils/researchQuestionEngine';
import type { IngestedDatasetPackage } from '../utils/scientificIngestion';
import type { SavedResearchBriefEntry } from '../utils/workspaceStore';

interface ResearchGapExplorerProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
  onAskAiQuestion?: (question: string) => void;
  ingestedDatasets?: IngestedDatasetPackage[];
  onSaveQuestion?: (question: string, classificationLabel: string) => void;
  onSaveBrief?: (brief: Omit<SavedResearchBriefEntry, 'id' | 'createdAt'>) => void;
}

function downloadMd(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ResearchGapExplorer({
  investigations,
  onOpenInvestigation,
  onAskAiQuestion,
  ingestedDatasets = [],
  onSaveQuestion,
  onSaveBrief,
}: ResearchGapExplorerProps) {
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [strengthFilter, setStrengthFilter] = useState<string>('ALL');
  const [provenanceFilter, setProvenanceFilter] = useState<
    'ALL' | 'DOCUMENTED' | 'SYNTHESIS'
  >('ALL');
  const [questionInput, setQuestionInput] = useState(SAMPLE_RESEARCH_QUESTIONS[0]);
  const [submittedQuestion, setSubmittedQuestion] = useState(SAMPLE_RESEARCH_QUESTIONS[0]);

  const activeBrief = useMemo(
    () =>
      exploreResearchQuestion(submittedQuestion, investigations, {
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
      }),
    [submittedQuestion, investigations, ingestedDatasets]
  );

  const briefMarkdown = useMemo(
    () => renderResearchBriefMarkdown(activeBrief),
    [activeBrief]
  );

  const gapAreas = useMemo(
    () => Array.from(new Set(RESEARCH_GAPS.map((g) => g.area))).sort(),
    []
  );

  const filteredGaps = useMemo(() => {
    return RESEARCH_GAPS.filter((g) => {
      if (areaFilter !== 'ALL' && g.area !== areaFilter) return false;
      if (strengthFilter !== 'ALL' && g.evidenceStrength !== strengthFilter) {
        return false;
      }
      if (provenanceFilter === 'DOCUMENTED' && g.isAiSynthesis) return false;
      if (provenanceFilter === 'SYNTHESIS' && !g.isAiSynthesis) return false;
      return true;
    });
  }, [areaFilter, strengthFilter, provenanceFilter]);

  const strengthTone = (
    strength: ResearchGapRecord['evidenceStrength']
  ): BadgeTone => {
    if (strength === 'Strong Dossier Documentation') return 'success';
    if (strength === 'Active Data Gap (Pending Flight Data)') return 'warning';
    return 'blue';
  };

  const resetFilters = () => {
    setAreaFilter('ALL');
    setStrengthFilter('ALL');
    setProvenanceFilter('ALL');
  };

  const gapIntelligence = useMemo(
    () => buildGapIntelligence(investigations, RESEARCH_GAPS),
    [investigations]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge & Telemetry Audit"
        title="Research Question & Gap Intelligence"
        description="Explore scientific combustion questions as 9-part structured research briefs alongside audited dossier gaps—without fabricating conclusions when evidence is absent."
        meta={
          <Badge tone="warning" className="font-mono-tabular">
            {filteredGaps.length} curated + {gapIntelligence.dynamicSignals.length} dynamic signals
          </Badge>
        }
      />

      {/* Module F: Interactive Scientific Research Question Explorer */}
      <Card as="section" aria-labelledby="rq-explorer-heading" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="rq-explorer-heading"
              className="font-display text-base font-bold text-[var(--text-primary)] flex items-center gap-2"
            >
              <Compass className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Scientific Research Question Explorer (9-Part Structured Brief)</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Classifies your scientific question, retrieves grounded investigations and evidence, flags uncertainty/missing telemetry, and produces an exportable research brief.
            </p>
          </div>
          <Badge tone={activeBrief.hasSufficientEvidence ? 'success' : 'warning'}>
            {activeBrief.classification.label}
          </Badge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (questionInput.trim().length >= 2) {
              setSubmittedQuestion(questionInput.trim());
            }
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <Input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask a scientific combustion question..."
            aria-label="Research question query"
            className="flex-1"
          />
          <Button type="submit" variant="primary" size="sm">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Generate Brief</span>
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_RESEARCH_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestionInput(q);
                setSubmittedQuestion(q);
              }}
              className={`text-[11px] px-2.5 py-1 rounded-[6px] border text-left cursor-pointer transition-colors ${
                submittedQuestion === q
                  ? 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/45 text-[var(--accent-blue)] font-medium'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        {!activeBrief.hasSufficientEvidence && (
          <div className="p-3 rounded-[8px] bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/35 text-xs text-[var(--status-warning)]">
            Insufficient direct evidence in the loaded FLAREX dossier for every part of this query. Missing areas are disclosed transparently below rather than fabricated.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
            <p className="font-semibold text-[var(--accent-blue)]">
              1–2. Investigations &amp; Evidence ({activeBrief.relevantInvestigations.length} studies · {activeBrief.availableEvidence.length} items)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeBrief.relevantInvestigations.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenInvestigation(r.id)}
                  className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:underline cursor-pointer"
                >
                  {r.shortName} ({r.gravityContext})
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <p className="font-semibold text-[var(--status-success)]">
              3–4. Findings &amp; Numerical Availability
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {activeBrief.publishedFindings[0]?.finding.slice(0, 150) ??
                'No completed flight findings matched directly.'}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {activeBrief.numericalDataAvailability.explanation}
            </p>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
            <p className="font-semibold text-[var(--status-warning)]">
              5–8. Comparability, Caveats &amp; Open Questions
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {activeBrief.comparisonOpportunities
                ? `Compatibility: ${activeBrief.comparisonOpportunities.compatibilityClass} · ${activeBrief.comparisonOpportunities.findingComparisonClass}`
                : 'Single-study scope.'}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {activeBrief.evidenceLimitations[0] ?? 'See source dossier limitations.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-2">
            {onSaveQuestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onSaveQuestion(
                    activeBrief.researchQuestion,
                    activeBrief.classification.label
                  )
                }
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Question</span>
              </Button>
            )}
            {onSaveBrief && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  onSaveBrief({
                    title: activeBrief.researchQuestion.slice(0, 64),
                    question: activeBrief.researchQuestion,
                    markdown: briefMarkdown,
                    sourceCount: activeBrief.references.length,
                  })
                }
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Research Brief</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadMd(briefMarkdown, 'flarex_research_question_brief.md')
              }
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Brief (.md)</span>
            </Button>
          </div>
          {onAskAiQuestion && (
            <button
              type="button"
              onClick={() => onAskAiQuestion(activeBrief.researchQuestion)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
            >
              <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Synthesize Deeper in AI Analyst</span>
            </button>
          )}
        </div>
      </Card>

      {/* Module 8 Dynamic Gap Signals */}
      <section aria-labelledby="dynamic-gap-signals" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="dynamic-gap-signals"
            className="font-display text-base font-bold text-[var(--text-primary)]"
          >
            FLAREX Research Intelligence Audit ({gapIntelligence.dynamicSignals.length} Computed Signals)
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="cyan">
              {gapIntelligence.coverageAudit.withPeerReviewedDoi}/{gapIntelligence.coverageAudit.totalRecords} w/ DOI
            </Badge>
            <Badge tone="neutral">
              {gapIntelligence.coverageAudit.withCompleteEnvParams}/{gapIntelligence.coverageAudit.totalRecords} Complete Env. Matrix
            </Badge>
            <Badge tone="warning">
              {gapIntelligence.coverageAudit.withRawLocalCsv}/{gapIntelligence.coverageAudit.totalRecords} Local Raw CSV
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {gapIntelligence.dynamicSignals.map((sig) => (
            <Card key={sig.id} padding="sm" className="space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2">
                <Badge tone="warning">{sig.signalLabel}</Badge>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {sig.title}
                </h3>
                <div className="text-xs text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
                  <p>
                    <strong className="text-[var(--text-primary)]">Evidence used:</strong>{' '}
                    {sig.evidenceBasis}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Missing information:</strong>{' '}
                    {sig.missingInformation}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    <strong className="text-[var(--status-warning)]">Limitations:</strong>{' '}
                    {sig.caveat}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-[11px] text-[var(--text-muted)] mr-1">
                    Supporting records:
                  </span>
                  {sig.affectedInvestigationIds.slice(0, 4).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenInvestigation(id)}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:underline cursor-pointer"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
              {onAskAiQuestion && sig.suggestedQuestions[0] && (
                <button
                  type="button"
                  onClick={() => onAskAiQuestion(sig.suggestedQuestions[0])}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-blue)] hover:underline pt-1 cursor-pointer text-left"
                >
                  <MessageSquareText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Explore Question in AI Analyst</span>
                </button>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Suggested Future Research Questions */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Suggested Future Investigation Questions
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gapIntelligence.suggestedResearchQuestions.map((item) => (
            <div
              key={item.question}
              className="p-3 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-cyan)]">
                {item.relatedArea}
              </span>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                {item.question}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {item.relatedIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenInvestigation(id)}
                      className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] cursor-pointer"
                    >
                      {id}
                    </button>
                  ))}
                </div>
                {onAskAiQuestion && (
                  <button
                    type="button"
                    onClick={() => onAskAiQuestion(item.question)}
                    className="text-[11px] font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
                  >
                    Ask AI
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Gap Filters */}
      <Card as="section" padding="sm" aria-label="Filter research gaps">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="gap-area-filter" className="sr-only">
              Filter by gap category
            </label>
            <Select
              id="gap-area-filter"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            >
              <option value="ALL">All Gap Categories ({gapAreas.length})</option>
              {gapAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="gap-strength-filter" className="sr-only">
              Filter by evidence strength
            </label>
            <Select
              id="gap-strength-filter"
              value={strengthFilter}
              onChange={(e) => setStrengthFilter(e.target.value)}
            >
              <option value="ALL">All Evidence Strengths</option>
              <option value="Strong Dossier Documentation">
                Strong Dossier Documentation
              </option>
              <option value="Active Data Gap (Pending Flight Data)">
                Active Data Gap (Pending Flight Data)
              </option>
              <option value="Moderate / Emerging Evidence">
                Moderate / Emerging Evidence
              </option>
            </Select>
          </div>

          <div>
            <label htmlFor="gap-provenance-filter" className="sr-only">
              Filter by gap provenance
            </label>
            <Select
              id="gap-provenance-filter"
              value={provenanceFilter}
              onChange={(e) =>
                setProvenanceFilter(
                  e.target.value as 'ALL' | 'DOCUMENTED' | 'SYNTHESIS'
                )
              }
            >
              <option value="ALL">All Gap Sources (Dossier + Synthesis)</option>
              <option value="DOCUMENTED">Published / Dossier Documented</option>
              <option value="SYNTHESIS">Cross-Study Synthesis (Interpretive)</option>
            </Select>
          </div>
        </div>
      </Card>

      {filteredGaps.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="w-5 h-5" aria-hidden="true" />}
          title="No research gaps match the selected filters."
          description="Reset the gap category or evidence strength filter to view all documented microgravity fire-safety knowledge gaps."
          action={
            <Button type="button" variant="primary" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reset Gap Filters</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap) => {
            const related = gap.relatedInvestigationIds
              .map((id) => investigations.find((r) => r.id === id))
              .filter((r): r is InvestigationRecord => Boolean(r));

            return (
              <Card key={gap.id} as="article" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {gap.area}
                    </span>
                    <Badge tone={strengthTone(gap.evidenceStrength)}>
                      {gap.evidenceStrength}
                    </Badge>
                  </div>

                  {gap.isAiSynthesis ? (
                    <Badge tone="violet">
                      Cross-Study Synthesis (Not an Official NASA Conclusion)
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Documented in Dossier</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <h2 className="font-display text-[18px] font-semibold text-[var(--text-primary)] flex items-start gap-2.5">
                    <ShieldAlert
                      className="w-5 h-5 text-[var(--status-warning)] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{gap.title}</span>
                  </h2>
                  <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                    {gap.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
                    <h3 className="text-xs font-semibold text-[var(--accent-blue)]">
                      Why It Matters for Space Fire Safety
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {gap.whyItMatters}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
                    <h3 className="text-xs font-semibold text-[var(--status-warning)] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Missing Information &amp; Limitations</span>
                    </h3>
                    <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside leading-relaxed">
                      {gap.limitations.map((lim) => (
                        <li key={lim}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                  <p className="text-xs text-[var(--text-secondary)]">
                    <strong className="font-medium text-[var(--text-primary)]">
                      Supporting Sources:{' '}
                    </strong>
                    {gap.supportingSources.join(' · ')}
                  </p>

                  {related.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">
                        Related investigations:
                      </span>
                      {related.map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => onOpenInvestigation(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-[6px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:border-[var(--accent-blue)]/55 cursor-pointer"
                        >
                          <span>{inv.shortName}</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
