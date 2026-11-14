import type { DataAvailabilityStatus, InvestigationRecord } from '../types/research.ts';

export type UnitFamilyId =
  | 'ALL'
  | 'COUNTS'
  | 'THERMAL_POWER'
  | 'FLOW_ELECTRIC'
  | 'SIZE_TIME';

export interface DatasetCatalogItem {
  id: string;
  title: string;
  investigationId: string;
  investigationShortName: string;
  repository: string;
  variableNames: string[];
  units: string[];
  unitFamily: Exclude<UnitFamilyId, 'ALL'>;
  measurementContext: string;
  dataType: 'Published Summary Value' | 'Experimental Operating Range' | 'Descriptive / Archive Pointer';
  availabilityStatus: DataAvailabilityStatus;
  availabilityLabel: string;
  hasRawLocalTelemetry: boolean;
  sourceUrl: string;
  sourceCitation: string;
  qualityNote: string;
}

export interface PublishedCountDatum {
  id: string;
  investigationId: string;
  experiment: string;
  count: number;
  metric: string;
  unit: string;
  source: string;
  valueDisplay: string;
}

export interface ChartRecommendation {
  chartType: 'BAR' | 'SCATTER' | 'HISTOGRAM' | 'NONE';
  reason: string;
  lineChartSupported: boolean;
  lineChartReason: string;
}

export function classifyUnitFamily(unit: string): Exclude<UnitFamilyId, 'ALL'> {
  const u = unit.toLowerCase();
  if (/test|point|flame|x|factor|multiplier|study|count|experiment/.test(u)) {
    return 'COUNTS';
  }
  if (/k\b|kelvin|w\b|watt|psi|atm|%|o2/.test(u)) {
    return 'THERMAL_POWER';
  }
  if (/kv|cm\/s|m\/s|volt/.test(u)) {
    return 'FLOW_ELECTRIC';
  }
  return 'SIZE_TIME';
}

export function extractDatasetCatalog(
  investigations: InvestigationRecord[]
): DatasetCatalogItem[] {
  const items: DatasetCatalogItem[] = [];

  for (const inv of investigations) {
    const repository = inv.psiId
      ? `NASA PSI (ID ${inv.psiId})`
      : inv.ntrsDocumentId
      ? `NASA NTRS (${inv.ntrsDocumentId})`
      : inv.isMicrogravity
      ? 'NASA Program Dossier / DOI'
      : 'External Terrestrial Lab (UL / NASA)';

    if (inv.quantitativeData.length > 0) {
      for (const q of inv.quantitativeData) {
        items.push({
          id: `ds-${inv.id}-${q.id}`,
          title: `${inv.shortName} — ${q.label}`,
          investigationId: inv.id,
          investigationShortName: inv.shortName,
          repository,
          variableNames: [q.label, ...inv.environmentalVariables.slice(0, 2)],
          units: [q.unit],
          unitFamily: classifyUnitFamily(q.unit),
          measurementContext: q.conditionContext,
          dataType:
            q.kind === 'EXPERIMENTAL_CONDITION_RANGE'
              ? 'Experimental Operating Range'
              : 'Published Summary Value',
          availabilityStatus: inv.dataAvailability,
          availabilityLabel: inv.dataAvailabilityLabel,
          hasRawLocalTelemetry: inv.hasRawNumericalDataset,
          sourceUrl: inv.sourceUrl,
          sourceCitation: q.sourceCitation,
          qualityNote: q.qualityNote,
        });
      }
    } else {
      items.push({
        id: `ds-${inv.id}-summary`,
        title: `${inv.shortName} — ${inv.family} Summary`,
        investigationId: inv.id,
        investigationShortName: inv.shortName,
        repository,
        variableNames:
          inv.environmentalVariables.length > 0
            ? inv.environmentalVariables
            : ['Qualitative / Descriptive Scope'],
        units: ['Not tabulated locally'],
        unitFamily: 'COUNTS',
        measurementContext: `${inv.platform} · ${inv.gravityContext} · ${inv.timeframe}`,
        dataType: 'Descriptive / Archive Pointer',
        availabilityStatus: inv.dataAvailability,
        availabilityLabel: inv.dataAvailabilityLabel,
        hasRawLocalTelemetry: inv.hasRawNumericalDataset,
        sourceUrl: inv.sourceUrl,
        sourceCitation: inv.sourceLabel,
        qualityNote:
          inv.limitations[0] ??
          'Raw experimental curves/logs are not embedded in the local JSON snapshot.',
      });
    }
  }

  return items;
}

export function extractPublishedCountsFromRecords(
  investigations: InvestigationRecord[],
  selectedInvestigationId: string | 'ALL' = 'ALL'
): PublishedCountDatum[] {
  const results: PublishedCountDatum[] = [];

  for (const inv of investigations) {
    if (
      selectedInvestigationId !== 'ALL' &&
      inv.id !== selectedInvestigationId
    ) {
      continue;
    }
    for (const q of inv.quantitativeData) {
      if (q.kind === 'EXPERIMENTAL_CONDITION_RANGE') continue;
      const numericVal =
        typeof q.numericValue === 'number'
          ? q.numericValue
          : typeof q.min === 'number'
          ? q.min
          : typeof q.max === 'number'
          ? q.max
          : null;
      if (numericVal === null) continue;
      if (classifyUnitFamily(q.unit) !== 'COUNTS') continue;

      results.push({
        id: q.id,
        investigationId: inv.id,
        experiment: `${inv.shortName}: ${q.label.replace(/\(.*?\)/g, '').trim().slice(0, 22)}`,
        count: numericVal,
        metric: q.label,
        unit: q.unit,
        source: q.sourceCitation,
        valueDisplay: q.valueDisplay,
      });
    }
  }

  return results;
}

export function recommendValidChartType(
  view:
    | 'PUBLISHED_COUNTS'
    | 'TIMELINE_SPANS'
    | 'TIMELINE_SCATTER'
    | 'ARCHIVE_DISTRIBUTION'
    | 'EXPERIMENTAL_BOUNDS'
    | 'ERA_HISTOGRAM',
  pointCount: number
): ChartRecommendation {
  const lineChartReason =
    'Continuous time-series LineChart is disabled because the loaded JSON contains summary counts and operating bounds rather than time-indexed raw telemetry CSVs.';

  if (pointCount === 0) {
    return {
      chartType: 'NONE',
      reason: 'No compatible numerical values exist for the current filter selection.',
      lineChartSupported: false,
      lineChartReason,
    };
  }

  switch (view) {
    case 'TIMELINE_SCATTER':
      return {
        chartType: 'SCATTER',
        reason: 'Two numeric temporal variables (Start Year vs. Span in Years) support a ScatterPlot.',
        lineChartSupported: false,
        lineChartReason,
      };
    case 'ERA_HISTOGRAM':
      return {
        chartType: 'HISTOGRAM',
        reason: 'Binned campaign start-year intervals support a frequency Histogram.',
        lineChartSupported: false,
        lineChartReason,
      };
    case 'PUBLISHED_COUNTS':
    case 'TIMELINE_SPANS':
    case 'ARCHIVE_DISTRIBUTION':
    case 'EXPERIMENTAL_BOUNDS':
      return {
        chartType: 'BAR',
        reason: 'Discrete investigation metrics and condition bounds are accurately represented via BarChart.',
        lineChartSupported: false,
        lineChartReason,
      };
  }
}

function escapeCsvCell(val: string | number | boolean): string {
  const s = String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportDatasetCatalogCsv(items: DatasetCatalogItem[]): string {
  const headers = [
    'Dataset ID',
    'Title',
    'Investigation',
    'Repository',
    'Data Type',
    'Variables',
    'Units',
    'Measurement Context',
    'Availability Status',
    'Raw Local Telemetry',
    'Source Citation',
    'Source URL',
    'Quality Note',
  ];
  const rows = items.map((item) => [
    item.id,
    item.title,
    item.investigationShortName,
    item.repository,
    item.dataType,
    item.variableNames.join(' | '),
    item.units.join(' | '),
    item.measurementContext,
    item.availabilityLabel,
    item.hasRawLocalTelemetry ? 'Yes' : 'No (Metadata/Summary Only)',
    item.sourceCitation,
    item.sourceUrl,
    item.qualityNote,
  ]);
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\n');
}

export function exportDatasetCatalogJson(items: DatasetCatalogItem[]): string {
  return JSON.stringify(
    {
      exportedBy: 'FLAREX Scientific Data Explorer 2.0',
      exportedAt: new Date().toISOString(),
      rawTelemetryBundledLocally: false,
      recordCount: items.length,
      datasets: items,
    },
    null,
    2
  );
}
