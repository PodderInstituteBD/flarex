import {
  ArrowLeft,
  Check,
  ExternalLink,
  GitCompare,
  ListTree,
  MessageSquareText,
  Plus,
} from 'lucide-react';
import { AvailabilityIndicator, EvidenceLabel } from '../components/EvidenceLabel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, Panel } from '../components/ui/Card';
import { NoticeBanner } from '../components/ui/States';
import { InvestigationRecord } from '../types/research';
import {
  extractEnvironmentalParams,
  NOT_AVAILABLE_IN_SOURCE,
  validateInvestigationRecord,
} from '../utils/databaseValidator';

interface InvestigationDetailsProps {
  investigation: InvestigationRecord;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: (id: string) => void;
  onBackToExplorer: () => void;
  onAskAboutInvestigation: (investigation: InvestigationRecord) => void;
}

export function InvestigationDetails({
  investigation,
  isCompared,
  compareFull,
  onToggleCompare,
  onBackToExplorer,
  onAskAboutInvestigation,
}: InvestigationDetailsProps) {
  const envParams = extractEnvironmentalParams(investigation);
  const validation = validateInvestigationRecord(investigation);

  const detailSections: Array<{
    id: string;
    label: string;
    content: string | null;
  }> = [
    { id: 'sec-overview', label: 'Overview', content: investigation.overview },
    {
      id: 'sec-objectives',
      label: 'Scientific Objectives',
      content: investigation.scientificPurpose,
    },
    { id: 'sec-background', label: 'Background', content: investigation.background },
    {
      id: 'sec-hardware',
      label: 'Experimental Platform & Hardware',
      content: investigation.hardware,
    },
    {
      id: 'sec-materials',
      label: 'Materials and Geometry',
      content: investigation.materialsAndGeometry,
    },
    {
      id: 'sec-measurements',
      label: 'Measurements',
      content: investigation.measurementMethods,
    },
    {
      id: 'sec-findings',
      label: 'Reported Findings',
      content: investigation.reportedFindings,
    },
    {
      id: 'sec-relevance',
      label: 'Scientific Relevance',
      content: investigation.scientificRelevance,
    },
  ].filter((sec) => Boolean(sec.content && sec.content.trim().length > 0));

  const tocItems: Array<{ id: string; label: string }> = [
    ...detailSections.map((s) => ({ id: s.id, label: s.label })),
    ...(investigation.fuels.length > 0
      ? [{ id: 'sec-fuels', label: 'Materials and Fuels' }]
      : []),
    ...(investigation.environmentalVariables.length > 0
      ? [{ id: 'sec-env', label: 'Environmental Variables' }]
      : []),
    ...(investigation.sensors && investigation.sensors.length > 0
      ? [{ id: 'sec-sensors', label: 'Sensors and Diagnostics' }]
      : []),
    ...(investigation.quantitativeData.length > 0
      ? [{ id: 'sec-quantitative', label: 'Quantitative Figures' }]
      : []),
    ...(investigation.publications && investigation.publications.length > 0
      ? [{ id: 'sec-publications', label: 'Publications & DOIs' }]
      : []),
    ...(investigation.limitations.length > 0
      ? [{ id: 'sec-limitations', label: 'Research Limitations' }]
      : []),
    ...(investigation.historicalNotes && investigation.historicalNotes.length > 0
      ? [{ id: 'sec-notes', label: 'Historical Context & Notes' }]
      : []),
    { id: 'sec-sources', label: 'Sources and References' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToExplorer}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Investigation Explorer</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isCompared ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onToggleCompare(investigation.id)}
            disabled={!isCompared && compareFull}
            className={
              isCompared
                ? 'border-[var(--accent-blue)]/45 text-[var(--accent-blue)]'
                : ''
            }
          >
            {isCompared ? (
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isCompared ? 'Selected for Compare' : 'Add to Compare'}</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onAskAboutInvestigation(investigation)}
          >
            <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ask AI About This Study</span>
          </Button>
        </div>
      </div>

      {/* Scientific Report Header Panel */}
      <Panel as="header" className="p-6 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" className="font-mono-tabular">
              {envParams.acronym}
            </Badge>
            {investigation.evidenceTypes.map((ev) => (
              <EvidenceLabel key={ev} type={ev} />
            ))}
          </div>
          <Badge
            tone={
              validation.qualityTier === 'High Coverage'
                ? 'success'
                : validation.qualityTier === 'Moderate Coverage'
                ? 'blue'
                : 'warning'
            }
            className="font-mono-tabular"
          >
            {validation.qualityTier} · {validation.completenessPct}% fields
          </Badge>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {investigation.family} · {investigation.timeframe}
          </p>
          <h1 className="font-display text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.18] text-[var(--text-primary)] text-balance">
            {investigation.name}
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[var(--border-subtle)] text-sm">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Experimental Platform</p>
            <p className="mt-0.5 text-[var(--text-primary)] font-medium">
              {investigation.platform}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">Gravity Provenance</p>
            <p className="mt-0.5 text-[var(--text-primary)] font-medium">
              {investigation.gravityContext}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">NASA PSI / Inv. Identifier</p>
            <p className="mt-0.5 font-mono-tabular text-[var(--accent-blue)]">
              {investigation.psiId ?? 'Not specified in dossier'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">
              {investigation.ntrsDocumentId ? 'NTRS Doc / Report' : 'Primary DOI'}
            </p>
            <p className="mt-0.5 font-mono-tabular text-[var(--text-secondary)]">
              {investigation.ntrsDocumentId
                ? `${investigation.ntrsDocumentId}${
                    investigation.reportNumber
                      ? ` (${investigation.reportNumber})`
                      : ''
                  }`
                : investigation.doi ?? 'Not specified in dossier'}
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <AvailabilityIndicator
            status={investigation.dataAvailability}
            label={investigation.dataAvailabilityLabel}
          />
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={investigation.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] text-[var(--accent-blue)] border border-[var(--accent-blue)]/35 hover:bg-[var(--accent-blue)]/10 transition-colors"
            >
              <span>Open Original Source</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            {investigation.secondaryUrls.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
              >
                <span>{link.label}</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </Panel>

      {/* Provenance Caution Banners */}
      {(!investigation.isMicrogravity ||
        investigation.isPlannedOrOngoing ||
        investigation.id === 'acme-efield') && (
        <NoticeBanner tone="warning" title="Scientific Provenance & Scope Notice">
          {!investigation.isMicrogravity && (
            <p>
              <strong>Terrestrial Ground Research Notice:</strong> This record contains 1g ground-based laboratory data only. NASA has no in-flight microgravity battery fire dataset; do not treat these metrics as microgravity measurements.
            </p>
          )}
          {investigation.isPlannedOrOngoing && (
            <p>
              <strong>Planned / In-Progress Investigation:</strong> Objectives and planned measurement matrices must not be interpreted as completed experimental outcomes or verified datasets.
            </p>
          )}
          {investigation.id === 'acme-efield' && (
            <p>
              <strong>Gravity Classification Notice:</strong> E-FIELD Flames applies electric fields (0–10 kV) to study ion-induced electric winds in microgravity. It is NOT direct Lunar or Martian partial-gravity testing.
            </p>
          )}
        </NoticeBanner>
      )}

      {/* Report Body + Sticky Desktop Table of Contents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sticky Left ToC on Large Screens */}
        <aside className="hidden lg:block lg:col-span-3 sticky top-20 space-y-4">
          <Card padding="sm" className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] flex items-center gap-1.5">
              <ListTree className="w-3.5 h-3.5 text-[var(--accent-blue)]" aria-hidden="true" />
              <span>Report Contents</span>
            </h2>
            <nav aria-label="Investigation sections">
              <ul className="space-y-1 text-xs">
                {tocItems.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block px-2 py-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-elevated)]/70 transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </Card>

          {(investigation.principalInvestigator ||
            (investigation.authors && investigation.authors.length > 0)) && (
            <Card padding="sm" className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Investigators &amp; Authors
              </h2>
              {investigation.principalInvestigator && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {investigation.principalInvestigator}
                </p>
              )}
              {investigation.authors && investigation.authors.length > 0 && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {investigation.authors.join(', ')}
                  {investigation.publicationDate
                    ? ` (${investigation.publicationDate})`
                    : ''}
                </p>
              )}
            </Card>
          )}
        </aside>

        {/* Main Scientific Report Sections */}
        <div className="lg:col-span-9 space-y-4">
          {detailSections.map((section) => (
            <Card
              key={section.id}
              id={section.id}
              as="section"
              className="scroll-mt-20 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                  {section.label}
                </h2>
                <Badge tone="neutral">Source-Backed</Badge>
              </div>
              <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--text-secondary)]">
                {section.content}
              </p>
            </Card>
          ))}

          {/* Materials, Fuels, Environment & Sensors Structured Grid */}
          {(investigation.fuels.length > 0 ||
            investigation.environmentalVariables.length > 0 ||
            (investigation.sensors && investigation.sensors.length > 0)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {investigation.fuels.length > 0 && (
                <Card id="sec-fuels" as="section" className="scroll-mt-20 space-y-2.5">
                  <h2 className="font-display text-[16px] font-semibold text-[var(--text-primary)]">
                    Materials and Fuels
                  </h2>
                  <ul className="space-y-1.5 text-[13px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
                    {investigation.fuels.map((fuel) => (
                      <li key={fuel}>{fuel}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {investigation.environmentalVariables.length > 0 && (
                <Card id="sec-env" as="section" className="scroll-mt-20 space-y-3">
                  <h2 className="font-display text-[16px] font-semibold text-[var(--text-primary)]">
                    Environmental Parameters
                  </h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {[
                      { label: 'Oxygen Concentration', val: envParams.oxygenConcentration },
                      { label: 'Pressure', val: envParams.pressure },
                      { label: 'Temperature / Heat Flux', val: envParams.temperature },
                      { label: 'Airflow / Ventilation', val: envParams.airflow },
                    ].map((param) => (
                      <div
                        key={param.label}
                        className="p-2.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                      >
                        <dt className="text-[11px] text-[var(--text-muted)]">
                          {param.label}
                        </dt>
                        <dd
                          className={`mt-0.5 leading-relaxed ${
                            param.val
                              ? 'text-[var(--text-primary)] font-medium'
                              : 'italic text-[var(--text-muted)]'
                          }`}
                        >
                          {param.val ?? NOT_AVAILABLE_IN_SOURCE}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="space-y-1.5 text-[13px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
                    {investigation.environmentalVariables.map((envVar) => (
                      <li key={envVar}>{envVar}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {investigation.sensors && investigation.sensors.length > 0 && (
                <Card
                  id="sec-sensors"
                  as="section"
                  className="scroll-mt-20 space-y-2.5 md:col-span-2"
                >
                  <h2 className="font-display text-[16px] font-semibold text-[var(--text-primary)]">
                    Sensors and Diagnostics
                  </h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[13px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
                    {investigation.sensors.map((sensor) => (
                      <li key={sensor}>{sensor}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}

          {/* Published Quantitative Figures & Operating Ranges */}
          {investigation.quantitativeData.length > 0 && (
            <Card id="sec-quantitative" as="section" className="scroll-mt-20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                  Quantitative Figures &amp; Experimental Ranges
                </h2>
                <Badge tone="success">Published / Operating Bounds</Badge>
              </div>
              <div className="space-y-3">
                {investigation.quantitativeData.map((datum) => (
                  <div
                    key={datum.id}
                    className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {datum.label}
                      </span>
                      <span className="font-mono-tabular text-base font-bold text-[var(--accent-blue)]">
                        {datum.valueDisplay}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Classification:{' '}
                      <strong className="font-medium text-[var(--text-primary)]">
                        {datum.kind.replace(/_/g, ' ')}
                      </strong>{' '}
                      · Source: {datum.sourceCitation}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {datum.conditionContext}
                    </p>
                    <p className="text-xs text-[var(--status-warning)]">
                      Data-quality note: {datum.qualityNote}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Publications */}
          {investigation.publications && investigation.publications.length > 0 && (
            <Card id="sec-publications" as="section" className="scroll-mt-20 space-y-3">
              <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                Identified Publications
              </h2>
              <ul className="space-y-2.5">
                {investigation.publications.map((pub) => (
                  <li
                    key={pub.doi}
                    className="p-3.5 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1"
                  >
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {pub.title}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                      <span>
                        {pub.journal} · {pub.date}
                      </span>
                      <a
                        href={`https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono-tabular text-[var(--accent-blue)] hover:underline"
                      >
                        <span>DOI: {pub.doi}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Research Limitations */}
          {investigation.limitations.length > 0 && (
            <Card id="sec-limitations" as="section" className="scroll-mt-20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                  Research Limitations
                </h2>
                <Badge tone="warning">Caveats &amp; Boundaries</Badge>
              </div>
              <ul className="space-y-2 text-[14px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
                {investigation.limitations.map((lim) => (
                  <li key={lim}>{lim}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Historical / Interpretive Notes */}
          {investigation.historicalNotes && investigation.historicalNotes.length > 0 && (
            <Card id="sec-notes" as="section" className="scroll-mt-20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
                  Historical Context &amp; Mission Notes
                </h2>
                <Badge tone="violet">Historical Note</Badge>
              </div>
              <ul className="space-y-2 text-[14px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
                {investigation.historicalNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Sources and References */}
          <Card id="sec-sources" as="section" className="scroll-mt-20 space-y-3">
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
              Sources and References
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Primary source citation: <strong className="text-[var(--text-primary)]">{investigation.sourceLabel}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={investigation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-blue)] hover:underline"
              >
                <span>Primary Source URL</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
              {investigation.secondaryUrls.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)]"
                >
                  <span>{s.label}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
