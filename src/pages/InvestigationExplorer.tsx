import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { AvailabilityIndicator, EvidenceLabel } from '../components/EvidenceLabel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import { EvidenceType, InvestigationRecord } from '../types/research';
import { extractAcronym } from '../utils/databaseValidator';
import {
  DOMAIN_CATEGORY_DEFS,
  ExplorerFilters,
  filterInvestigations,
  FUEL_GROUP_OPTIONS,
} from '../utils/researchLogic';

interface InvestigationExplorerProps {
  investigations: InvestigationRecord[];
  initialFamilyFilter?: string;
  initialCategoryFilter?: string;
  initialQuery?: string;
  searchFocusTrigger?: number;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onOpenInvestigation: (id: string) => void;
}

const EVIDENCE_TYPES: EvidenceType[] = [
  'NASA INVESTIGATION DESCRIPTION',
  'PEER-REVIEWED PAPER',
  'PRESENTATION / ABSTRACT',
  'REVIEW PAPER',
  'COMPLEMENTARY TERRESTRIAL RESEARCH',
];

const PAGE_SIZE = 8;

export function InvestigationExplorer({
  investigations,
  initialFamilyFilter = 'ALL',
  initialCategoryFilter = 'ALL',
  initialQuery = '',
  searchFocusTrigger = 0,
  compareIds,
  onToggleCompare,
  onOpenInvestigation,
}: InvestigationExplorerProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [family, setFamily] = useState(initialFamilyFilter);
  const [category, setCategory] = useState(initialCategoryFilter);
  const [evidenceType, setEvidenceType] = useState('ALL');
  const [platform, setPlatform] = useState('ALL');
  const [fuelType, setFuelType] = useState('ALL');
  const [dataAvailability, setDataAvailability] = useState('ALL');
  const [sortBy, setSortBy] = useState<ExplorerFilters['sortBy']>('name-asc');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setFamily(initialFamilyFilter);
    setCurrentPage(1);
  }, [initialFamilyFilter]);

  useEffect(() => {
    setCategory(initialCategoryFilter);
    setCurrentPage(1);
  }, [initialCategoryFilter]);

  useEffect(() => {
    if (initialQuery) {
      setSearchInput(initialQuery);
      setDebouncedQuery(initialQuery);
      setCurrentPage(1);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (searchFocusTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [searchFocusTrigger]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput);
      setCurrentPage(1);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const families = useMemo(
    () => Array.from(new Set(investigations.map((r) => r.family))).sort(),
    [investigations]
  );

  const platforms = useMemo(
    () => Array.from(new Set(investigations.map((r) => r.platform))).sort(),
    [investigations]
  );

  const filtered = useMemo(
    () =>
      filterInvestigations(investigations, {
        query: debouncedQuery,
        family,
        category,
        evidenceType,
        platform,
        fuelType,
        dataAvailability,
        sortBy,
      }),
    [
      investigations,
      debouncedQuery,
      family,
      category,
      evidenceType,
      platform,
      fuelType,
      dataAvailability,
      sortBy,
    ]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedResults = useMemo(
    () =>
      filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setFamily('ALL');
    setCategory('ALL');
    setEvidenceType('ALL');
    setPlatform('ALL');
    setFuelType('ALL');
    setDataAvailability('ALL');
    setSortBy('name-asc');
    setCurrentPage(1);
  };

  const activeCategoryLabel =
    DOMAIN_CATEGORY_DEFS.find((c) => c.id === category)?.label ?? category;

  const activeFilterChips: Array<{
    key: string;
    label: string;
    onClear: () => void;
  }> = [];

  if (searchInput.trim()) {
    activeFilterChips.push({
      key: 'query',
      label: `Search: "${searchInput.trim()}"`,
      onClear: () => {
        setSearchInput('');
        setDebouncedQuery('');
      },
    });
  }
  if (category !== 'ALL') {
    activeFilterChips.push({
      key: 'category',
      label: `Domain: ${activeCategoryLabel}`,
      onClear: () => setCategory('ALL'),
    });
  }
  if (family !== 'ALL') {
    activeFilterChips.push({
      key: 'family',
      label: `Family: ${family}`,
      onClear: () => setFamily('ALL'),
    });
  }
  if (evidenceType !== 'ALL') {
    activeFilterChips.push({
      key: 'evidenceType',
      label: `Evidence: ${evidenceType}`,
      onClear: () => setEvidenceType('ALL'),
    });
  }
  if (platform !== 'ALL') {
    activeFilterChips.push({
      key: 'platform',
      label: `Platform: ${platform}`,
      onClear: () => setPlatform('ALL'),
    });
  }
  if (fuelType !== 'ALL') {
    activeFilterChips.push({
      key: 'fuelType',
      label: `Fuel: ${fuelType}`,
      onClear: () => setFuelType('ALL'),
    });
  }
  if (dataAvailability !== 'ALL') {
    activeFilterChips.push({
      key: 'dataAvailability',
      label: `Availability: ${dataAvailability.replace(/_/g, ' ')}`,
      onClear: () => setDataAvailability('ALL'),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Research Catalog"
        title="Investigation Explorer"
        description="Search, filter, and inspect microgravity combustion investigations, literature reviews, and complementary ground baseline studies."
        meta={
          <Badge tone="blue" className="font-mono-tabular">
            Showing {filtered.length} of {investigations.length} records
          </Badge>
        }
      />

      {/* Search & Multi-Attribute Filters */}
      <Card
        as="section"
        aria-label="Search and filter investigations"
        padding="sm"
        className="space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label htmlFor="explorer-search" className="sr-only">
              Search investigations by name, fuel, sensor, PSI ID, or keyword
            </label>
            <Input
              ref={searchInputRef}
              id="explorer-search"
              type="search"
              leadingIcon={<Search className="w-4 h-4" />}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, fuel, sensor, PSI/NTRS ID..."
            />
          </div>

          <div className="md:col-span-4">
            <label htmlFor="filter-family" className="sr-only">
              Filter by research family
            </label>
            <Select
              id="filter-family"
              value={family}
              onChange={(e) => {
                setFamily(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Research Families</option>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="sort-investigations" className="sr-only">
              Sort investigations
            </label>
            <Select
              id="sort-investigations"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as ExplorerFilters['sortBy'])
              }
            >
              <option value="name-asc">Sort: Name (A–Z)</option>
              <option value="name-desc">Sort: Name (Z–A)</option>
              <option value="family-asc">Sort: Research Category</option>
              <option value="year-desc">Sort: Timeframe (Newest)</option>
              <option value="year-asc">Sort: Timeframe (Oldest)</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="filter-evidence" className="sr-only">
              Filter by evidence type
            </label>
            <Select
              id="filter-evidence"
              value={evidenceType}
              onChange={(e) => {
                setEvidenceType(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Evidence Types</option>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="filter-platform" className="sr-only">
              Filter by platform
            </label>
            <Select
              id="filter-platform"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="filter-fuel" className="sr-only">
              Filter by fuel type
            </label>
            <Select
              id="filter-fuel"
              value={fuelType}
              onChange={(e) => {
                setFuelType(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Fuel Types</option>
              {FUEL_GROUP_OPTIONS.map((fuel) => (
                <option key={fuel} value={fuel}>
                  {fuel}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="filter-availability" className="sr-only">
              Filter by data availability
            </label>
            <Select
              id="filter-availability"
              value={dataAvailability}
              onChange={(e) => {
                setDataAvailability(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Data Availability</option>
              <option value="PUBLIC_IN_PSI">Public in NASA PSI</option>
              <option value="PARTIAL_OR_NTRS">Partial / NTRS Reports</option>
              <option value="ARCHIVED_OR_CONDITIONAL">Archived / Conditional</option>
              <option value="PLANNED_NO_PUBLIC_DATA">Planned (No Public Data)</option>
              <option value="TERRESTRIAL_LAB_ONLY">Terrestrial Lab Only (1g)</option>
            </Select>
          </div>
        </div>

        {/* Active Filter Chips & Reset */}
        {activeFilterChips.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Active filters:</span>
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClear}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[6px] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/15 cursor-pointer"
                >
                  <span>{chip.label}</span>
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              aria-label="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset All</span>
            </Button>
          </div>
        )}
      </Card>

      {/* Results Grid or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-5 h-5" aria-hidden="true" />}
          title="No investigations match your current search or filter criteria."
          description="Try clearing a platform, fuel, or evidence filter, or search for a broader keyword such as 'soot', 'ISS', or 'PMMA'."
          action={
            <Button type="button" variant="primary" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reset Filters</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pagedResults.map((rec) => {
              const isSelectedForCompare = compareIds.includes(rec.id);
              const compareDisabled =
                !isSelectedForCompare && compareIds.length >= 3;
              return (
                <Card
                  key={rec.id}
                  as="article"
                  className="flex flex-col justify-between gap-4 hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <Badge tone="neutral" className="font-mono-tabular">
                          {extractAcronym(rec)}
                        </Badge>
                        <span className="text-[12px] text-[var(--text-muted)] truncate">
                          {rec.family} · {rec.timeframe}
                        </span>
                      </div>
                      <EvidenceLabel type={rec.evidenceType} />
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenInvestigation(rec.id)}
                      className="text-left block group cursor-pointer"
                    >
                      <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                        {rec.name}
                      </h2>
                    </button>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                      <span>
                        Platform:{' '}
                        <strong className="font-medium text-[var(--text-primary)]">
                          {rec.platform}
                        </strong>
                      </span>
                      <span>
                        Gravity:{' '}
                        <strong className="font-medium text-[var(--text-primary)]">
                          {rec.gravityContext}
                        </strong>
                      </span>
                      <span>
                        Source:{' '}
                        <strong className="font-mono-tabular font-medium text-[var(--accent-cyan)]">
                          {rec.psiId
                            ? `PSI ${rec.psiId}`
                            : rec.ntrsDocumentId
                            ? `NTRS ${rec.ntrsDocumentId}`
                            : rec.doi
                            ? `DOI`
                            : 'External Index'}
                        </strong>
                      </span>
                    </div>

                    <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                      {rec.overview}
                    </p>

                    {rec.fuels.length > 0 && (
                      <p className="text-[12px] text-[var(--text-muted)] truncate">
                        Fuels: {rec.fuels.slice(0, 2).join(' · ')}
                        {rec.fuels.length > 2 ? ` (+${rec.fuels.length - 2})` : ''}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                    <AvailabilityIndicator
                      status={rec.dataAvailability}
                      label={rec.dataAvailabilityLabel}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleCompare(rec.id)}
                          disabled={compareDisabled}
                          aria-pressed={isSelectedForCompare}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-[8px] border transition-colors cursor-pointer ${
                            isSelectedForCompare
                              ? 'bg-[var(--accent-blue)]/12 text-[var(--accent-blue)] border-[var(--accent-blue)]/40'
                              : compareDisabled
                              ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border-subtle)] cursor-not-allowed opacity-55'
                              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)]'
                          }`}
                        >
                          {isSelectedForCompare ? (
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>
                            {isSelectedForCompare ? 'In Compare' : 'Compare'}
                          </span>
                        </button>

                        <a
                          href={rec.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent-blue)] rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                        >
                          <span>Source</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenInvestigation(rec.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] hover:underline cursor-pointer"
                      >
                        <span>Open Details</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              aria-label="Investigation results pagination"
              className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]"
            >
              <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
                Page {safePage} of {totalPages} · Showing{' '}
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const p = idx + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setCurrentPage(p);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      aria-current={p === safePage ? 'page' : undefined}
                      className={`w-8 h-8 rounded-[8px] text-xs font-mono-tabular border transition-colors cursor-pointer ${
                        p === safePage
                          ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
