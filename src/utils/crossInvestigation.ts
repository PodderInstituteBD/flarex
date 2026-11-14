import type { InvestigationRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';
import { computeCategoryBreakdown } from './researchLogic.ts';

export interface CrossInvestigationMatch {
  investigation: InvestigationRecord;
  sharedThemes: string[];
  overlapScore: number;
  compatibilityCaution: string | null;
}

export interface CrossInvestigationAnalysis {
  sharedPlatforms: string[];
  sharedFuelsOrTopics: string[];
  sharedVariables: string[];
  sharedSensors: string[];
  compatibilityWarnings: string[];
  divergencesDetected: string[];
  missingInformationGaps: string[];
}

function tokenizeKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
}

export function discoverRelatedInvestigations(
  focal: InvestigationRecord,
  allRecords: InvestigationRecord[],
  limit = 4
): CrossInvestigationMatch[] {
  const catBreakdown = computeCategoryBreakdown(allRecords);
  const focalCats = new Set(
    catBreakdown.filter((c) => c.recordIds.includes(focal.id)).map((c) => c.id)
  );
  const focalFuels = tokenizeKeywords(focal.fuels.join(' '));
  const focalVars = tokenizeKeywords(focal.environmentalVariables.join(' '));
  const focalSensors = tokenizeKeywords((focal.sensors ?? []).join(' '));

  const matches: CrossInvestigationMatch[] = [];

  for (const candidate of allRecords) {
    if (candidate.id === focal.id) continue;
    const sharedThemes: string[] = [];
    let score = 0;

    if (candidate.family === focal.family) {
      score += 4;
      sharedThemes.push(`Same family: ${candidate.family}`);
    }
    if (candidate.platform === focal.platform) {
      score += 3;
      sharedThemes.push(`Same platform: ${candidate.platform}`);
    }

    const candCats = catBreakdown
      .filter((c) => c.recordIds.includes(candidate.id))
      .filter((c) => focalCats.has(c.id));
    if (candCats.length > 0) {
      score += candCats.length * 2;
      sharedThemes.push(`Topics: ${candCats.map((c) => c.label).join(', ')}`);
    }

    const candFuels = tokenizeKeywords(candidate.fuels.join(' '));
    const fuelHits = [...focalFuels].filter((w) => candFuels.has(w));
    if (fuelHits.length > 0) {
      score += 2;
      sharedThemes.push(`Fuel overlap (${fuelHits.slice(0, 3).join(', ')})`);
    }

    const candVars = tokenizeKeywords(candidate.environmentalVariables.join(' '));
    const varHits = [...focalVars].filter((w) => candVars.has(w));
    if (varHits.length > 0) {
      score += 1;
      sharedThemes.push(`Variables (${varHits.slice(0, 3).join(', ')})`);
    }

    const candSensors = tokenizeKeywords((candidate.sensors ?? []).join(' '));
    const sensorHits = [...focalSensors].filter((w) => candSensors.has(w));
    if (sensorHits.length > 0) {
      score += 2;
      sharedThemes.push(`Instrumentation overlap (${sensorHits.slice(0, 2).join(', ')})`);
    }

    let compatibilityCaution: string | null = null;
    if (focal.isMicrogravity !== candidate.isMicrogravity) {
      compatibilityCaution =
        'Gravity incompatibility: compares 0g spaceflight vs. 1g terrestrial ground lab.';
    } else if (candidate.isPlannedOrOngoing || focal.isPlannedOrOngoing) {
      compatibilityCaution =
        'Includes planned/in-progress investigation without released PSI outcomes.';
    } else if (candidate.id === 'acme-efield' || focal.id === 'acme-efield') {
      compatibilityCaution =
        'E-FIELD applies electrostatic ion winds (0–10 kV), not thermal buoyancy or partial gravity.';
    }

    if (score > 0) {
      matches.push({
        investigation: candidate,
        sharedThemes,
        overlapScore: score,
        compatibilityCaution,
      });
    }
  }

  return matches
    .sort((a, b) => b.overlapScore - a.overlapScore)
    .slice(0, limit);
}

export function analyzeCrossInvestigations(
  selected: InvestigationRecord[]
): CrossInvestigationAnalysis {
  if (selected.length < 2) {
    return {
      sharedPlatforms: [],
      sharedFuelsOrTopics: [],
      sharedVariables: [],
      sharedSensors: [],
      compatibilityWarnings: [],
      divergencesDetected: [],
      missingInformationGaps: [],
    };
  }

  const platformCounts = new Map<string, number>();
  const variableCounts = new Map<string, number>();
  const sensorCounts = new Map<string, number>();

  const hasMicrogravity = selected.some((r) => r.isMicrogravity);
  const hasTerrestrial = selected.some((r) => !r.isMicrogravity);
  const hasPlanned = selected.some((r) => r.isPlannedOrOngoing);
  const hasEfield = selected.some((r) => r.id === 'acme-efield');
  const hasSaffire = selected.some((r) => r.id === 'saffire');
  const hasSmallCoupon = selected.some(
    (r) =>
      r.platform.includes('MSG') ||
      r.platform.includes('CIR') ||
      r.platform.includes('MDCA')
  );

  const compatibilityWarnings: string[] = [];
  if (hasMicrogravity && hasTerrestrial) {
    compatibilityWarnings.push(
      'Incompatible gravity regimes: Selected set mixes microgravity spaceflight studies (0g) with ground-based 1g terrestrial battery testing. Never compare numerical metrics directly without gravity-scaling analysis.'
    );
  }
  if (hasPlanned) {
    compatibilityWarnings.push(
      'Evidence-maturity asymmetry: Planned/in-progress studies (SoFIE or unlaunched ACME campaigns) document objectives only and must not be weighed equally against completed flight findings.'
    );
  }
  if (hasEfield) {
    compatibilityWarnings.push(
      'Control-force caveat: ACME E-FIELD Flames imposes high-voltage electrostatic ion winds (0–10 kV) rather than partial-gravity body forces.'
    );
  }
  if (hasSaffire && hasSmallCoupon) {
    compatibilityWarnings.push(
      'Scale asymmetry: SAFFIRE burns large samples inside an uncrewed Cygnus cargo module, whereas MSG/CIR/MDCA studies test bench-scale specimens inside spacecraft racks.'
    );
  }

  for (const rec of selected) {
    platformCounts.set(rec.platform, (platformCounts.get(rec.platform) ?? 0) + 1);
    const params = extractEnvironmentalParams(rec);
    if (params.oxygenConcentration) {
      variableCounts.set(
        'Oxygen Concentration',
        (variableCounts.get('Oxygen Concentration') ?? 0) + 1
      );
    }
    if (params.pressure) {
      variableCounts.set('Pressure', (variableCounts.get('Pressure') ?? 0) + 1);
    }
    if (params.temperature) {
      variableCounts.set(
        'Temperature / Heat Flux',
        (variableCounts.get('Temperature / Heat Flux') ?? 0) + 1
      );
    }
    if (params.airflow) {
      variableCounts.set(
        'Airflow / Ventilation',
        (variableCounts.get('Airflow / Ventilation') ?? 0) + 1
      );
    }
    for (const s of rec.sensors ?? []) {
      const norm = s.split('(')[0].trim();
      sensorCounts.set(norm, (sensorCounts.get(norm) ?? 0) + 1);
    }
  }

  const sharedPlatforms = Array.from(platformCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([p, count]) => `${p} (${count} studies)`);

  const sharedVariables = Array.from(variableCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([v, count]) => `${v} documented in ${count}/${selected.length} studies`);

  const sharedSensors = Array.from(sensorCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([s, count]) => `${s} (${count} studies)`);

  // Detect genuine documented divergences ONLY where both studies report affirmative contrasting evidence (never treat missing data as contradiction!)
  const divergencesDetected: string[] = [];
  if (
    selected.some((r) => r.id === 'same') &&
    selected.some((r) => r.id === 'daft')
  ) {
    divergencesDetected.push(
      'Aerosol baseline divergence: SAME / DAFT note ISS background aerosols appear larger on average than Space Shuttle particulates (attributed to filtration differences) rather than uniform across spacecraft cabins.'
    );
  }
  if (
    selected.some((r) => r.id === 'acme-planned') ||
    selected.filter((r) => r.family.includes('ACME')).length >= 2
  ) {
    divergencesDetected.push(
      'Source count discrepancy: Historical ACME references vary between 5 and 6 named component experiments across different NASA program summaries.'
    );
  }
  if (
    selected.some((r) => r.id === 'flex-cfi-g') &&
    selected.some((r) => r.id === 'bass-ii')
  ) {
    divergencesDetected.push(
      'Distinct flame extinction regimes: BASS-II reports sustained dim blue solid-fuel flames below 1 cm/s airflow, whereas CFI-G / FLEX documents sustained low-temperature cool gaseous/droplet diffusion flames (~600–1000 K) producing CO and CH2O.'
    );
  }

  // Missing-information detection (explicitly framed as missing coverage, never contradiction)
  const missingInformationGaps: string[] = [];
  for (const rec of selected) {
    const params = extractEnvironmentalParams(rec);
    const missingParams: string[] = [];
    if (!params.oxygenConcentration) missingParams.push('O2%');
    if (!params.pressure) missingParams.push('Pressure');
    if (!params.temperature) missingParams.push('Temperature/Heat Flux');
    if (!params.airflow) missingParams.push('Airflow');
    if (missingParams.length > 0) {
      missingInformationGaps.push(
        `${rec.shortName}: Reviewed dossier does not specify ${missingParams.join(', ')} (treated as missing source info, not a contradiction).`
      );
    }
    if (!rec.hasRawNumericalDataset) {
      missingInformationGaps.push(
        `${rec.shortName}: No local raw CSV/telemetry bundled (${rec.dataAvailabilityLabel}).`
      );
    }
  }

  const sharedTopics = computeCategoryBreakdown(selected)
    .filter((c) => c.count > 1)
    .map((c) => `${c.label} (${c.count} studies)`);

  return {
    sharedPlatforms,
    sharedFuelsOrTopics: sharedTopics,
    sharedVariables,
    sharedSensors,
    compatibilityWarnings,
    divergencesDetected,
    missingInformationGaps,
  };
}
