import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord, ResearchGapRecord } from '../types/research';
import { buildGapIntelligence } from '../utils/gapIntelligence';

interface ResearchGapExplorerProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
  onAskAiQuestion?: (question: string) => void;
}

export function ResearchGapExplorer({
  investigations,
  onOpenInvestigation,
  onAskAiQuestion,
}: ResearchGapExplorerProps) {
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [strengthFilter, setStrengthFilter] = useState<string>('ALL');
  const [provenanceFilter, setProvenanceFilter] = useState<
    'ALL' | 'DOCUMENTED' | 'SYNTHESIS'
  >('ALL');

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
        title="Research Gap Intelligence"
        description="Combines curated dossier gaps with dynamic database-computed gap signals framed strictly as potential gaps in the reviewed FLAREX sources—never claiming absolute global gaps in NASA science."
        meta={
          <Badge tone="warning" className="font-mono-tabular">
            {filteredGaps.length} curated + {gapIntelligence.dynamicSignals.length} dynamic signals
          </Badge>
        }
      />

      {/* Module 8 Dynamic Gap Signals */}
      <section aria-labelledby="dynamic-gap-signals" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="dynamic-gap-signals"
            className="font-display text-base font-bold text-[var(--text-primary)]"
          >
            Dynamic Database Gap Signals ({gapIntelligence.dynamicSignals.length})
          </h2>
          <Badge tone="cyan">Computed from Indexed Records</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {gapIntelligence.dynamicSignals.map((sig) => (
            <Card key={sig.id} padding="sm" className="space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <Badge tone="warning">{sig.signalLabel}</Badge>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {sig.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {sig.evidenceBasis}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Caveat: {sig.caveat}
                </p>
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
                      <span>Limitations &amp; Caveats</span>
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
