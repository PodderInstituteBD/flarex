import rawDb from './researchDatabase.json';
import {
  ChallengeContextData,
  DossierReferenceItem,
  InvestigationRecord,
  OfficialResourceLink,
  ResearchGapRecord,
} from '../types/research';

export const INVESTIGATIONS: InvestigationRecord[] =
  rawDb.records as InvestigationRecord[];

export const DOSSIER_METADATA = {
  title: rawDb.databaseTitle,
  sourceDocumentUrl: rawDb.sourceDocument,
  sourceDocumentTitle: rawDb.sourceDocumentTitle,
};

export const CHALLENGE_CONTEXT: ChallengeContextData = {
  fireSafetyCategories: ['Prevention', 'Detection', 'Suppression'],
  hardwareMapping: [
    {
      label: 'ACME Suite (CIR)',
      description:
        'Six ACME investigations use common modular ACME hardware in the ISS Combustion Integrated Rack (CIR), per challenge context.',
    },
    {
      label: 'FLEX / FLEX-2 / CFI (MDCA)',
      description:
        'FLEX, FLEX-2, and CFI share the Multi-user Droplet Combustion Apparatus (MDCA) in CIR, per challenge context.',
    },
    {
      label: 'BASS / BASS-II / SPICE / SLICE (MSG)',
      description:
        'BASS, BASS-II, SPICE, and SLICE use the Microgravity Science Glovebox (MSG) with a modular fan-driven flow duct developed for SPICE.',
    },
  ],
  atmosphereContext: [
    {
      context: 'Spacesuit (EVA)',
      details: '100% oxygen at 4.3 psi (supplied challenge context).',
    },
    {
      context: 'Earth Sea Level',
      details: '14.7 psi nominal atmosphere (supplied challenge context).',
    },
    {
      context: 'Lunar Base / Pressurized Rover',
      details:
        'Candidate exploration contexts with oxygen at or above 30% and pressure at or below 10.2 psi.',
    },
    {
      context: 'ACME CFI-G Configuration',
      details:
        'Specific inside-out porous burner test using N2 + flammable gas in chamber and up to 85% O2/N2 flowing from the spherical burner — not a general spacecraft atmosphere.',
    },
  ],
  partialGravityCaveat:
    'No direct partial-gravity combustion dataset was described as currently available in PSI in the supplied challenge context. Future LUCI and FM2 may add data. E-FIELD Flames uses electric fields to simulate certain effects and is not direct lunar/Martian gravity experimentation.',
  scopeExclusion:
    'Rocket and propellant fires are outside the stated challenge scope.',
  importantNote:
    'These challenge-page context statements are captured from user-supplied notes; verify against official NASA documentation before treating as operational specifications.',
};

export const DATA_QUALITY_RULES: string[] = [
  'Every displayed fact must carry a source label and URL.',
  'Do not display a numeric chart unless source-backed numeric values exist.',
  'A source’s experiment range is not automatically a result, safety limit, or recommendation.',
  'A review paper is not an experiment dataset.',
  'A NASA investigation description is not raw PSI data.',
  'The UL lithium-ion battery presentation is complementary terrestrial research, not microgravity/ISS data.',
  'Distinguish Saffire historical plans from completed investigations.',
  'Do not claim direct partial-gravity measurements based on E-FIELD Flames.',
  'Do not merge different study-specific soot multipliers into a single universal value.',
  'Do not treat planned experiment counts as completed test counts.',
];

export const RESEARCH_GAPS: ResearchGapRecord[] = [
  {
    id: 'gap-partial-gravity',
    title: 'Limited Direct Partial-Gravity Combustion Data (Lunar & Martian)',
    area: 'Partial Gravity & Exploration Atmospheres',
    description:
      'All flight experiments cataloged in the database (BASS, SAFFIRE, SAME, FLEX/CFI-G, ACME, SLICE, SPICE, Confined Combustion, SoFIE-MIST, SoFIE-OFFS) were conducted in orbital microgravity (~0g) or ground labs (1g). None provide direct Lunar (1/6g) or Martian (3/8g) fire data.',
    relatedInvestigationIds: ['bass-ii', 'saffire', 'flex-cfi-g', 'acme-efield', 'sofie-mist'],
    supportingSources: [
      'Dossier Gaps & Limitations (p. 3): Partial-gravity data are not available — microgravity only.',
      'SAFFIRE & FLEX/CFI-G summaries (p. 1): Explicitly note results do not directly simulate partial gravity.',
    ],
    whyItMatters:
      'Artemis Lunar habitats and Mars transit/surface habitats will operate at partial gravity and elevated-oxygen/reduced-pressure atmospheres where weak buoyancy interacts unpredictably with ventilation.',
    evidenceStrength: 'Strong Dossier Documentation',
    limitations: [
      'Extrapolation to partial gravity requires validated modeling (e.g., NASA Gravity MPM adjustments) rather than assuming linear interpolation between 0g and 1g.',
      'E-FIELD Flames uses electrostatic ion forces in 0g and must NOT be mistaken for direct partial-gravity testing.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-solid-phase-kinetics',
    title: 'Solid-Phase Combustion Kinetics & Material Thermal Coupling',
    area: 'Solid-Phase Pyrolysis & Flammability',
    description:
      'While BASS-II tested small solid fuels (cotton, wire insulation) and ACME BRE uses a porous gas burner to emulate solid burning, detailed solid-phase pyrolysis kinetics across varied pressure, external radiation, and oxygen remain incomplete until SoFIE-MIST releases flight data.',
    relatedInvestigationIds: ['bass-ii', 'acme-bre', 'sofie-mist'],
    supportingSources: [
      'NASA Technical Memorandum BASS-II (2021), Dossier p. 1',
      'NASA ACME BRE Description & NASA SoFIE-MIST Page, Dossier p. 2 & p. 4',
    ],
    whyItMatters:
      'Spacecraft cabins contain diverse polymers, wire insulations, and textiles whose ignition and extinction depend on coupled solid heating and gas-phase reaction.',
    evidenceStrength: 'Active Data Gap (Pending Flight Data)',
    limitations: [
      'BRE uses gaseous analogs on a porous burner rather than actual solid material pyrolysis.',
      'SoFIE-MIST PMMA rod experiments have just started with no public PSI dataset yet.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-pyrolysate-transport',
    title: 'Pyrolysate Transport & Low-Temperature Pre-Ignition Chemistry',
    area: 'Gas-Phase & Pyrolysate Chemistry',
    description:
      'FLEX and CFI-G revealed sustained cool diffusion flames (~600–1000 K) producing CO and formaldehyde (CH2O), indicating complex low-temperature pyrolysate transport and oxidation pathways that are difficult to observe under Earth buoyancy.',
    relatedInvestigationIds: ['flex-cfi-g', 'acme-bre', 'acme-planned'],
    supportingSources: [
      'FLEX / CFI-G (UMD / Phys.org NASA-funded report), Dossier p. 1 & p. 3',
      'ACME suite descriptions (BRE, CLD Flame, Flame Design), Dossier p. 2',
    ],
    whyItMatters:
      'Low-temperature smoldering and invisible cool flames can release toxic CO and CH2O or re-ignite into hot flames when spacecraft ventilation changes.',
    evidenceStrength: 'Moderate / Emerging Evidence',
    limitations: [
      'Exact FLEX-2/C PSI dataset IDs require PSI login; dossier summarizes key chemistry from published science reports.',
      'Coupling between solid pyrolysate outgassing and cool-flame regimes remains an active modeling challenge.',
    ],
    isAiSynthesis: true,
  },
  {
    id: 'gap-geometry-scale',
    title: 'Material Geometry, Enclosure & Scale Effects',
    area: 'Compartment & Scale Effects',
    description:
      'ISS rack inserts (CIR, MSG) constrain sample sizes, whereas SAFFIRE demonstrated far larger flames in spacious Cygnus volumes and Confined Combustion showed reflective walls alter spread via radiative tunnel feedback.',
    relatedInvestigationIds: ['saffire', 'confined-combustion', 'bass-ii'],
    supportingSources: [
      'NASA Glenn SAFFIRE Press Release (Dossier p. 1 & p. 3)',
      'NASA ISS On-Orbit Status Report on Confined Combustion (Dossier p. 2 & p. 3)',
    ],
    whyItMatters:
      'Small coupon flammability tests can underestimate real cabin fire growth when walls re-radiate heat or large volumes sustain higher heat release.',
    evidenceStrength: 'Strong Dossier Documentation',
    limitations: [
      'Confined Combustion PSI videos (13000365) are noted as conditional ("if released") and cover Sibal fabric baffles.',
      'SAFFIRE datasets are distributed across both PSI (13000367/68) and NTRS reports.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-smoke-aerosol-detection',
    title: 'Microgravity Smoke & Aerosol Detection Calibration',
    area: 'Fire Detection & Particle Sizing',
    description:
      'DAFT and SAME showed ISS cabin particulates are larger on average than Shuttle particulates (likely due to cabin filters), and NASA reports indicate microgravity smoke yields can vary widely (5–8× higher soot), complicating dust-vs-smoke discrimination.',
    relatedInvestigationIds: ['same', 'daft', 'bass-ii'],
    supportingSources: [
      'NASA SAME Experiment Overview & Validation Plan (Dossier p. 1, p. 3, p. 6)',
      'NASA DAFT Overview (Dossier p. 2 & p. 3)',
    ],
    whyItMatters:
      'False alarms waste crew time and degrade trust, while missed incipient smoldering poses catastrophic cabin hazards.',
    evidenceStrength: 'Strong Dossier Documentation',
    limitations: [
      'SAME PSI particle logs (13000294) and DAFT instrument readings have uncertain public release status in the dossier.',
      'Cabin filter architectures differ across Shuttle, ISS, and future Artemis habitats.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-post-fire-monitoring',
    title: 'Post-Fire Atmospheric Contamination & Monitoring',
    area: 'Post-Fire Recovery & Toxicity',
    description:
      'Multiple investigations highlight toxic combustion products (CO, formaldehyde CH2O in CFI-G; CO, H2, HF in ground Li-ion battery tests; elevated soot in BASS-II and SAME), yet post-fire cabin scrubbing and sensor recovery metrics are fragmented across archives.',
    relatedInvestigationIds: ['flex-cfi-g', 'same', 'battery-fire-ul', 'saffire'],
    supportingSources: [
      'FLEX / CFI-G composition notes (CO, CH2O), Dossier p. 1',
      'NASA/UL Battery Workshop slides (CO, H2, HF), Dossier p. 3 & p. 4',
    ],
    whyItMatters:
      'Crew survival after extinguishment depends on monitoring and scrubbing toxic acid gases (HF), CO, formaldehyde, and ultrafine soot in closed-loop life support.',
    evidenceStrength: 'Moderate / Emerging Evidence',
    limitations: [
      'HF and H2 vent-gas findings in the dossier derive from 1g terrestrial battery tests, not microgravity cabin measurements.',
      'Post-fire scrubbing kinetics are not directly quantified in the loaded dossier.',
    ],
    isAiSynthesis: true,
  },
  {
    id: 'gap-battery-fire-hazards',
    title: 'Absence of In-Flight Microgravity Li-Ion Battery Fire Data',
    area: 'Spacecraft Energy Storage Hazards',
    description:
      'NASA explicitly has NO in-flight microgravity battery fire datasets; existing LFP and NMC thermal runaway, vent gas (CO, H2, HF), and cell-scale flame-spread data come exclusively from ground-based UL laboratory tests and modeling.',
    relatedInvestigationIds: ['battery-fire-ul'],
    supportingSources: [
      '2020 NASA/UL Workshop Slide Deck (Dossier p. 2, p. 3, p. 4)',
      'Dossier Data Quality Checklist (p. 4): "battery tests from UL were ground-based; no microgravity battery fires exist."',
    ],
    whyItMatters:
      'Spacecraft, EVA suits, and lunar rovers rely heavily on Li-ion packs whose venting jet momentum and electrolyte combustion differ drastically without buoyancy.',
    evidenceStrength: 'Strong Dossier Documentation',
    limitations: [
      'Strict provenance boundary: ground-based UL metrics must NOT be mixed into microgravity-only training data without explicit scaling documentation.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-coupled-models',
    title: 'Coupled Solid-Gas Combustion Models & Cross-Archive Metadata Normalization',
    area: 'Model Integration & Informatics',
    description:
      'Dossier quality audits note that raw videos (AVI/MOV), spectral TXT files, and CSV sensor logs are spread across PSI and NTRS with sparse historical metadata (pressure, geometry, timing) and conflicting suite counts (ACME 5 vs. 6 experiments).',
    relatedInvestigationIds: ['acme-planned', 'spice', 'bass-ii', 'dossier-literature-review'],
    supportingSources: [
      'PSI Dataset Exploration & Quality Checklist (Dossier p. 4)',
      'Dossier Gaps & Limitations (p. 3)',
    ],
    whyItMatters:
      'Training reliable AI/ML or coupled CFD fire models requires aligned timestamps, verified physical units, and complete geometric boundary conditions.',
    evidenceStrength: 'Strong Dossier Documentation',
    limitations: [
      'Older Shuttle datasets (e.g., SPICE 1997) can lack complete metadata or require manual feature extraction from video frames.',
    ],
    isAiSynthesis: false,
  },
  {
    id: 'gap-model-validation-reduced-g',
    title: 'Model Validation Under Reduced Gravity & Delayed Planned Releases',
    area: 'Verification, Validation & Archive Access',
    description:
      'Next-generation facilities (SoFIE-MIST, SoFIE-OFFS, and remaining ACME experiments like CLD Flame, Flame Design, and s-Flame) are ongoing through 2026–2027 with shifted launch dates (e.g., SpaceX-27) and no public PSI datasets yet.',
    relatedInvestigationIds: ['sofie-mist', 'sofie-offs', 'acme-planned', 'acme-efield'],
    supportingSources: [
      'Dossier Gaps & Limitations (p. 3): Historical vs. ongoing shifts through ~2026–2027.',
      'Dossier Data Availability Audit (p. 4): "not all data are public yet (ACME and SoFIE are in-progress)."',
    ],
    whyItMatters:
      'Predictive fire-safety models cannot be considered validated for exploration missions until planned on-orbit datasets are released and tested against out-of-sample conditions.',
    evidenceStrength: 'Active Data Gap (Pending Flight Data)',
    limitations: [
      'Planned experiment schedules and PSI release timelines are subject to change.',
    ],
    isAiSynthesis: false,
  },
];

export const OFFICIAL_RESOURCES: OfficialResourceLink[] = [
  {
    id: 'nasa-psi',
    name: 'NASA Physical Sciences Informatics (PSI) Repository',
    shortName: 'NASA PSI Portal',
    url: 'https://psi.nasa.gov/physci/repo',
    role: 'Primary authoritative archive for NASA ISS and Shuttle physical sciences & microgravity combustion datasets (videos, spectral logs, CSV telemetry).',
    distinctionNote:
      'PSI focuses on physical sciences (combustion, fluid physics, materials). Some datasets require registered PSI login to inspect precise file manifests.',
    accessType: 'Official Web Portal (no public REST API assumed)',
  },
  {
    id: 'nasa-psi-aws',
    name: 'NASA PSI AWS Open Data Registry',
    shortName: 'PSI on AWS Open Data',
    url: 'https://registry.opendata.aws/nasa-psi/',
    role: 'Public cloud distribution registry hosting open-access NASA Physical Sciences Informatics data collections.',
    distinctionNote:
      'Public mirror/distribution for eligible open PSI datasets; verify individual dataset IDs against the main PSI portal.',
    accessType: 'Public Open Data Registry',
  },
  {
    id: 'nasa-ntrs',
    name: 'NASA Technical Reports Server (NTRS)',
    shortName: 'NASA NTRS',
    url: 'https://ntrs.nasa.gov/',
    apiUrl: 'https://ntrs.nasa.gov/api',
    role: 'Official archive for NASA Technical Memoranda (e.g., BASS-II TM), conference papers, flyers (SLICE), and post-flight reports (SAFFIRE, SPICE).',
    distinctionNote:
      'Hosts scientific reports, PDFs, and bibliographic metadata rather than raw high-speed AVI/CSV experiment telemetry.',
    accessType: 'Public Portal + Public REST API',
  },
  {
    id: 'nasa-osdr',
    name: 'NASA Open Science Data Repository (OSDR)',
    shortName: 'NASA OSDR',
    url: 'https://osdr.nasa.gov/',
    role: 'NASA repository primarily serving space biology, life sciences, and biomedical flight experiments.',
    distinctionNote:
      'IMPORTANT: OSDR and PSI are NOT identical. Combustion datasets belong primarily to PSI and NTRS, whereas OSDR covers biological/life-science studies.',
    accessType: 'Official Web Portal',
  },
  {
    id: 'local-structured-json',
    name: 'FLAREX Structured Research Database (User-Supplied JSON)',
    shortName: 'Structured Database JSON',
    url: '/assets/aistudio/flarex_research_database_def47b9d.json',
    role: 'Primary machine-readable JSON research database containing 15 investigation entries, NTRS IDs, DOIs, challenge hardware/atmosphere context, and 10 strict data-quality rules.',
    distinctionNote:
      'Authoritative structured JSON attached for FLAREX; serves as the foundation alongside the 8-page PDF dossier.',
    accessType: 'Local Bundled Attachment (JSON)',
  },
  {
    id: 'local-dossier-pdf',
    name: 'Uploaded Project Research Dossier (Flame-in-Freefall Challenge 2026)',
    shortName: 'Research Dossier PDF',
    url: '/assets/aistudio/Project_Research_Dossier__Flame-in-Freefall_Challenge_2026__7dd02da0.pdf',
    role: 'Supporting 8-page source dossier compiling NASA/partner citations, PSI IDs, data quality checklist, and gaps.',
    distinctionNote:
      'Companion PDF dossier documenting provenance rules and gap synthesis.',
    accessType: 'Local Bundled Attachment (PDF)',
  },
];

export const DOSSIER_REFERENCES: DossierReferenceItem[] = [
  {
    id: 'ref-1',
    citation: 'NASA Glenn Research Center: BASS-II NASA Technical Memorandum (2021).',
    sourceCategory: 'NASA Technical Memorandum',
    relatedInvestigationId: 'bass-ii',
  },
  {
    id: 'ref-2',
    citation: 'NASA Glenn News: Saffire Fire Safety Tests.',
    sourceCategory: 'NASA Press Release / News',
    relatedInvestigationId: 'saffire',
  },
  {
    id: 'ref-3',
    citation: 'NASA SAME Experiment Overview (Smoke Aerosol Measurement Experiment).',
    sourceCategory: 'NASA Experiment Overview',
    relatedInvestigationId: 'same',
  },
  {
    id: 'ref-4',
    citation: 'University of Maryland / Phys.org: Cool (FLEX / CFI-G) Flames in Microgravity (citing NASA-funded ISS results).',
    sourceCategory: 'Science News / University Research',
    relatedInvestigationId: 'flex-cfi-g',
  },
  {
    id: 'ref-5',
    citation: 'NASA ACME Project Pages: BRE Experiment & E-FIELD Flames (plus CLD Flame / partner pub Long et al., Proc. Combust. Inst. 2018).',
    sourceCategory: 'NASA Project Pages & Peer-Reviewed Partner Pub',
    relatedInvestigationId: 'acme-bre',
  },
  {
    id: 'ref-6',
    citation: 'NASA SLICE Flyer (2010): Structure & Liftoff In Combustion Experiment.',
    sourceCategory: 'NASA Fact Sheet / Flyer',
    relatedInvestigationId: 'slice',
  },
  {
    id: 'ref-7',
    citation: 'NASA SPICE Report: Smoke Point In Co-flow Experiment (Shuttle, 1997).',
    sourceCategory: 'NASA Technical Report',
    relatedInvestigationId: 'spice',
  },
  {
    id: 'ref-8',
    citation: 'NASA DAFT Overview: Dust & Aerosol Feasibility Test (ISS, 2004–2005).',
    sourceCategory: 'NASA Experiment Overview',
    relatedInvestigationId: 'daft',
  },
  {
    id: 'ref-9',
    citation: 'NASA ISS On-Orbit Status Report: Confined Combustion (Liao et al., Case Western Reserve University, 2019–2020).',
    sourceCategory: 'NASA Status Report & University Partner',
    relatedInvestigationId: 'confined-combustion',
  },
  {
    id: 'ref-10',
    citation: 'NASA SoFIE-MIST & SoFIE-OFFS Investigation Pages (ISS CIR, 2021–2027).',
    sourceCategory: 'NASA Investigation Pages',
    relatedInvestigationId: 'sofie-mist',
  },
  {
    id: 'ref-11',
    citation: 'NASA / UL Battery Workshop Slides (2020): Ground-based LFP and NMC Li-ion thermal runaway tests (Robles & Jeevarajan).',
    sourceCategory: 'Workshop Presentation (Terrestrial)',
    relatedInvestigationId: 'battery-fire-ul',
  },
];
