import type {
  DataAvailabilityStatus,
  EvidenceType,
  InvestigationRecord,
} from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';

export const NOT_SPECIFIED = 'Not available in the reviewed source.';

export interface ResearchStats {
  totalRecords: number;
  nasaInvestigations: number;
  reviewPapers: number;
  complementaryTerrestrial: number;
  withQuantitativeSummary: number;
  withRawNumericalDataset: number;
  withoutRawNumericalData: number;
  publicInPsi: number;
  plannedOrOngoing: number;
  familyCounts: Array<{ family: string; count: number }>;
  evidenceCounts: Array<{ evidenceType: EvidenceType; count: number }>;
  platformCounts: Array<{ platform: string; count: number }>;
}

export type DomainCategoryId =
  | 'solid-fuel'
  | 'liquid-droplet'
  | 'flame-dynamics'
  | 'smoke-aerosol'
  | 'material-flammability'
  | 'battery-fire'
  | 'fire-safety-modeling';

export interface DomainCategorySummary {
  id: DomainCategoryId;
  label: string;
  description: string;
  count: number;
  recordIds: string[];
}

export const DOMAIN_CATEGORY_DEFS: Array<{
  id: DomainCategoryId;
  label: string;
  description: string;
}> = [
  {
    id: 'solid-fuel',
    label: 'Solid-Fuel Combustion',
    description: 'Cellulosics, PMMA rods, thin solids, and porous solid analogs.',
  },
  {
    id: 'liquid-droplet',
    label: 'Liquid-Droplet Combustion',
    description: 'Isolated droplets, binary surrogates, and cool-flame extinction.',
  },
  {
    id: 'flame-dynamics',
    label: 'Flame Dynamics',
    description: 'Laminar coflow structure, liftoff, E-field winds, and wall feedback.',
  },
  {
    id: 'smoke-aerosol',
    label: 'Smoke and Aerosol Detection',
    description: 'Particulate sizing, soot yield, smoke points, and cabin false alarms.',
  },
  {
    id: 'material-flammability',
    label: 'Material Flammability',
    description: 'Spacecraft textiles, composites, wire insulation, and large-scale spread.',
  },
  {
    id: 'battery-fire',
    label: 'Battery Fire Research',
    description: 'LFP & NMC thermal runaway and vent gases (1g terrestrial baseline).',
  },
  {
    id: 'fire-safety-modeling',
    label: 'Fire Safety Modeling',
    description: 'CFD/gravity scaling, thermal models, and cross-archive validation.',
  },
];

export const FUEL_GROUP_OPTIONS = [
  'Cotton & Cellulosic Textiles',
  'PMMA / Acrylic & Polymers',
  'Nomex, Sibal & Composite Fabrics',
  'Wire Insulation & Silicone',
  'Gaseous Hydrocarbons (CH4 / C2H4 / C3H8)',
  'Liquid Droplets (Heptane / Methanol / Ethanol / Decane)',
  'Hydrogen & Diluted Gas Analogs',
  'Lithium-Ion Cells (LFP / NMC)',
  'Smoke & Tracer Aerosols',
] as const;

export type FuelGroupOption = (typeof FUEL_GROUP_OPTIONS)[number];

export interface ExplorerFilters {
  query: string;
  family: string;
  evidenceType: string;
  platform: string;
  fuelType?: string;
  category?: string;
  dataAvailability: string;
  sortBy: 'name-asc' | 'name-desc' | 'family-asc' | 'year-desc' | 'year-asc';
}

export interface GlobalSearchHit {
  record: InvestigationRecord;
  matchReason: string;
  score: number;
}

export type ReferenceFilterCategory =
  | 'ALL'
  | 'NASA'
  | 'PAPER'
  | 'PRESENTATION'
  | 'REVIEW'
  | 'COMPLEMENTARY';

export interface UnifiedReferenceItem {
  id: string;
  title: string;
  investigationId: string;
  investigationShortName: string;
  sourceTypeLabel: string;
  categories: Exclude<ReferenceFilterCategory, 'ALL'>[];
  authorsOrLead: string;
  publicationDate: string;
  documentId: string;
  doi: string | null;
  url: string;
}

export interface ComparisonRow {
  fieldKey: string;
  label: string;
  values: Array<{
    investigationId: string;
    display: string;
    isMissing: boolean;
    cautionNote?: string;
  }>;
  hasDifference: boolean;
}

export function matchesDomainCategory(
  record: InvestigationRecord,
  categoryId: DomainCategoryId
): boolean {
  const combined = [
    record.id,
    record.family,
    record.overview,
    record.scientificPurpose ?? '',
    record.materialsAndGeometry ?? '',
    ...record.fuels,
    ...record.tags,
  ]
    .join(' ')
    .toLowerCase();

  switch (categoryId) {
    case 'solid-fuel':
      return (
        record.family.includes('Solid Fuel') ||
        ['bass-ii', 'saffire', 'confined-combustion', 'sofie-mist', 'sofie-offs', 'acme-bre'].includes(
          record.id
        )
      );
    case 'liquid-droplet':
      return (
        record.family.includes('Droplet') ||
        ['flex-cfi-g', 'flex-2-family'].includes(record.id)
      );
    case 'flame-dynamics':
      return (
        record.family.includes('Laminar Flame') ||
        record.family.includes('ACME') ||
        record.family.includes('Enclosure') ||
        ['slice', 'spice', 'acme-bre', 'acme-efield', 'acme-planned', 'confined-combustion'].includes(
          record.id
        )
      );
    case 'smoke-aerosol':
      return (
        record.family.includes('Smoke') ||
        ['same', 'daft', 'spice'].includes(record.id) ||
        combined.includes('smoke point') ||
        combined.includes('particulate')
      );
    case 'material-flammability':
      return (
        ['bass-ii', 'saffire', 'confined-combustion', 'sofie-mist', 'sofie-offs', 'dossier-literature-review'].includes(
          record.id
        ) || combined.includes('flammability')
      );
    case 'battery-fire':
      return (
        record.id === 'battery-fire-ul' ||
        record.fuels.some((f) => /lfp|nmc|battery/i.test(f)) ||
        combined.includes('battery electrode')
      );
    case 'fire-safety-modeling':
      return (
        record.id === 'dossier-literature-review' ||
        record.id === 'battery-fire-ul' ||
        combined.includes('model') ||
        combined.includes('cfd') ||
        combined.includes('design')
      );
    default:
      return false;
  }
}

export function computeCategoryBreakdown(
  records: InvestigationRecord[]
): DomainCategorySummary[] {
  return DOMAIN_CATEGORY_DEFS.map((def) => {
    const matching = records.filter((r) => matchesDomainCategory(r, def.id));
    return {
      ...def,
      count: matching.length,
      recordIds: matching.map((r) => r.id),
    };
  });
}

export function matchesFuelGroup(
  record: InvestigationRecord,
  fuelGroup: string
): boolean {
  if (!fuelGroup || fuelGroup === 'ALL') return true;
  const fuelsJoined = record.fuels.join(' ').toLowerCase();
  switch (fuelGroup) {
    case 'Cotton & Cellulosic Textiles':
      return /cotton|cellulosic/.test(fuelsJoined);
    case 'PMMA / Acrylic & Polymers':
      return /pmma|acrylic|polymethyl|plastics/.test(fuelsJoined);
    case 'Nomex, Sibal & Composite Fabrics':
      return /nomex|sibal|fiberglass|composite|solid fuel samples/.test(fuelsJoined);
    case 'Wire Insulation & Silicone':
      return /wire insulation|silicone/.test(fuelsJoined);
    case 'Gaseous Hydrocarbons (CH4 / C2H4 / C3H8)':
      return /methane|ethylene|propylene|propane|c3h6|c3h8|c2h4|hydrocarbons|gaseous/.test(
        fuelsJoined
      );
    case 'Liquid Droplets (Heptane / Methanol / Ethanol / Decane)':
      return /heptane|methanol|ethanol|hexanol|decane|droplet|binary fuel/.test(
        fuelsJoined
      );
    case 'Hydrogen & Diluted Gas Analogs':
      return /hydrogen|h2|diluted|analog|85% oxygen/.test(fuelsJoined);
    case 'Lithium-Ion Cells (LFP / NMC)':
      return /lfp|nmc|lifepo4|li-ion/.test(fuelsJoined);
    case 'Smoke & Tracer Aerosols':
      return /smoke-generating|tracer aerosols/.test(fuelsJoined);
    default:
      return fuelsJoined.includes(fuelGroup.toLowerCase());
  }
}

export function computeResearchStats(
  records: InvestigationRecord[]
): ResearchStats {
  const familyMap = new Map<string, number>();
  const evidenceMap = new Map<EvidenceType, number>();
  const platformMap = new Map<string, number>();

  let nasaInvestigations = 0;
  let reviewPapers = 0;
  let complementaryTerrestrial = 0;
  let withQuantitativeSummary = 0;
  let withRawNumericalDataset = 0;
  let withoutRawNumericalData = 0;
  let publicInPsi = 0;
  let plannedOrOngoing = 0;

  for (const r of records) {
    if (r.recordCategory === 'NASA_INVESTIGATION') nasaInvestigations += 1;
    else if (r.recordCategory === 'REVIEW_PAPER') reviewPapers += 1;
    else if (r.recordCategory === 'COMPLEMENTARY_TERRESTRIAL')
      complementaryTerrestrial += 1;

    if (r.hasQuantitativeSummary || r.quantitativeData.length > 0) {
      withQuantitativeSummary += 1;
    }
    if (r.hasRawNumericalDataset) {
      withRawNumericalDataset += 1;
    } else {
      withoutRawNumericalData += 1;
    }

    if (r.dataAvailability === 'PUBLIC_IN_PSI') publicInPsi += 1;
    if (r.isPlannedOrOngoing) plannedOrOngoing += 1;

    familyMap.set(r.family, (familyMap.get(r.family) ?? 0) + 1);
    evidenceMap.set(r.evidenceType, (evidenceMap.get(r.evidenceType) ?? 0) + 1);
    platformMap.set(r.platform, (platformMap.get(r.platform) ?? 0) + 1);
  }

  return {
    totalRecords: records.length,
    nasaInvestigations,
    reviewPapers,
    complementaryTerrestrial,
    withQuantitativeSummary,
    withRawNumericalDataset,
    withoutRawNumericalData,
    publicInPsi,
    plannedOrOngoing,
    familyCounts: Array.from(familyMap.entries())
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    evidenceCounts: Array.from(evidenceMap.entries())
      .map(([evidenceType, count]) => ({ evidenceType, count }))
      .sort((a, b) => b.count - a.count),
    platformCounts: Array.from(platformMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function filterInvestigations(
  records: InvestigationRecord[],
  filters: ExplorerFilters
): InvestigationRecord[] {
  const q = filters.query.trim().toLowerCase();

  const filtered = records.filter((record) => {
    if (filters.family !== 'ALL' && record.family !== filters.family) {
      return false;
    }
    if (
      filters.evidenceType !== 'ALL' &&
      record.evidenceType !== filters.evidenceType &&
      !record.evidenceTypes.includes(filters.evidenceType as EvidenceType)
    ) {
      return false;
    }
    if (filters.platform !== 'ALL' && record.platform !== filters.platform) {
      return false;
    }
    if (
      filters.fuelType &&
      filters.fuelType !== 'ALL' &&
      !matchesFuelGroup(record, filters.fuelType)
    ) {
      return false;
    }
    if (
      filters.category &&
      filters.category !== 'ALL' &&
      !matchesDomainCategory(record, filters.category as DomainCategoryId)
    ) {
      return false;
    }
    if (
      filters.dataAvailability !== 'ALL' &&
      record.dataAvailability !==
        (filters.dataAvailability as DataAvailabilityStatus)
    ) {
      return false;
    }

    if (!q) return true;

    const haystack = [
      record.name,
      record.shortName,
      record.family,
      record.platform,
      record.overview,
      record.scientificPurpose ?? '',
      record.reportedFindings ?? '',
      record.psiId ?? '',
      record.ntrsDocumentId ?? '',
      record.reportNumber ?? '',
      record.principalInvestigator ?? '',
      record.doi ?? '',
      record.sourceLabel,
      ...record.fuels,
      ...(record.sensors ?? []),
      ...record.environmentalVariables,
      ...record.tags,
      ...record.limitations,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });

  const sorted = [...filtered];
  if (filters.sortBy === 'name-asc') {
    sorted.sort((a, b) => a.shortName.localeCompare(b.shortName));
  } else if (filters.sortBy === 'name-desc') {
    sorted.sort((a, b) => b.shortName.localeCompare(a.shortName));
  } else if (filters.sortBy === 'family-asc') {
    sorted.sort(
      (a, b) =>
        a.family.localeCompare(b.family) ||
        a.shortName.localeCompare(b.shortName)
    );
  } else if (filters.sortBy === 'year-desc') {
    sorted.sort(
      (a, b) =>
        (b.startYear ?? -1) - (a.startYear ?? -1) ||
        a.shortName.localeCompare(b.shortName)
    );
  } else if (filters.sortBy === 'year-asc') {
    sorted.sort((a, b) => {
      const ya = a.startYear ?? Number.MAX_SAFE_INTEGER;
      const yb = b.startYear ?? Number.MAX_SAFE_INTEGER;
      return ya - yb || a.shortName.localeCompare(b.shortName);
    });
  }

  return sorted;
}

export function globalSearchInvestigations(
  query: string,
  records: InvestigationRecord[],
  limit = 7
): GlobalSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: GlobalSearchHit[] = [];

  for (const record of records) {
    let score = 0;
    const reasons: string[] = [];

    const nameMatch =
      record.shortName.toLowerCase().includes(q) ||
      record.name.toLowerCase().includes(q) ||
      (record.psiId?.toLowerCase().includes(q) ?? false) ||
      (record.ntrsDocumentId?.toLowerCase().includes(q) ?? false);
    if (nameMatch) {
      score += 12;
      reasons.push('Name / ID');
    }

    if (record.fuels.some((f) => f.toLowerCase().includes(q))) {
      score += 7;
      reasons.push('Fuel');
    }

    if (
      record.family.toLowerCase().includes(q) ||
      record.tags.some((t) => t.toLowerCase().includes(q)) ||
      record.platform.toLowerCase().includes(q)
    ) {
      score += 5;
      reasons.push('Category / Platform');
    }

    const body = [
      record.overview,
      record.scientificPurpose ?? '',
      record.reportedFindings ?? '',
      ...(record.sensors ?? []),
      ...record.environmentalVariables,
    ]
      .join(' ')
      .toLowerCase();
    if (body.includes(q)) {
      score += 3;
      if (reasons.length === 0) reasons.push('Description / Findings');
    }

    if (score > 0) {
      hits.push({
        record,
        matchReason: reasons[0] ?? 'Keyword match',
        score,
      });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.record.shortName.localeCompare(b.record.shortName))
    .slice(0, limit);
}

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  battery: ['li-ion', 'lfp', 'nmc', 'thermal runaway', 'vent gas', 'hf', 'terrestrial'],
  partial: ['lunar', 'mars', 'martian', 'moon', 'e-field', 'gravity'],
  smoke: ['soot', 'aerosol', 'particulate', 'p-trak', 'detector', 'same', 'daft', 'spice'],
  cool: ['flex', 'cfi-g', 'ch2o', 'formaldehyde', 'droplet', '600', '1000'],
  electric: ['e-field', '10 kv', 'ion', 'acme'],
  planned: ['sofie', 'cld', 'flame design', 's-flame', 'tbd'],
  enclosure: ['confined', 'baffle', 'sibal', 'saffire', 'cygnus', 'wall'],
  solid: ['bass', 'pmma', 'cotton', 'wire', 'sofie', 'bre'],
};

export function retrieveRelevantInvestigations(
  query: string,
  records: InvestigationRecord[],
  maxResults = 4
): InvestigationRecord[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return records.slice(0, maxResults);
  }

  const rawTokens = normalized
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const expandedTokens = new Set<string>(rawTokens);
  for (const token of rawTokens) {
    for (const [key, synonyms] of Object.entries(DOMAIN_SYNONYMS)) {
      if (token.includes(key) || key.includes(token)) {
        for (const syn of synonyms) expandedTokens.add(syn);
      }
    }
  }

  const scored = records.map((record) => {
    let score = 0;
    const titleText = `${record.name} ${record.shortName} ${record.psiId ?? ''}`.toLowerCase();
    const bodyText = [
      record.family,
      record.platform,
      record.gravityContext,
      record.overview,
      record.scientificPurpose ?? '',
      record.reportedFindings ?? '',
      record.scientificRelevance ?? '',
      ...record.fuels,
      ...(record.sensors ?? []),
      ...record.environmentalVariables,
      ...record.limitations,
      ...record.tags,
    ]
      .join(' ')
      .toLowerCase();

    for (const token of expandedTokens) {
      if (titleText.includes(token)) score += 6;
      if (bodyText.includes(token)) score += 2;
    }

    if (normalized.includes(record.shortName.toLowerCase())) {
      score += 12;
    }
    if (record.id === 'acme-efield' && normalized.includes('e-field')) {
      score += 12;
    }
    if (record.id === 'battery-fire-ul' && normalized.includes('battery')) {
      score += 12;
    }

    return { record, score };
  });

  const nonZero = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.record);

  if (nonZero.length > 0) {
    return nonZero;
  }

  return records
    .filter((r) =>
      ['bass-ii', 'saffire', 'flex-cfi-g', 'dossier-literature-review'].includes(
        r.id
      )
    )
    .slice(0, maxResults);
}

export function buildReferenceLibrary(
  records: InvestigationRecord[]
): UnifiedReferenceItem[] {
  const items: UnifiedReferenceItem[] = [];

  for (const rec of records) {
    const categories = new Set<Exclude<ReferenceFilterCategory, 'ALL'>>();
    if (rec.recordCategory === 'NASA_INVESTIGATION') {
      categories.add('NASA');
    }
    if (rec.evidenceTypes.includes('PEER-REVIEWED PAPER')) {
      categories.add('PAPER');
    }
    if (rec.evidenceTypes.includes('PRESENTATION / ABSTRACT')) {
      categories.add('PRESENTATION');
    }
    if (
      rec.recordCategory === 'REVIEW_PAPER' ||
      rec.evidenceTypes.includes('REVIEW PAPER')
    ) {
      categories.add('REVIEW');
    }
    if (
      rec.recordCategory === 'COMPLEMENTARY_TERRESTRIAL' ||
      rec.evidenceTypes.includes('COMPLEMENTARY TERRESTRIAL RESEARCH') ||
      rec.sourceUrl.includes('phys.org') ||
      rec.sourceUrl.includes('sciencedirect') ||
      rec.sourceUrl.includes('ul.org')
    ) {
      categories.add('COMPLEMENTARY');
    }

    const docParts: string[] = [];
    if (rec.psiId) docParts.push(`PSI ${rec.psiId}`);
    if (rec.ntrsDocumentId) docParts.push(`NTRS ${rec.ntrsDocumentId}`);
    if (rec.reportNumber) docParts.push(rec.reportNumber);

    const authorsOrLead =
      rec.authors && rec.authors.length > 0
        ? rec.authors.join(', ')
        : rec.principalInvestigator || rec.sourceLabel;

    items.push({
      id: `ref-primary-${rec.id}`,
      title: rec.sourceLabel,
      investigationId: rec.id,
      investigationShortName: rec.shortName,
      sourceTypeLabel: rec.evidenceType,
      categories: Array.from(categories),
      authorsOrLead,
      publicationDate: rec.publicationDate || rec.timeframe,
      documentId: docParts.length > 0 ? docParts.join(' · ') : 'Catalog Record',
      doi: rec.doi,
      url: rec.sourceUrl,
    });

    if (rec.publications && rec.publications.length > 0) {
      for (const pub of rec.publications) {
        items.push({
          id: `ref-pub-${rec.id}-${pub.doi}`,
          title: `${pub.title} (${pub.journal})`,
          investigationId: rec.id,
          investigationShortName: rec.shortName,
          sourceTypeLabel: 'PEER-REVIEWED PAPER',
          categories: ['PAPER'],
          authorsOrLead: rec.principalInvestigator || rec.shortName + ' Team',
          publicationDate: pub.date,
          documentId: `DOI ${pub.doi}`,
          doi: pub.doi,
          url: `https://doi.org/${pub.doi}`,
        });
      }
    }
  }

  return items;
}

export function filterReferences(
  items: UnifiedReferenceItem[],
  category: ReferenceFilterCategory,
  query = ''
): UnifiedReferenceItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== 'ALL' && !item.categories.includes(category)) {
      return false;
    }
    if (!q) return true;
    const text = [
      item.title,
      item.investigationShortName,
      item.sourceTypeLabel,
      item.authorsOrLead,
      item.documentId,
      item.doi ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });
}

export function buildComparisonRows(
  selected: InvestigationRecord[]
): ComparisonRow[] {
  const fieldDefs: Array<{
    fieldKey: string;
    label: string;
    extract: (r: InvestigationRecord) => {
      display: string;
      isMissing: boolean;
      cautionNote?: string;
    };
  }> = [
    {
      fieldKey: 'acronym',
      label: 'Acronym / Short Name',
      extract: (r) => ({
        display: `${extractEnvironmentalParams(r).acronym} (${r.timeframe})`,
        isMissing: false,
      }),
    },
    {
      fieldKey: 'scientificPurpose',
      label: 'Research Objective',
      extract: (r) => ({
        display: r.scientificPurpose || r.overview || NOT_SPECIFIED,
        isMissing: !r.scientificPurpose && !r.overview,
      }),
    },
    {
      fieldKey: 'family',
      label: 'Research Category',
      extract: (r) => ({
        display: r.family,
        isMissing: false,
      }),
    },
    {
      fieldKey: 'platform',
      label: 'Platform & Gravity Context',
      extract: (r) => ({
        display: `${r.platform} (${r.gravityContext})`,
        isMissing: false,
        cautionNote: !r.isMicrogravity
          ? 'Ground-based terrestrial 1g only — NOT microgravity data'
          : r.id === 'acme-efield'
          ? 'Microgravity with electrostatic field — NOT partial-gravity testing'
          : undefined,
      }),
    },
    {
      fieldKey: 'fuels',
      label: 'Fuel / Material',
      extract: (r) => ({
        display: r.fuels.length > 0 ? r.fuels.join('; ') : NOT_SPECIFIED,
        isMissing: r.fuels.length === 0,
      }),
    },
    {
      fieldKey: 'materialsAndGeometry',
      label: 'Materials & Geometry',
      extract: (r) => ({
        display: r.materialsAndGeometry ?? NOT_SPECIFIED,
        isMissing: !r.materialsAndGeometry,
      }),
    },
    {
      fieldKey: 'oxygenConcentration',
      label: 'Oxygen Concentration',
      extract: (r) => {
        const val = extractEnvironmentalParams(r).oxygenConcentration;
        return {
          display: val ?? NOT_SPECIFIED,
          isMissing: !val,
        };
      },
    },
    {
      fieldKey: 'pressure',
      label: 'Pressure',
      extract: (r) => {
        const val = extractEnvironmentalParams(r).pressure;
        return {
          display: val ?? NOT_SPECIFIED,
          isMissing: !val,
        };
      },
    },
    {
      fieldKey: 'temperature',
      label: 'Temperature / Heat Flux',
      extract: (r) => {
        const val = extractEnvironmentalParams(r).temperature;
        return {
          display: val ?? NOT_SPECIFIED,
          isMissing: !val,
        };
      },
    },
    {
      fieldKey: 'airflow',
      label: 'Airflow / Ventilation',
      extract: (r) => {
        const val = extractEnvironmentalParams(r).airflow;
        return {
          display: val ?? NOT_SPECIFIED,
          isMissing: !val,
        };
      },
    },
    {
      fieldKey: 'environmentalVariables',
      label: 'Environmental Conditions',
      extract: (r) => ({
        display:
          r.environmentalVariables.length > 0
            ? r.environmentalVariables.join('; ')
            : NOT_SPECIFIED,
        isMissing: r.environmentalVariables.length === 0,
      }),
    },
    {
      fieldKey: 'sensors',
      label: 'Sensors & Instrumentation',
      extract: (r) => ({
        display:
          r.sensors && r.sensors.length > 0
            ? r.sensors.join('; ')
            : NOT_SPECIFIED,
        isMissing: !r.sensors || r.sensors.length === 0,
      }),
    },
    {
      fieldKey: 'measurementMethods',
      label: 'Measurement Methods',
      extract: (r) => ({
        display: r.measurementMethods ?? NOT_SPECIFIED,
        isMissing: !r.measurementMethods,
      }),
    },
    {
      fieldKey: 'reportedFindings',
      label: 'Documented Findings',
      extract: (r) => ({
        display: r.reportedFindings ?? NOT_SPECIFIED,
        isMissing: !r.reportedFindings,
        cautionNote: r.isPlannedOrOngoing
          ? 'Planned / in-progress investigation — do not treat objectives as completed results'
          : undefined,
      }),
    },
    {
      fieldKey: 'evidenceType',
      label: 'Evidence Classification',
      extract: (r) => ({
        display: r.evidenceType,
        isMissing: false,
      }),
    },
    {
      fieldKey: 'dataAvailability',
      label: 'Data Availability & PSI ID',
      extract: (r) => ({
        display: r.psiId
          ? `${r.dataAvailabilityLabel} · PSI ID: ${r.psiId}`
          : r.dataAvailabilityLabel,
        isMissing: false,
      }),
    },
    {
      fieldKey: 'sourceReference',
      label: 'Source Reference & Identifiers',
      extract: (r) => {
        const ids = [
          r.ntrsDocumentId ? `NTRS ${r.ntrsDocumentId}` : null,
          r.doi ? `DOI ${r.doi}` : null,
        ].filter(Boolean);
        return {
          display: `${r.sourceLabel}${ids.length > 0 ? ` (${ids.join(', ')})` : ''}`,
          isMissing: false,
        };
      },
    },
    {
      fieldKey: 'limitations',
      label: 'Research Limitations',
      extract: (r) => ({
        display:
          r.limitations.length > 0
            ? r.limitations.join(' | ')
            : NOT_SPECIFIED,
        isMissing: r.limitations.length === 0,
      }),
    },
  ];

  return fieldDefs.map((def) => {
    const values = selected.map((record) => ({
      investigationId: record.id,
      ...def.extract(record),
    }));
    const uniqueNormalized = new Set(
      values.map((v) => v.display.trim().toLowerCase())
    );
    return {
      fieldKey: def.fieldKey,
      label: def.label,
      values,
      hasDifference: uniqueNormalized.size > 1,
    };
  });
}
