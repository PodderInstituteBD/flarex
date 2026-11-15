import type { InvestigationRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';
import {
  analyzeExperimentalConditions,
  ConditionDimensionComparison,
} from './experimentalConditions.ts';

export type ExperimentalCompatibilityClass =
  | 'Directly comparable'
  | 'Partially comparable'
  | 'Contextually related'
  | 'Not scientifically comparable'
  | 'Insufficient information';

export type FindingComparisonClass =
  | 'Report similar findings'
  | 'Report different findings'
  | 'Examine different aspects of the same phenomenon'
  | 'Cannot be meaningfully compared';

export interface CrossStudyDimensionDetail {
  dimension:
    | 'Gravity Environment'
    | 'Pressure'
    | 'Oxygen Concentration'
    | 'Airflow'
    | 'Fuel / Material'
    | 'Temperature'
    | 'Experimental Geometry'
    | 'Measurement Methods'
    | 'Sensors'
    | 'Experimental Objectives'
    | 'Published Findings'
    | 'Data Availability';
  status: 'Aligned' | 'Partially comparable' | 'Incompatible' | 'Missing';
  note: string;
  valuesByStudy: Array<{
    investigationId: string;
    shortName: string;
    value: string;
    isMissing: boolean;
  }>;
}

export interface CrossStudyAnalysisReport {
  studyIds: string[];
  studyShortNames: string[];
  compatibilityClass: ExperimentalCompatibilityClass;
  findingComparisonClass: FindingComparisonClass;
  sharedExperimentalVariables: string[];
  differentExperimentalVariables: string[];
  missingParameters: string[];
  incompatibleUnits: string[];
  differentMeasurementTechniques: string[];
  dimensions12: CrossStudyDimensionDetail[];
  base8Dimensions: ConditionDimensionComparison[];
  groundedExplanation: string;
}

function intersectTerms(lists: string[][]): string[] {
  if (lists.length < 2) return [];
  const norm = (s: string) => s.toLowerCase().split('(')[0].trim();
  const base = new Set(lists[0].map(norm).filter(Boolean));
  const shared: string[] = [];
  for (const term of base) {
    if (lists.slice(1).every((arr) => arr.some((x) => norm(x).includes(term) || term.includes(norm(x))))) {
      shared.push(term);
    }
  }
  return shared;
}

export function analyzeCrossStudyComparison(
  selected: InvestigationRecord[]
): CrossStudyAnalysisReport {
  const base8 = analyzeExperimentalConditions(selected);

  if (selected.length < 2) {
    return {
      studyIds: selected.map((r) => r.id),
      studyShortNames: selected.map((r) => r.shortName),
      compatibilityClass: 'Insufficient information',
      findingComparisonClass: 'Cannot be meaningfully compared',
      sharedExperimentalVariables: [],
      differentExperimentalVariables: [],
      missingParameters: ['At least 2 investigations are required for cross-study analysis.'],
      incompatibleUnits: [],
      differentMeasurementTechniques: [],
      dimensions12: [],
      base8Dimensions: base8.dimensions,
      groundedExplanation:
        'Select at least 2 investigations to perform cross-investigation experimental compatibility and finding analysis.',
    };
  }

  const sharedExperimentalVariables = intersectTerms(
    selected.map((r) => r.environmentalVariables)
  );
  const allVars = Array.from(
    new Set(selected.flatMap((r) => r.environmentalVariables.map((v) => v.split('(')[0].trim())))
  );
  const differentExperimentalVariables = allVars.filter(
    (v) => !sharedExperimentalVariables.includes(v.toLowerCase())
  );

  // Detect incompatible units across quantitative metadata
  const unitGroups = new Map<string, Set<string>>();
  for (const rec of selected) {
    for (const q of rec.quantitativeData) {
      if (!q.unit) continue;
      const key = /temp/i.test(q.label)
        ? 'Temperature'
        : /pressure/i.test(q.label)
        ? 'Pressure'
        : /flow|vel/i.test(q.label)
        ? 'Flow Velocity'
        : /oxygen|o2/i.test(q.label)
        ? 'Oxygen'
        : q.label;
      const set = unitGroups.get(key) ?? new Set<string>();
      set.add(q.unit);
      unitGroups.set(key, set);
    }
  }
  const incompatibleUnits: string[] = [];
  for (const [param, units] of unitGroups.entries()) {
    if (units.size > 1) {
      incompatibleUnits.push(`${param}: ${Array.from(units).join(' vs ')}`);
    }
  }

  const differentMeasurementTechniques = Array.from(
    new Set(
      selected.map(
        (r) =>
          `${r.shortName}: ${
            r.measurementMethods ??
            (r.sensors.length > 0 ? r.sensors.join(', ') : 'Not detailed in reviewed source')
          }`
      )
    )
  );

  // Build 12 exact dimensions
  const mapBaseDim = (
    dimName: ConditionDimensionComparison['dimension']
  ): CrossStudyDimensionDetail => {
    const found = base8.dimensions.find((d) => d.dimension === dimName);
    if (!found) {
      return {
        dimension: dimName,
        status: 'Missing',
        note: 'Not available in reviewed sources.',
        valuesByStudy: [],
      };
    }
    const status: CrossStudyDimensionDetail['status'] =
      found.status === 'Compatible'
        ? 'Aligned'
        : found.status === 'Incompatible'
        ? 'Incompatible'
        : found.status === 'Missing experimental parameters'
        ? 'Missing'
        : 'Partially comparable';
    return {
      dimension: dimName,
      status,
      note: found.summary,
      valuesByStudy: found.valuesByStudy,
    };
  };

  const sensorsDim: CrossStudyDimensionDetail = {
    dimension: 'Sensors',
    status: selected.every((r) => r.sensors.length > 0)
      ? intersectTerms(selected.map((r) => r.sensors)).length > 0
        ? 'Partially comparable'
        : 'Incompatible'
      : 'Missing',
    note: selected.every((r) => r.sensors.length > 0)
      ? 'Diagnostics span study-specific optical, thermocouple, ion-current, or aerosol sensors.'
      : 'Sensor list incomplete in one or more reviewed records.',
    valuesByStudy: selected.map((r) => ({
      investigationId: r.id,
      shortName: r.shortName,
      value: r.sensors.length > 0 ? r.sensors.join('; ') : 'Not available in reviewed source',
      isMissing: r.sensors.length === 0,
    })),
  };

  const objectivesDim: CrossStudyDimensionDetail = {
    dimension: 'Experimental Objectives',
    status: selected.every((r) => Boolean(r.scientificPurpose)) ? 'Partially comparable' : 'Missing',
    note: 'Objectives define phenomena targeted (solid flammability vs droplet cool flame vs E-field control vs smoke detection).',
    valuesByStudy: selected.map((r) => ({
      investigationId: r.id,
      shortName: r.shortName,
      value: r.scientificPurpose ?? 'Not available in reviewed source',
      isMissing: !r.scientificPurpose,
    })),
  };

  const findingsDim: CrossStudyDimensionDetail = {
    dimension: 'Published Findings',
    status: selected.every((r) => Boolean(r.reportedFindings)) ? 'Partially comparable' : 'Missing',
    note: selected.every((r) => Boolean(r.reportedFindings))
      ? 'Published findings exist for all selected studies; verify gravity & scale compatibility before cross-inference.'
      : 'One or more selected investigations are planned/ongoing or lack reported findings in reviewed sources.',
    valuesByStudy: selected.map((r) => ({
      investigationId: r.id,
      shortName: r.shortName,
      value: r.reportedFindings ?? 'No published experimental findings yet in reviewed source',
      isMissing: !r.reportedFindings,
    })),
  };

  const availabilityDim: CrossStudyDimensionDetail = {
    dimension: 'Data Availability',
    status: selected.every((r) => r.hasRawNumericalDataset)
      ? 'Aligned'
      : selected.some((r) => r.dataAvailability === 'PUBLIC_IN_PSI' || r.dataAvailability === 'PARTIAL_OR_NTRS')
      ? 'Partially comparable'
      : 'Missing',
    note: 'Raw numerical telemetry resides externally in NASA PSI/NTRS rather than local bundled CSVs.',
    valuesByStudy: selected.map((r) => ({
      investigationId: r.id,
      shortName: r.shortName,
      value: `${r.dataAvailabilityLabel}${r.psiId ? ` (PSI: ${r.psiId})` : ''}`,
      isMissing: false,
    })),
  };

  const dimensions12: CrossStudyDimensionDetail[] = [
    mapBaseDim('Gravity Environment'),
    mapBaseDim('Pressure'),
    mapBaseDim('Oxygen Concentration'),
    mapBaseDim('Airflow'),
    mapBaseDim('Fuel / Material'),
    mapBaseDim('Temperature'),
    mapBaseDim('Experimental Geometry'),
    mapBaseDim('Measurement Methods'),
    sensorsDim,
    objectivesDim,
    findingsDim,
    availabilityDim,
  ];

  const missingParameters: string[] = [];
  for (const r of selected) {
    const p = extractEnvironmentalParams(r);
    if (!p.pressure) missingParameters.push(`${r.shortName}: Chamber pressure omitted`);
    if (!p.oxygenConcentration) missingParameters.push(`${r.shortName}: O2 concentration omitted`);
    if (!p.temperature) missingParameters.push(`${r.shortName}: Temperature/heat flux omitted`);
    if (!r.reportedFindings) missingParameters.push(`${r.shortName}: No published experimental findings`);
  }

  // Classify Experimental Compatibility (5 classes)
  const hasMixedGravity =
    selected.some((r) => r.isMicrogravity) && selected.some((r) => !r.isMicrogravity);
  const hasBatteryMix =
    selected.some((r) => r.id === 'battery-fire-ul') &&
    selected.some((r) => r.id !== 'battery-fire-ul');
  const hasSaffireRackMix =
    selected.some((r) => r.id === 'saffire') &&
    selected.some(
      (r) =>
        r.platform.includes('MSG') ||
        r.platform.includes('CIR') ||
        r.platform.includes('MDCA')
    );
  const hasPlannedWithoutFindings = selected.some(
    (r) => r.isPlannedOrOngoing && !r.reportedFindings
  );
  const sameFamily = new Set(selected.map((r) => r.family)).size === 1;
  const alignedCount = dimensions12.filter((d) => d.status === 'Aligned').length;
  const missingCount = dimensions12.filter((d) => d.status === 'Missing').length;

  let compatibilityClass: ExperimentalCompatibilityClass;
  if (hasMixedGravity || hasBatteryMix) {
    compatibilityClass = 'Not scientifically comparable';
  } else if (hasPlannedWithoutFindings && missingCount >= 4) {
    compatibilityClass = 'Insufficient information';
  } else if (sameFamily && alignedCount >= 4 && !hasSaffireRackMix) {
    compatibilityClass = 'Directly comparable';
  } else if (!hasSaffireRackMix && base8.dimensions.some((d) => d.status === 'Compatible')) {
    compatibilityClass = 'Partially comparable';
  } else {
    compatibilityClass = 'Contextually related';
  }

  // Classify Finding Comparison (4 classes)
  let findingComparisonClass: FindingComparisonClass;
  if (
    compatibilityClass === 'Not scientifically comparable' ||
    compatibilityClass === 'Insufficient information' ||
    selected.some((r) => !r.reportedFindings)
  ) {
    findingComparisonClass = 'Cannot be meaningfully compared';
  } else if (sameFamily && selected.every((r) => r.hasQuantitativeSummary)) {
    findingComparisonClass = 'Examine different aspects of the same phenomenon';
  } else if (
    selected.some((r) => /extinction|cool flame/i.test(r.reportedFindings ?? '')) &&
    selected.some((r) => /soot|smoke/i.test(r.reportedFindings ?? ''))
  ) {
    findingComparisonClass = 'Examine different aspects of the same phenomenon';
  } else if (compatibilityClass === 'Directly comparable') {
    findingComparisonClass = 'Report similar findings';
  } else {
    findingComparisonClass = 'Report different findings';
  }

  const reasons: string[] = [];
  if (hasMixedGravity) {
    reasons.push(
      'Gravity mismatch: combines spaceflight microgravity (0g) with terrestrial ground laboratory testing (1g).'
    );
  }
  if (hasBatteryMix) {
    reasons.push(
      'Fuel mismatch: compares Li-ion electrochemical thermal runaway with hydrocarbon/polymer combustion.'
    );
  }
  if (hasSaffireRackMix) {
    reasons.push(
      'Scale mismatch: Cygnus spacecraft cargo-bay fire testing differs fundamentally in radiative wall feedback and oxygen inventory from bench-scale ISS rack chambers.'
    );
  }
  if (selected.some((r) => r.id === 'acme-efield') && selected.length > 1) {
    reasons.push(
      'External force field: ACME E-FIELD applies high-voltage electrostatic ion winds (0–10 kV), which must not be equated with buoyancy-driven convection.'
    );
  }
  if (hasPlannedWithoutFindings) {
    reasons.push(
      'Data maturity boundary: one or more selected entries are planned/ongoing investigations without published flight findings.'
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      `Studies share ${selected[0]?.gravityContext} context (${
        sharedExperimentalVariables.length > 0
          ? `common variables: ${sharedExperimentalVariables.join(', ')}`
          : 'distinct diagnostic setups'
      }), allowing structured contextual comparison subject to omitted pressure/O2 setpoints.`
    );
  }

  return {
    studyIds: selected.map((r) => r.id),
    studyShortNames: selected.map((r) => r.shortName),
    compatibilityClass,
    findingComparisonClass,
    sharedExperimentalVariables,
    differentExperimentalVariables,
    missingParameters: missingParameters.slice(0, 8),
    incompatibleUnits,
    differentMeasurementTechniques,
    dimensions12,
    base8Dimensions: base8.dimensions,
    groundedExplanation: reasons.join(' '),
  };
}
