import type { InvestigationRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';

export type ConditionCompatibilityStatus =
  | 'Compatible'
  | 'Partially comparable'
  | 'Incompatible'
  | 'Missing experimental parameters';

export interface ConditionDimensionComparison {
  dimension:
    | 'Gravity Environment'
    | 'Pressure'
    | 'Oxygen Concentration'
    | 'Airflow'
    | 'Fuel / Material'
    | 'Temperature'
    | 'Experimental Geometry'
    | 'Measurement Methods';
  status: ConditionCompatibilityStatus;
  summary: string;
  valuesByStudy: Array<{
    investigationId: string;
    shortName: string;
    value: string;
    isMissing: boolean;
  }>;
}

export interface ExperimentalConditionIntelligenceReport {
  overallStatus: ConditionCompatibilityStatus;
  dimensions: ConditionDimensionComparison[];
  guidanceNote: string;
}

function normalizeKeywordOverlap(texts: string[]): boolean {
  if (texts.length < 2) return false;
  const sets = texts.map(
    (t) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 3)
      )
  );
  for (const word of sets[0]) {
    if (sets.slice(1).every((s) => s.has(word))) return true;
  }
  return false;
}

export function analyzeExperimentalConditions(
  selected: InvestigationRecord[]
): ExperimentalConditionIntelligenceReport {
  if (selected.length < 2) {
    return {
      overallStatus: 'Missing experimental parameters',
      dimensions: [],
      guidanceNote:
        'Select at least 2 investigations to evaluate experimental condition comparability.',
    };
  }

  const buildDim = (
    dimension: ConditionDimensionComparison['dimension'],
    extract: (r: InvestigationRecord) => string | null,
    evaluate: (
      entries: Array<{ investigationId: string; shortName: string; value: string; isMissing: boolean }>
    ) => { status: ConditionCompatibilityStatus; summary: string }
  ): ConditionDimensionComparison => {
    const valuesByStudy = selected.map((r) => {
      const raw = extract(r);
      const isMissing = !raw || !raw.trim();
      return {
        investigationId: r.id,
        shortName: r.shortName,
        value: isMissing ? 'Not available in reviewed source' : raw.trim(),
        isMissing,
      };
    });
    const { status, summary } = evaluate(valuesByStudy);
    return { dimension, status, summary, valuesByStudy };
  };

  const dimensions: ConditionDimensionComparison[] = [
    buildDim(
      'Gravity Environment',
      (r) => `${r.gravityContext}${r.id === 'acme-efield' ? ' (0g + 0–10 kV E-Field)' : ''}`,
      (entries) => {
        const hasMicro = selected.some((r) => r.isMicrogravity);
        const has1g = selected.some((r) => !r.isMicrogravity);
        const hasEfield = selected.some((r) => r.id === 'acme-efield');
        if (hasMicro && has1g) {
          return {
            status: 'Incompatible',
            summary:
              'Mixes spaceflight microgravity (0g) with terrestrial ground testing (1g). Direct numerical equivalence is invalid without buoyancy-scaling models.',
          };
        }
        if (hasEfield && selected.length > 1) {
          return {
            status: 'Partially comparable',
            summary:
              'All selected records are 0g, but ACME E-FIELD applies electrostatic ion winds rather than purely quiescent or convective airflow.',
          };
        }
        return {
          status: 'Compatible',
          summary: `Consistent ${entries[0]?.value} provenance across selected investigations.`,
        };
      }
    ),

    buildDim(
      'Pressure',
      (r) => extractEnvironmentalParams(r).pressure,
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: `Chamber pressure is omitted in ${entries.length - present.length}/${entries.length} reviewed source summaries.`,
          };
        }
        const unique = new Set(present.map((p) => p.value.toLowerCase()));
        return unique.size === 1 && present.length === entries.length
          ? {
              status: 'Compatible',
              summary: 'Matching documented ambient chamber pressure across studies.',
            }
          : {
              status: 'Partially comparable',
              summary:
                'Studies span differing or multi-point pressure ranges (verify exact 14.7 psi vs reduced-pressure cabin setpoints).',
            };
      }
    ),

    buildDim(
      'Oxygen Concentration',
      (r) => extractEnvironmentalParams(r).oxygenConcentration,
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: `O2% bounds are missing in ${entries.length - present.length}/${entries.length} reviewed records.`,
          };
        }
        return {
          status: 'Partially comparable',
          summary:
            'Oxygen ranges are documented across studies but cover different experimental bounds (e.g., 15–23% cabin vs enriched 0.10–0.50 mole fraction).',
        };
      }
    ),

    buildDim(
      'Airflow',
      (r) => extractEnvironmentalParams(r).airflow,
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: `Airflow / coflow velocity is omitted in ${entries.length - present.length}/${entries.length} reviewed entries.`,
          };
        }
        return {
          status: 'Partially comparable',
          summary:
            'Forced coflow / opposed flow ranges differ by facility duct geometry and quiescent vs convective configuration.',
        };
      }
    ),

    buildDim(
      'Fuel / Material',
      (r) => (r.fuels.length > 0 ? r.fuels.join('; ') : null),
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: 'Fuel composition missing in one or more records.',
          };
        }
        const hasBattery = selected.some((r) => r.id === 'battery-fire-ul');
        if (hasBattery && selected.some((r) => r.id !== 'battery-fire-ul')) {
          return {
            status: 'Incompatible',
            summary:
              'Compares electrochemical Li-ion cells (LFP/NMC) with conventional hydrocarbon/polymer spacecraft test fuels.',
          };
        }
        return normalizeKeywordOverlap(present.map((p) => p.value))
          ? {
              status: 'Compatible',
              summary: 'Shared fuel or polymer family detected across compared investigations.',
            }
          : {
              status: 'Partially comparable',
              summary: 'Distinct fuel states or chemical compositions (solid textile/PMMA vs gaseous/droplet fuels).',
            };
      }
    ),

    buildDim(
      'Temperature',
      (r) => extractEnvironmentalParams(r).temperature,
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length === 0) {
          return {
            status: 'Missing experimental parameters',
            summary: 'No explicit thermal boundary or peak temperature reported in reviewed summaries.',
          };
        }
        if (present.length < entries.length) {
          return {
            status: 'Missing experimental parameters',
            summary: `Temperature or heat flux documented in ${present.length}/${entries.length} studies only.`,
          };
        }
        return {
          status: 'Partially comparable',
          summary:
            'Thermal regimes differ (e.g., 600–1000 K cool diffusion flames vs 661–1459 °C Li-ion thermal runaway).',
        };
      }
    ),

    buildDim(
      'Experimental Geometry',
      (r) => r.materialsAndGeometry,
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: 'Sample dimensions or chamber geometry missing in one or more reviewed records.',
          };
        }
        const hasSaffire = selected.some((r) => r.id === 'saffire');
        const hasRack = selected.some(
          (r) =>
            r.platform.includes('MSG') ||
            r.platform.includes('CIR') ||
            r.platform.includes('MDCA')
        );
        if (hasSaffire && hasRack) {
          return {
            status: 'Incompatible',
            summary:
              'Vehicle-scale uncrewed Cygnus cargo bay vs bench-scale ISS MSG/CIR enclosure; radiative wall & oxygen depletion scales are non-equivalent.',
          };
        }
        return {
          status: 'Partially comparable',
          summary: 'Bench-top sample geometries vary across cylindrical rods, flat fabrics, porous burners, and droplets.',
        };
      }
    ),

    buildDim(
      'Measurement Methods',
      (r) =>
        r.measurementMethods ??
        (r.sensors && r.sensors.length > 0 ? r.sensors.join('; ') : null),
      (entries) => {
        const present = entries.filter((e) => !e.isMissing);
        if (present.length < 2) {
          return {
            status: 'Missing experimental parameters',
            summary: 'Sensor diagnostics not detailed in one or more summaries.',
          };
        }
        return normalizeKeywordOverlap(present.map((p) => p.value))
          ? {
              status: 'Compatible',
              summary: 'Shared optical/thermal diagnostic modalities (e.g., cameras, thermocouples, radiometers).',
            }
          : {
              status: 'Partially comparable',
              summary: 'Instrumentation spans specialized diagnostics (aerosol P-Trak vs flame imaging vs heat-flux calorimetry).',
            };
      }
    ),
  ];

  const hasIncompatible = dimensions.some((d) => d.status === 'Incompatible');
  const hasMissing = dimensions.some(
    (d) => d.status === 'Missing experimental parameters'
  );
  const overallStatus: ConditionCompatibilityStatus = hasIncompatible
    ? 'Incompatible'
    : hasMissing
    ? 'Partially comparable'
    : dimensions.every((d) => d.status === 'Compatible')
    ? 'Compatible'
    : 'Partially comparable';

  return {
    overallStatus,
    dimensions,
    guidanceNote:
      'FLAREX evaluates experimental condition comparability strictly for scientific literature interpretation. Incompatible conditions must never be treated as equivalent.',
  };
}
