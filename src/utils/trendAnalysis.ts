import type { InvestigationRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';
import { computeCategoryBreakdown, matchesFuelGroup, FUEL_GROUP_OPTIONS } from './researchLogic.ts';

export interface TimelineEraBucket {
  era: string;
  count: number;
  investigations: string[];
}

export interface CountStatItem {
  label: string;
  count: number;
  investigationIds: string[];
}

export interface ScientificTrendSummary {
  scopeNotice: string;
  eraTimeline: TimelineEraBucket[];
  categoryDistribution: CountStatItem[];
  materialFrequency: CountStatItem[];
  variableCoverage: CountStatItem[];
  sensorAndMethodCoverage: CountStatItem[];
  repositoryDistribution: CountStatItem[];
  publicationCoverage: {
    totalRecords: number;
    totalPrimaryAndPeerPublications: number;
    withPeerReviewedDoi: number;
    withNtrsId: number;
    withPsiId: number;
    withRawLocalCsv: number;
    withPublishedQuantitativeFigures: number;
  };
  underrepresentedAreas: Array<{
    area: string;
    recordCount: number;
    caveat: string;
  }>;
}

export function computeScientificTrends(
  records: InvestigationRecord[]
): ScientificTrendSummary {
  // 1. Real chronological era distribution based on documented startYear
  const eraDefs: Array<{ era: string; test: (y: number | null) => boolean }> = [
    { era: '1997–2005 (Shuttle & Early ISS)', test: (y) => y !== null && y <= 2005 },
    { era: '2006–2015 (ISS Rack Expansion)', test: (y) => y !== null && y >= 2006 && y <= 2015 },
    { era: '2016–2020 (Saffire / ACME / UL)', test: (y) => y !== null && y >= 2016 && y <= 2020 },
    { era: '2021–2027 (CFI-G & SoFIE)', test: (y) => y !== null && y >= 2021 },
    { era: 'Multi-Year Review / Undated', test: (y) => y === null },
  ];

  const eraTimeline: TimelineEraBucket[] = eraDefs.map((ed) => {
    const matched = records.filter((r) => ed.test(r.startYear));
    return {
      era: ed.era,
      count: matched.length,
      investigations: matched.map((r) => r.shortName),
    };
  });

  // 2. Research category distribution
  const categoryDistribution: CountStatItem[] = computeCategoryBreakdown(records).map(
    (c) => ({
      label: c.label,
      count: c.count,
      investigationIds: c.recordIds,
    })
  );

  // 3. Common experimental materials / fuel groups
  const materialFrequency: CountStatItem[] = FUEL_GROUP_OPTIONS.map((group) => {
    const matched = records.filter((r) => matchesFuelGroup(r, group));
    return {
      label: group.split(' (')[0],
      count: matched.length,
      investigationIds: matched.map((r) => r.id),
    };
  })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  // 4. Frequently studied environmental variables
  const varBuckets: Array<{
    label: string;
    pred: (r: InvestigationRecord) => boolean;
  }> = [
    {
      label: 'Airflow / Ventilation',
      pred: (r) => Boolean(extractEnvironmentalParams(r).airflow),
    },
    {
      label: 'Oxygen Concentration (O2)',
      pred: (r) => Boolean(extractEnvironmentalParams(r).oxygenConcentration),
    },
    {
      label: 'Temperature / Heat Flux',
      pred: (r) => Boolean(extractEnvironmentalParams(r).temperature),
    },
    {
      label: 'Ambient Pressure',
      pred: (r) => Boolean(extractEnvironmentalParams(r).pressure),
    },
    {
      label: 'Microgravity vs. Reduced/1g',
      pred: (r) =>
        r.environmentalVariables.some((v) => /gravity|buoyancy/i.test(v)) ||
        !r.isMicrogravity,
    },
    {
      label: 'Electric Field (0–10 kV)',
      pred: (r) =>
        r.environmentalVariables.some((v) => /electric|voltage|kv/i.test(v)),
    },
  ];

  const variableCoverage: CountStatItem[] = varBuckets
    .map((vb) => {
      const matched = records.filter(vb.pred);
      return {
        label: vb.label,
        count: matched.length,
        investigationIds: matched.map((r) => r.id),
      };
    })
    .sort((a, b) => b.count - a.count);

  // 5. Measurement technologies & sensors coverage
  const sensorTechs: Array<{ label: string; regex: RegExp }> = [
    { label: 'Flame Imaging / Video Cameras', regex: /video|camera|imaging|optics/i },
    { label: 'Gas Concentration (O2 / CO2 / CO / Vent)', regex: /\bo2\b|\bco2\b|\bco\b|gas|ftir|chromatograph/i },
    { label: 'Thermocouples & Thermal Probes', regex: /thermocouple|temperature|radiometer|heat flux/i },
    { label: 'Aerosol / Particulate Counters (P-Trak / Smoke)', regex: /aerosol|particle|p-trak|soot|smoke/i },
    { label: 'Calorimetry / UL 9540A Thermal Runaway', regex: /calorimet|heat release|9540a|heater/i },
    { label: 'Electric Field / Ion Current Diagnostics', regex: /ion|voltage|electric/i },
  ];

  const sensorAndMethodCoverage: CountStatItem[] = sensorTechs
    .map((st) => {
      const matched = records.filter((r) =>
        [...(r.sensors ?? []), r.measurementMethods ?? ''].some((txt) =>
          st.regex.test(txt)
        )
      );
      return {
        label: st.label,
        count: matched.length,
        investigationIds: matched.map((r) => r.id),
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // 6. Repository distribution
  const repoMap = new Map<string, string[]>();
  const addRepo = (label: string, id: string) => {
    const arr = repoMap.get(label) ?? [];
    if (!arr.includes(id)) arr.push(id);
    repoMap.set(label, arr);
  };
  for (const r of records) {
    if (r.psiId || r.sourceUrl.includes('psi.nasa.gov')) addRepo('NASA PSI', r.id);
    if (r.ntrsDocumentId || r.sourceUrl.includes('ntrs.nasa.gov'))
      addRepo('NASA NTRS', r.id);
    if (r.doi || (r.publications && r.publications.length > 0))
      addRepo('Peer-Reviewed DOI', r.id);
    if (r.sourceUrl.startsWith('/assets/')) addRepo('Bundled Dossier PDF/JSON', r.id);
    if (!r.isMicrogravity) addRepo('External Terrestrial (UL)', r.id);
  }
  const repositoryDistribution: CountStatItem[] = Array.from(repoMap.entries())
    .map(([label, ids]) => ({
      label,
      count: ids.length,
      investigationIds: ids,
    }))
    .sort((a, b) => b.count - a.count);

  // 7. Exact publication and dataset counts
  const totalPublications = records.reduce(
    (sum, r) => sum + 1 + (r.publications?.length ?? 0),
    0
  );

  const underrepresentedAreas = [
    {
      area: 'Partial-Gravity Combustion (Lunar 1/6g / Martian 3/8g)',
      recordCount: 0,
      caveat:
        '0 direct Lunar/Martian fire datasets exist in the reviewed FLAREX sources; does not prove none are planned outside reviewed files.',
    },
    {
      area: 'In-Flight Microgravity Li-Ion Battery Fires',
      recordCount: 0,
      caveat:
        'Battery fire coverage (1 record: UL 2020) comes exclusively from terrestrial 1g ground laboratory testing.',
    },
    {
      area: 'Liquid-Droplet Combustion Series',
      recordCount: categoryDistribution.find((c) => c.label.includes('Droplet'))
        ?.count ?? 0,
      caveat:
        'Only 2 summary records (FLEX & CFI-G, FLEX-2 family) are indexed locally; detailed droplet time histories reside in NASA PSI.',
    },
  ];

  return {
    scopeNotice: `Computed strictly from the ${records.length} records currently indexed in FLAREX. These statistics describe FLAREX's curated dossier coverage and must not be represented as an exhaustive census of all historical NASA combustion programs.`,
    eraTimeline,
    categoryDistribution,
    materialFrequency,
    variableCoverage,
    sensorAndMethodCoverage,
    repositoryDistribution,
    publicationCoverage: {
      totalRecords: records.length,
      totalPrimaryAndPeerPublications: totalPublications,
      withPeerReviewedDoi: records.filter(
        (r) => Boolean(r.doi) || Boolean(r.publications?.length)
      ).length,
      withNtrsId: records.filter((r) => Boolean(r.ntrsDocumentId)).length,
      withPsiId: records.filter((r) => Boolean(r.psiId)).length,
      withRawLocalCsv: records.filter((r) => r.hasRawNumericalDataset).length,
      withPublishedQuantitativeFigures: records.filter(
        (r) => r.hasQuantitativeSummary || r.quantitativeData.length > 0
      ).length,
    },
    underrepresentedAreas,
  };
}
