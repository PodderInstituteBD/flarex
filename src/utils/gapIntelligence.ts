import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';
import { computeCategoryBreakdown } from './researchLogic.ts';

export interface DynamicGapSignal {
  id: string;
  signalLabel: string;
  title: string;
  evidenceBasis: string;
  affectedCount: number;
  affectedInvestigationIds: string[];
  suggestedQuestions: string[];
  caveat: string;
}

export interface GapIntelligenceReport {
  curatedGaps: ResearchGapRecord[];
  dynamicSignals: DynamicGapSignal[];
  suggestedResearchQuestions: Array<{
    question: string;
    relatedArea: string;
    relatedIds: string[];
  }>;
}

export function buildGapIntelligence(
  records: InvestigationRecord[],
  curatedGaps: ResearchGapRecord[]
): GapIntelligenceReport {
  const noPublicPsi = records.filter(
    (r) =>
      r.dataAvailability === 'PLANNED_NO_PUBLIC_DATA' ||
      r.dataAvailability === 'ARCHIVED_OR_CONDITIONAL' ||
      r.isPlannedOrOngoing
  );
  const noLocalRawCsv = records.filter((r) => !r.hasRawNumericalDataset);
  const partialGravityCount = records.filter((r) =>
    /lunar|mars|partial gravity/i.test(r.gravityContext)
  ).length;
  const missingEnvironmental = records.filter((r) => {
    const p = extractEnvironmentalParams(r);
    return !p.oxygenConcentration || !p.pressure || !p.airflow;
  });
  const missingPubDate = records.filter((r) => !r.publicationDate);
  const catBreakdown = computeCategoryBreakdown(records);
  const lowCoverageCats = catBreakdown.filter((c) => c.count <= 2);

  const dynamicSignals: DynamicGapSignal[] = [
    {
      id: 'sig-partial-gravity',
      signalLabel: 'Potential gap in the reviewed FLAREX sources',
      title: 'Zero Direct Partial-Gravity (Lunar 1/6g / Martian 3/8g) Datasets Indexed',
      evidenceBasis: `${partialGravityCount} of ${records.length} indexed records contain direct Lunar or Martian combustion measurements.`,
      affectedCount: records.length,
      affectedInvestigationIds: ['bass-ii', 'acme-efield', 'sofie-mist'],
      suggestedQuestions: [
        'How should 0g flame spread bounds from BASS-II and SAFFIRE be scaled cleanly to 1/6g Lunar habitats without conflating ACME E-FIELD electrostatic forces with gravity?',
      ],
      caveat:
        'Reflects absence inside reviewed FLAREX sources; does not prove partial-gravity investigations are absent from future NASA roadmaps.',
    },
    {
      id: 'sig-raw-dataset-access',
      signalLabel: 'Potential gap in the reviewed FLAREX sources',
      title: 'Limited Local Raw Numerical Telemetry vs. External PSI Archives',
      evidenceBasis: `${noLocalRawCsv.length} of ${records.length} indexed records have no bundled raw time-series CSV/TXT file locally, and ${noPublicPsi.length} are planned, ongoing, or conditional release.`,
      affectedCount: noLocalRawCsv.length,
      affectedInvestigationIds: noPublicPsi.map((r) => r.id),
      suggestedQuestions: [
        'Which NASA PSI dataset IDs require authenticated researcher access to obtain raw flame-radiance CSV and video logs?',
      ],
      caveat:
        'External NASA PSI or AWS registries may host additional files beyond the local FLAREX dossier snapshot.',
    },
    {
      id: 'sig-env-parameter-sparsity',
      signalLabel: 'Potential gap in the reviewed FLAREX sources',
      title: 'Incomplete Environmental Boundary Reporting Across Summaries',
      evidenceBasis: `${missingEnvironmental.length} of ${records.length} reviewed dossier entries omit at least one explicit O2%, ambient pressure, or airflow velocity bound.`,
      affectedCount: missingEnvironmental.length,
      affectedInvestigationIds: missingEnvironmental.map((r) => r.id).slice(0, 6),
      suggestedQuestions: [
        'Can NTRS technical memoranda or peer-reviewed DOIs supply the missing O2 concentration and pressure test matrices for older Shuttle and ISS studies?',
      ],
      caveat:
        'Missing metadata in a summary entry must be treated as "Not available in the reviewed source", never as zero or negative experimental evidence.',
    },
    {
      id: 'sig-underrepresented-domains',
      signalLabel: 'Potential gap in the reviewed FLAREX sources',
      title: 'Low Record Density in Droplet & Microgravity Battery Fire Categories',
      evidenceBasis: `Low local domain counts observed in: ${lowCoverageCats
        .map((c) => `${c.label} (${c.count})`)
        .join(', ')}. Furthermore, Battery Fire Research relies 100% on terrestrial 1g UL tests.`,
      affectedCount: lowCoverageCats.length,
      affectedInvestigationIds: ['battery-fire-ul', 'flex-cfi-g', 'flex-2-family'],
      suggestedQuestions: [
        'How does vent-gas jetting and electrolyte flame spread during LFP/NMC thermal runaway change when buoyancy is removed in 0g?',
      ],
      caveat:
        'Never treat terrestrial 1g battery data as microgravity validation.',
    },
    {
      id: 'sig-pub-date-metadata',
      signalLabel: 'Potential gap in the reviewed FLAREX sources',
      title: 'Approximate Timeframes Without Exact Day-Level Publication Dates',
      evidenceBasis: `${missingPubDate.length} of ${records.length} indexed records carry only multi-year campaign timeframes rather than exact publicationDate stamps.`,
      affectedCount: missingPubDate.length,
      affectedInvestigationIds: missingPubDate.map((r) => r.id).slice(0, 5),
      suggestedQuestions: [
        'Which NASA NTRS record citations can disambiguate exact publication dates for multi-year ISS campaigns?',
      ],
      caveat:
        'FLAREX reports exact timeframes from the reviewed dossier and never invents publication dates.',
    },
  ];

  const suggestedResearchQuestions = [
    {
      question:
        'Under elevated cabin oxygen (>=30% O2) and reduced exploration pressure (<=10.2 psi), how do BASS-II extinction velocity limits interact with confined radiative walls from Confined Combustion?',
      relatedArea: 'Exploration Atmospheres & Enclosure Effects',
      relatedIds: ['bass-ii', 'confined-combustion', 'sofie-mist'],
    },
    {
      question:
        'Why do microgravity smoke detectors tuned to 1g particulates suffer false alarms or delayed response, given SAME and DAFT aerosol size findings?',
      relatedArea: 'Spacecraft Fire Detection',
      relatedIds: ['same', 'daft', 'spice'],
    },
    {
      question:
        'What toxic gas monitoring gaps exist for low-temperature cool flames (CO, CH2O in CFI-G) vs. thermal-runaway HF gas from UL battery testing?',
      relatedArea: 'Post-Fire Toxicity & Scrubbing',
      relatedIds: ['flex-cfi-g', 'battery-fire-ul', 'saffire'],
    },
    {
      question:
        'Once SoFIE-MIST and SoFIE-OFFS release flight datasets in 2026–2027, which ACME/BASS CFD assumptions will be directly testable against thick solid PMMA rods?',
      relatedArea: 'Solid-Phase Model Validation',
      relatedIds: ['sofie-mist', 'sofie-offs', 'acme-bre'],
    },
  ];

  return {
    curatedGaps,
    dynamicSignals,
    suggestedResearchQuestions,
  };
}
