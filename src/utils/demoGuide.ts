import type { AppPage } from '../components/Layout.tsx';

export interface DemoTourStep {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  explanation: string;
  highlights: string[];
  targetPage: AppPage;
  actionLabel: string;
  comparisonPresetIds?: string[];
  featuredInvestigationId?: string;
  realAiDemoPrompt?: string;
}

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'intro',
    stepNumber: 1,
    title: 'Welcome to FLAREX — Fire Learning & Research Explorer',
    subtitle: 'Turning Microgravity Combustion Data into Space Fire Safety Insights',
    explanation:
      'FLAREX is an independent student-built research platform built around a curated microgravity combustion database (ISS, Space Shuttle, Cygnus Saffire, and complementary 1g battery safety literature). Every number, citation, and limitation stays strictly anchored to verified records.',
    highlights: [
      'Zero fabricated time-series telemetry: missing raw CSVs are always disclosed.',
      'Strict provenance labels separate peer-reviewed papers, NASA abstracts, planned suites, and 1g terrestrial baselines.',
      'Designed for rapid scientific inspection across 16 indexed records.',
    ],
    targetPage: 'overview',
    actionLabel: 'Inspect Research Dashboard',
  },
  {
    id: 'modules-and-studies',
    stepNumber: 2,
    title: 'Modules Overview & Featured Studies',
    subtitle: 'Clickable KPIs, Structured Investigation Profiles & Data Explorer',
    explanation:
      'Explore all 13 sections of an investigation—from hardware platforms (MSG, CIR, MDCA, Cygnus) and fuels (cotton, PMMA, heptane, ethylene) to numerical availability—and drill straight from Dashboard KPIs into the underlying filtered studies.',
    highlights: [
      'Featured Completed Studies: BASS-II (MSG solid flammability), SAFFIRE (large Cygnus fires), FLEX / CFI-G (cool flames).',
      'Featured Active/Planned Suite: SoFIE-MIST (2021–2027, no public PSI results yet).',
      'Scientific Data Explorer displays real published counts & operating bounds only.',
    ],
    targetPage: 'detail',
    featuredInvestigationId: 'bass-ii',
    actionLabel: 'Open Featured Study: BASS-II',
  },
  {
    id: 'real-comparison',
    stepNumber: 3,
    title: 'Cross-Study Comparison With Provenance Cautions',
    subtitle: 'Comparing 0g Bench-Scale, Cygnus Vehicle-Scale & 1g Terrestrial Studies',
    explanation:
      'FLAREX prevents scientifically invalid comparisons by flagging gravity mismatches, sample-scale differences, and evidence-maturity gaps directly inside the side-by-side matrix.',
    highlights: [
      'BASS-II (0g MSG bench-scale) vs. SAFFIRE (0g large-scale Cygnus bay) vs. UL Battery Fire (1g ground lab).',
      'Missing environmental fields (O2%, pressure, airflow) remain explicitly "Not available in the reviewed source" rather than zero.',
      'Supports CSV, JSON, Markdown, and Print-to-PDF export.',
    ],
    targetPage: 'compare',
    comparisonPresetIds: ['bass-ii', 'saffire', 'battery-fire-ul'],
    actionLabel: 'Load 3-Study Comparison Preset',
  },
  {
    id: 'knowledge-graph',
    stepNumber: 4,
    title: 'Microgravity Combustion Knowledge Graph',
    subtitle: 'Verified Documented Edges vs. Explicitly Tagged Inferred Links',
    explanation:
      'Inspect how investigations connect to fuels, sensors, environmental variables, publications, findings, and limitations using 7 explicit relationship predicates—visually separating verified dossier facts from inferred cross-study links.',
    highlights: [
      'Solid edges = Verified dossier relations (INVESTIGATES, USES_MATERIAL, MEASURES, USES_SENSOR, DOCUMENTED_IN, SUPPORTS_FINDING).',
      'Dashed amber edges = Explicitly labeled INFERRED links (RELATED_TO) that can be toggled off at any time.',
      'Click any node to jump to its source URLs or linked study profile.',
    ],
    targetPage: 'graph',
    actionLabel: 'Open Knowledge Graph',
  },
  {
    id: 'real-ai-rag',
    stepNumber: 5,
    title: 'Real Retrieval-Augmented AI Research Assistant',
    subtitle: 'Query Classification -> Top-4 Record Retrieval -> Grounded Output',
    explanation:
      'Instead of generating ungrounded text or canned demo answers, FLAREX classifies your question, retrieves only the top 4 matching dossier records, and passes bounded context to Gemini—or runs a deterministic Local Brief extraction when offline.',
    highlights: [
      'Every answer displays the query classification, cited investigation names, source titles, external URLs, evidence tags, and key limitations.',
      'Clicking the button below opens AI Analyst with a real live query ready to execute (never a fake canned response).',
    ],
    targetPage: 'assistant',
    realAiDemoPrompt:
      'Compare BASS-II and SAFFIRE flame spread context and explain why UL battery fire testing cannot be treated as 0g data.',
    actionLabel: 'Launch Real RAG Query in AI Analyst',
  },
  {
    id: 'limitations-and-sources',
    stepNumber: 6,
    title: 'NASA Source Verification & Data Limitations',
    subtitle: 'Transparent Boundaries & Live NTRS / OSDR / HTTP Verification',
    explanation:
      'Review FLAREX Research Intelligence gap audits and verify NASA repository links live. Potential gaps reflect what is absent inside the reviewed FLAREX records rather than claiming global absence across all NASA programs.',
    highlights: [
      'Zero partial-gravity (Lunar 1/6g / Martian 3/8g) datasets are present in the reviewed FLAREX records.',
      'ACME E-FIELD Flames uses 0–10 kV electrostatic ion winds in 0g, not partial gravity.',
      'Live NASA NTRS & OSDR APIs and URL availability checks mark sources honestly across 5 verification states.',
    ],
    targetPage: 'sources',
    actionLabel: 'Open NASA Source Discovery',
  },
];
