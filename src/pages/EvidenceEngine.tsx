import { useMemo, useState } from 'react';
import { ExternalLink, Scale, Search } from 'lucide-react';
import { Badge, BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { RESEARCH_GAPS } from '../data/researchCatalog';
import { InvestigationRecord } from '../types/research';
import {
  buildEvidenceClaims,
  ClaimVerificationStatus,
  EVIDENCE_CLAIM_CATEGORIES,
  EvidenceClaimCategory,
  filterEvidenceClaims,
} from '../utils/evidenceEngine';

interface EvidenceEngineProps {
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
}

function categoryTone(cat: EvidenceClaimCategory): BadgeTone {
  switch (cat) {
    case 'Experimental observation':
      return 'success';
    case 'Published research conclusion':
      return 'blue';
    case 'NASA investigation description':
      return 'cyan';
    case 'Review-based conclusion':
      return 'neutral';
    case 'Secondary-source statement':
      return 'warning';
    case 'AI interpretation':
      return 'violet';
    case 'Unverified information':
      return 'danger';
  }
}

export function EvidenceEngine({
  investigations,
  onOpenInvestigation,
}: EvidenceEngineProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    EvidenceClaimCategory | 'ALL'
  >('ALL');
  const [selectedInvestigation, setSelectedInvestigation] = useState('ALL');
  const [selectedVerification, setSelectedVerification] = useState<
    ClaimVerificationStatus | 'ALL'
  >('ALL');
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);

  const allClaims = useMemo(
    () => buildEvidenceClaims(investigations, RESEARCH_GAPS),
    [investigations]
  );

  const filteredClaims = useMemo(
    () =>
      filterEvidenceClaims(allClaims, {
        query,
        category: selectedCategory,
        investigationId: selectedInvestigation,
        verificationStatus: selectedVerification,
      }),
    [allClaims, query, selectedCategory, selectedInvestigation, selectedVerification]
  );

  const verificationOptions: ClaimVerificationStatus[] = [
    'Verified in primary dossier / NASA catalog',
    'Peer-reviewed publication citation',
    'Pending flight release / planned',
    'Cross-source interpretation',
    'Requires upstream verification',
  ];

  const categoryCounts = useMemo(() => {
    const map = new Map<EvidenceClaimCategory, number>();
    for (const c of allClaims) {
      map.set(c.category, (map.get(c.category) ?? 0) + 1);
    }
    return map;
  }, [allClaims]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scientific Integrity & Traceability"
        title="Advanced Evidence Traceability Engine"
        description="Every scientific statement is classified into its exact evidence category and verification status without arbitrary numeric confidence scores."
        meta={
          <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
            {filteredClaims.length} of {allClaims.length} traceable claims
          </span>
        }
      />

      {/* Category Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {EVIDENCE_CLAIM_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setSelectedCategory((prev) => (prev === cat ? 'ALL' : cat))
              }
              className={`p-3 rounded-[10px] border text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[var(--accent-blue)]/12 border-[var(--accent-blue)]/45'
                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
              }`}
            >
              <span className="block font-mono-tabular text-lg font-bold text-[var(--text-primary)]">
                {categoryCounts.get(cat) ?? 0}
              </span>
              <span className="block text-[11px] leading-snug text-[var(--text-secondary)] mt-0.5">
                {cat}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search
              className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search claims, chemicals, thresholds, DOIs, or caveats..."
              aria-label="Search evidence claims"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="md:col-span-3">
            <select
              value={selectedInvestigation}
              onChange={(e) => setSelectedInvestigation(e.target.value)}
              aria-label="Filter claims by investigation"
              className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              <option value="ALL">All Investigations</option>
              {investigations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.shortName}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <select
              value={selectedVerification}
              onChange={(e) =>
                setSelectedVerification(
                  e.target.value as ClaimVerificationStatus | 'ALL'
                )
              }
              aria-label="Filter claims by verification status"
              className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              <option value="ALL">All Verification Statuses</option>
              {verificationOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setQuery('');
                setSelectedCategory('ALL');
                setSelectedInvestigation('ALL');
                setSelectedVerification('ALL');
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Claims Registry */}
      <div className="space-y-3">
        {filteredClaims.map((claim) => {
          const isFocused = activeClaimId === claim.id;
          return (
            <Card
              key={claim.id}
              id={claim.id}
              padding="md"
              className={`space-y-2.5 transition-colors ${
                isFocused ? 'border-[var(--accent-blue)]' : ''
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={categoryTone(claim.category)}>
                    <Scale className="w-3 h-3" aria-hidden="true" />
                    <span>{claim.category}</span>
                  </Badge>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {claim.investigationShortName}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    · {claim.verificationStatus} · {claim.evidenceStrength}
                  </span>
                </div>
                {claim.doiOrId && (
                  <span className="font-mono-tabular text-[11px] text-[var(--accent-cyan)]">
                    {claim.doiOrId}
                  </span>
                )}
              </div>

              <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                {claim.claimText}
              </p>

              {claim.limitations.length > 0 && (
                <p className="text-xs text-[var(--text-secondary)]">
                  <strong className="text-[var(--status-warning)] font-semibold">
                    Limitation / Caveat:
                  </strong>{' '}
                  {claim.limitations[0]}
                </p>
              )}

              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenInvestigation(claim.investigationId)}
                    className="text-[var(--accent-blue)] font-medium hover:underline cursor-pointer"
                  >
                    Open Study Profile
                  </button>
                  <a
                    href={claim.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent-blue)] hover:underline"
                  >
                    <span>{claim.sourceLabel}</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
                {claim.relatedClaimIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = claim.relatedClaimIds[0];
                      setActiveClaimId(nextId);
                      document.getElementById(nextId)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-blue)] cursor-pointer"
                  >
                    Jump to related claim ({claim.relatedClaimIds.length})
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
