import type { InvestigationRecord } from '../types/research.ts';
import { extractEnvironmentalParams } from './databaseValidator.ts';
import type { ScientificEvidenceItem } from './evidenceIntelligence.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';

export type ConflictConfirmationLevel =
  | 'Confirmed experimental difference'
  | 'Suspected discrepancy (condition-explained)'
  | 'Incomplete / unclear source attribution';

export interface ScientificConflictRecord {
  id: string;
  topic: string;
  category:
    | 'Different Reported Values'
    | 'Experimental Condition Difference'
    | 'Measurement Method Divergence'
    | 'Incomplete Experimental Parameters'
    | 'Unclear Source Attribution'
    | 'Non-Comparable Domains';
  investigationA: string;
  investigationB: string;
  sourceA: string;
  sourceB: string;
  valuesOrStatementsA: string;
  valuesOrStatementsB: string;
  experimentalConditionDifferences: string;
  whyApparentConflictExists: string;
  confirmationLevel: ConflictConfirmationLevel;
}

export function detectScientificConflicts(input: {
  investigations: InvestigationRecord[];
  evidenceCatalog?: ScientificEvidenceItem[];
  ingestedDatasets?: IngestedDatasetPackage[];
}): ScientificConflictRecord[] {
  const conflicts: ScientificConflictRecord[] = [];
  const byId = new Map(input.investigations.map((r) => [r.id, r]));

  const bass = byId.get('bass-ii');
  const saffire = byId.get('saffire');
  const flex = byId.get('flex-cfi-g');
  const efield = byId.get('acme-efield');
  const battery = byId.get('battery-fire-ul');
  const same = byId.get('same');
  const sofieMist = byId.get('sofie-mist');
  const acmeOther = byId.get('acme-other');

  // 1. 0g vs 1g thermal & soot baseline discrepancy
  if (bass && battery) {
    conflicts.push({
      id: 'conflict-0g-vs-1g-soot-temp',
      topic: 'Microgravity vs. Terrestrial 1g Fire Behavior & Thermal Maxima',
      category: 'Non-Comparable Domains',
      investigationA: bass.shortName,
      investigationB: battery.shortName,
      sourceA: bass.sourceLabel,
      sourceB: battery.sourceLabel,
      valuesOrStatementsA:
        'BASS-II (0g): < 100 W heat release rates, dim blue flames persisting below 1 cm/s airflow, increased soot.',
      valuesOrStatementsB:
        'UL 9540A (1g terrestrial): 661 °C (LFP cell) to 1459 °C (NMC module) peak thermal runaway temperatures.',
      experimentalConditionDifferences:
        'Spaceflight 0g solid-polymer/cotton airflow tests vs. 1g terrestrial Li-ion battery thermal runaway.',
      whyApparentConflictExists:
        'These values measure unrelated phenomena across incompatible gravity (0g vs 1g) and fuel systems. They are not contradictory observations of the same experiment.',
      confirmationLevel: 'Confirmed experimental difference',
    });
  }

  // 2. Vehicle-scale vs bench-scale enclosure flame spread
  if (bass && saffire) {
    conflicts.push({
      id: 'conflict-scale-bass-saffire',
      topic: 'Flame Spread & Extinction Across Bench Scale vs. Vehicle Scale',
      category: 'Experimental Condition Difference',
      investigationA: bass.shortName,
      investigationB: saffire.shortName,
      sourceA: bass.sourceLabel,
      sourceB: saffire.sourceLabel,
      valuesOrStatementsA:
        'BASS-II (ISS MSG): Small cotton/PMMA samples show sensitive extinction boundaries in 0–5 cm/s flow.',
      valuesOrStatementsB:
        'SAFFIRE (Cygnus): Large cotton-fiberglass and Nomex textiles in vehicle-scale ducting experienced radiative and convective scale differences.',
      experimentalConditionDifferences:
        'Bench-scale Microgravity Science Glovebox duct vs. full Cygnus cargo bay volume, oxygen inventory, and radiant wall enclosure.',
      whyApparentConflictExists:
        'Bench-scale extinction limits cannot be linearly extrapolated to spacecraft cabin fire growth without radiative heat-loss and oxygen-depletion scaling.',
      confirmationLevel: 'Suspected discrepancy (condition-explained)',
    });
  }

  // 3. Hot radiative flames vs low-temperature cool diffusion flames
  if (flex && same) {
    conflicts.push({
      id: 'conflict-cool-vs-sooting-regime',
      topic: 'Low-Temperature Cool Flames (CH2O) vs. High-Soot Smoke Regimes',
      category: 'Different Reported Values',
      investigationA: flex.shortName,
      investigationB: same.shortName,
      sourceA: flex.sourceLabel,
      sourceB: same.sourceLabel,
      valuesOrStatementsA:
        'FLEX / CFI-G: Sustained low-temperature cool diffusion flames operating around ~600–1000 K after visible flame extinction.',
      valuesOrStatementsB:
        'SAME / SAME-R: 5–8× higher soot yields and >70 smoke points in pyrolyzing/sooting microgravity flames.',
      experimentalConditionDifferences:
        'Liquid heptane/alkane droplets and porous burners (low-T kinetics) vs. silicone/lamp/Kapton/Teflon smoke-point characterization.',
      whyApparentConflictExists:
        'Different fuel chemistries and chemical-kinetic regimes produce either soot-free cool flames (~600–1000 K) or high-soot aerosol plumes.',
      confirmationLevel: 'Suspected discrepancy (condition-explained)',
    });
  }

  // 4. Electrostatic Ion Wind vs Partial Gravity Misinterpretation
  if (efield) {
    conflicts.push({
      id: 'conflict-efield-vs-partial-g',
      topic: 'ACME E-FIELD Ion Winds vs. Partial-Gravity Buoyancy',
      category: 'Measurement Method Divergence',
      investigationA: efield.shortName,
      investigationB: 'Planned / Literature Partial-Gravity Reviews',
      sourceA: efield.sourceLabel,
      sourceB: 'FLAREX Curated Dossier Caveat',
      valuesOrStatementsA:
        'Applied 0–10 kV electric fields alter laminar diffusion flame shape and soot via electrostatic ion winds in 0g.',
      valuesOrStatementsB:
        'No orbital or lunar surface combustion dataset in the reviewed archive isolates 0.16g or 0.38g buoyancy directly.',
      experimentalConditionDifferences:
        'Electrostatic body force on charged ions inside ISS CIR vs. gravitational hydrostatic body force on bulk gas density.',
      whyApparentConflictExists:
        'Treating E-FIELD voltage adjustments as an exact surrogate for lunar/Martian gravity conflates electrostatic ion forcing with bulk buoyancy.',
      confirmationLevel: 'Confirmed experimental difference',
    });
  }

  // 5. Unclear source attribution / historical ambiguity in ACME suite
  if (acmeOther) {
    conflicts.push({
      id: 'conflict-acme-suite-count',
      topic: 'ACME Experiment Suite Count & Ongoing PSI Data Release',
      category: 'Unclear Source Attribution',
      investigationA: acmeOther.shortName,
      investigationB: efield?.shortName ?? 'ACME Suite',
      sourceA: acmeOther.sourceLabel,
      sourceB: efield?.sourceLabel ?? 'NASA ACME Overview',
      valuesOrStatementsA:
        'NASA sources conflict on whether the ACME suite contains five or six experiments (BRE, Burning Rate Emulator; Electric-Field Effects; Coflow Laminar Diffusion; Flame Design; s-Flame; and Cool Flame Investigation).',
      valuesOrStatementsB:
        'Only select ACME subsets currently expose post-flight PSI packages; other experiment parameters remain in progress.',
      experimentalConditionDifferences:
        'Programmatic metadata differences across ISS increments and NASA web fact sheets.',
      whyApparentConflictExists:
        'Source documentation ambiguity and ongoing post-flight data curation create inconsistent suite counts across NASA reference pages.',
      confirmationLevel: 'Incomplete / unclear source attribution',
    });
  }

  // 6. Incomplete environmental parameters across planned vs completed studies
  if (sofieMist && bass) {
    const mistEnv = extractEnvironmentalParams(sofieMist);
    const bassEnv = extractEnvironmentalParams(bass);
    conflicts.push({
      id: 'conflict-incomplete-env-params',
      topic: 'Missing Chamber Pressure / Thermal Flux Boundaries Across Solid-Fuel Studies',
      category: 'Incomplete Experimental Parameters',
      investigationA: bass.shortName,
      investigationB: sofieMist.shortName,
      sourceA: bass.sourceLabel,
      sourceB: sofieMist.sourceLabel,
      valuesOrStatementsA: `BASS-II documented airflow (${bassEnv.airflow ?? '0–5 cm/s'}), but reviewed NTRS summary omits exact pressure (${bassEnv.pressure ?? 'missing'}) and radiant heat flux.`,
      valuesOrStatementsB: `SoFIE-MIST plans PMMA cylinder tests across varying O2, airflow, pressure, and external radiant heat flux (${mistEnv.pressure ?? 'bounds TBD'}).`,
      experimentalConditionDifferences:
        'Completed NTRS presentation summary vs. planned 2021–2027 SoFIE test matrix pending public flight telemetry.',
      whyApparentConflictExists:
        'Apparent parameter gaps arise from presentation-level summarization and pending flight release rather than experimental contradiction.',
      confirmationLevel: 'Incomplete / unclear source attribution',
    });
  }

  // 7. Imported dataset missing/corrupted values warning if session datasets present
  for (const ds of input.ingestedDatasets ?? []) {
    if (ds.summary.totalMissingCells > 0 || ds.summary.totalInvalidNumericCells > 0) {
      conflicts.push({
        id: `conflict-dataset-${ds.provenance.datasetId}`,
        topic: `Data Quality Uncertainty in "${ds.provenance.originalFilename}"`,
        category: 'Incomplete Experimental Parameters',
        investigationA: ds.provenance.originalFilename,
        investigationB: ds.provenance.repository,
        sourceA: ds.provenance.sourceUrl,
        sourceB: 'FLAREX Tabular Ingestion Audit',
        valuesOrStatementsA: `${ds.summary.totalMissingCells} missing cell(s) (${ds.summary.missingPctOverall}%) and ${ds.summary.totalInvalidNumericCells} invalid numeric string(s).`,
        valuesOrStatementsB: 'Normalized view maps missing/invalid tokens strictly to null (no zero substitution).',
        experimentalConditionDifferences: `Format: ${ds.provenance.format} · Duplicate rows: ${ds.summary.duplicateRowCount}`,
        whyApparentConflictExists:
          'Corrupted or missing sensor readings reduce effective sample size (n) and widen uncertainty if omitted without disclosure.',
        confirmationLevel: 'Confirmed experimental difference',
      });
    }
  }

  // 8. Flag any unverified AI interpretation notes present in evidence catalog
  const aiItems = (input.evidenceCatalog ?? []).filter(
    (e) => e.category === 'AI_INTERPRETATION'
  );
  if (aiItems.length > 0) {
    conflicts.push({
      id: 'conflict-ai-unverified-interpretations',
      topic: 'AI-Generated Synthesis Requires Primary Source Verification',
      category: 'Unclear Source Attribution',
      investigationA: 'AI Assistant Output',
      investigationB: 'Primary NASA Dossier',
      sourceA: `${aiItems.length} session AI interpretation item(s)`,
      sourceB: 'FLAREX Primary Records',
      valuesOrStatementsA: aiItems[0].valueOrText.slice(0, 180),
      valuesOrStatementsB: 'Primary records only substantiate cited values and explicitly documented bounds.',
      experimentalConditionDifferences: 'Probabilistic text generation vs. archived NASA measurements.',
      whyApparentConflictExists:
        'LLM syntheses may interpolate qualitative explanations; they remain unverified until matched to primary citations.',
      confirmationLevel: 'Incomplete / unclear source attribution',
    });
  }

  return conflicts;
}
