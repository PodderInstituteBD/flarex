import { CheckCircle2, FileText, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Card, Panel } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { NoticeBanner } from '../components/ui/States';
import {
  CHALLENGE_CONTEXT,
  DATA_QUALITY_RULES,
  DOSSIER_METADATA,
} from '../data/researchCatalog';

export function AboutTransparency() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform Governance & Scientific Ethics"
        title="About FLAREX"
        description="Fire Learning and Research Explorer — an independent student research platform created for the NASA Space Apps Challenge 2026: Flame in Freefall."
      />

      {/* Project Identity & Mandatory Independence Notice */}
      <Panel className="p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">NASA Space Apps Challenge 2026</Badge>
          <Badge tone="neutral">Flame in Freefall</Badge>
        </div>

        <div className="space-y-2.5 max-w-3xl text-sm text-[var(--text-secondary)] leading-relaxed">
          <p>
            <strong className="text-[var(--text-primary)]">Challenge:</strong>{' '}
            Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">Mission:</strong>{' '}
            Make NASA microgravity combustion research easier to discover, understand, compare, and explore for students, educators, university researchers, aerospace enthusiasts, combustion researchers, and space safety professionals.
          </p>
        </div>

        <NoticeBanner tone="info" title="Independent Platform Disclosure">
          FLAREX is an independent student-developed research platform created for the NASA Space Apps Challenge. It is not an official NASA product and is not affiliated with or endorsed by NASA.
        </NoticeBanner>
      </Panel>

      {/* Methodology */}
      <Card as="section" className="space-y-4">
        <h2 className="font-display text-[20px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--accent-blue)]" aria-hidden="true" />
          <span>Research &amp; Data Methodology</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[var(--text-secondary)]">
          <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              01. Structured Dossier Ingestion
            </h3>
            <p className="text-xs leading-relaxed">
              Every investigation record, PSI identifier, operating bound, and limitation is transcribed directly from the attached{' '}
              <em>{DOSSIER_METADATA.sourceDocumentTitle}</em> and machine-readable JSON database without inventing DOIs, metrics, or experimental results.
            </p>
          </div>
          <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              02. Provenance &amp; Evidence Preservation
            </h3>
            <p className="text-xs leading-relaxed">
              Records preserve their exact classification (NASA Investigation Description, Peer-Reviewed Paper, Presentation/Abstract, Review Paper, or Complementary Terrestrial Research) and keep 1g battery tests and planned SoFIE/ACME studies strictly separated from completed microgravity datasets.
            </p>
          </div>
          <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              03. Bounded Deterministic Retrieval
            </h3>
            <p className="text-xs leading-relaxed">
              Before querying Gemini, FLAREX applies local deterministic scoring to retrieve only the top 4 relevant dossier records, keeping AI context concise, verifiable, and grounded in cited source documents.
            </p>
          </div>
        </div>
      </Card>

      {/* AI Transparency Matrix */}
      <Card as="section" className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-[20px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--status-success)]" aria-hidden="true" />
            <span>AI &amp; Scientific Data Transparency</span>
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Explicit boundaries separating how Gemini AI supports learning versus what remains governed strictly by verified NASA and peer-reviewed sources.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--status-success)]/35 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--status-success)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Where AI Is Used</span>
            </h3>
            <ul className="space-y-2 text-xs sm:text-[13px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
              <li>
                <strong className="text-[var(--text-primary)]">Scientific Explanations:</strong> Translating microgravity combustion concepts (cool diffusion flames, liftoff stabilization) for students and educators.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Research Summarization:</strong> Condensing multi-investigation dossier records into concise reading briefs.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Grounded Q&amp;A:</strong> Answering user questions via Gemini strictly over retrieved top-4 dossier records.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Comparison Assistance:</strong> Highlighting experimental condition differences, caveats, and documented gaps across studies.
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--status-warning)]/35 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--status-warning)] flex items-center gap-2">
              <XCircle className="w-4 h-4" aria-hidden="true" />
              <span>Where AI Is NEVER Source of Truth</span>
            </h3>
            <ul className="space-y-2 text-xs sm:text-[13px] text-[var(--text-secondary)] list-disc list-inside leading-relaxed">
              <li>
                <strong className="text-[var(--text-primary)]">Experimental Measurements:</strong> AI never supplies or interpolates raw telemetry values, flame temperatures, or particle counts.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">NASA Dataset Values &amp; PSI IDs:</strong> All PSI IDs (e.g., 13000263, 13000264) and availability flags originate strictly from the curated JSON database.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Citations &amp; DOIs:</strong> FLAREX prohibits AI-generated paper titles, synthetic DOIs, or claims of NASA endorsement.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Failure Honesty:</strong> When the server Gemini API key is absent or rate-limited, FLAREX displays a real error notice rather than a fabricated response.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          <strong>Pre-Event &amp; Build Disclosure:</strong> All factual claims, citations, and numerical bounds are verified directly against NASA/peer-reviewed source records. No NASA logos or modified NASA emblems are used in FLAREX.
        </p>
      </Card>

      {/* Challenge Context & Data Quality Rules */}
      <Card as="section" className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-[20px] font-semibold text-[var(--text-primary)]">
            Challenge Hardware, Atmosphere Context &amp; Data Limitations
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {CHALLENGE_CONTEXT.importantNote}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-sm font-semibold text-[var(--accent-blue)]">
              Hardware Facility Mapping
            </h3>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              {CHALLENGE_CONTEXT.hardwareMapping.map((item) => (
                <li key={item.label}>
                  <strong className="text-[var(--text-primary)]">{item.label}:</strong>{' '}
                  {item.description}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--status-warning)] leading-relaxed">
              {CHALLENGE_CONTEXT.partialGravityCaveat}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Scope Exclusion:</strong>{' '}
              {CHALLENGE_CONTEXT.scopeExclusion}
            </p>
          </div>

          <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-sm font-semibold text-[var(--accent-blue)]">
              Atmosphere Reference Contexts
            </h3>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              {CHALLENGE_CONTEXT.atmosphereContext.map((atm) => (
                <li key={atm.context}>
                  <strong className="text-[var(--text-primary)]">{atm.context}:</strong>{' '}
                  {atm.details}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-4 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2.5">
          <h3 className="text-sm font-semibold text-[var(--status-success)]">
            Enforced Database Quality Rules ({DATA_QUALITY_RULES.length})
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[var(--text-secondary)] list-decimal list-inside leading-relaxed">
            {DATA_QUALITY_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}
