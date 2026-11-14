import test from 'node:test';
import assert from 'node:assert/strict';
import { INVESTIGATIONS } from '../data/researchCatalog';
import {
  buildComparisonRows,
  buildReferenceLibrary,
  computeCategoryBreakdown,
  computeResearchStats,
  filterInvestigations,
  filterReferences,
  globalSearchInvestigations,
  NOT_SPECIFIED,
  retrieveRelevantInvestigations,
} from './researchLogic';

test('computeResearchStats accurately counts actual dossier records without fabricating raw datasets', () => {
  const stats = computeResearchStats(INVESTIGATIONS);

  assert.equal(stats.totalRecords, 16);
  assert.equal(stats.nasaInvestigations, 14);
  assert.equal(stats.reviewPapers, 1);
  assert.equal(stats.complementaryTerrestrial, 1);
  assert.equal(stats.withRawNumericalDataset, 0);
  assert.equal(stats.withoutRawNumericalData, 16);
  assert.ok(stats.withQuantitativeSummary >= 5);
  assert.equal(
    stats.nasaInvestigations +
      stats.reviewPapers +
      stats.complementaryTerrestrial,
    stats.totalRecords
  );
});

test('computeCategoryBreakdown calculates true record counts across all 7 research categories', () => {
  const categories = computeCategoryBreakdown(INVESTIGATIONS);
  assert.equal(categories.length, 7);

  for (const cat of categories) {
    assert.ok(cat.count > 0, `Category ${cat.label} should have matching records`);
    assert.equal(cat.count, cat.recordIds.length);
  }

  const batteryCat = categories.find((c) => c.id === 'battery-fire');
  assert.ok(batteryCat?.recordIds.includes('battery-fire-ul'));

  const smokeCat = categories.find((c) => c.id === 'smoke-aerosol');
  assert.ok(smokeCat?.recordIds.includes('same'));
  assert.ok(smokeCat?.recordIds.includes('daft'));
});

test('filterInvestigations filters by search query, family, evidence type, fuel type, category, and sorts deterministically', () => {
  const byQuery = filterInvestigations(INVESTIGATIONS, {
    query: '13000263',
    family: 'ALL',
    evidenceType: 'ALL',
    platform: 'ALL',
    fuelType: 'ALL',
    category: 'ALL',
    dataAvailability: 'ALL',
    sortBy: 'name-asc',
  });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].id, 'bass-ii');

  const byFuel = filterInvestigations(INVESTIGATIONS, {
    query: '',
    family: 'ALL',
    evidenceType: 'ALL',
    platform: 'ALL',
    fuelType: 'Lithium-Ion Cells (LFP / NMC)',
    category: 'ALL',
    dataAvailability: 'ALL',
    sortBy: 'name-asc',
  });
  assert.equal(byFuel.length, 1);
  assert.equal(byFuel[0].id, 'battery-fire-ul');

  const byCategory = filterInvestigations(INVESTIGATIONS, {
    query: '',
    family: 'ALL',
    evidenceType: 'ALL',
    platform: 'ALL',
    fuelType: 'ALL',
    category: 'liquid-droplet',
    dataAvailability: 'ALL',
    sortBy: 'name-asc',
  });
  assert.equal(byCategory.length, 2);

  const terrestrialOnly = filterInvestigations(INVESTIGATIONS, {
    query: '',
    family: 'ALL',
    evidenceType: 'COMPLEMENTARY TERRESTRIAL RESEARCH',
    platform: 'ALL',
    dataAvailability: 'ALL',
    sortBy: 'name-asc',
  });
  assert.equal(terrestrialOnly.length, 1);
  assert.equal(terrestrialOnly[0].id, 'battery-fire-ul');
  assert.equal(terrestrialOnly[0].isMicrogravity, false);
});

test('globalSearchInvestigations ranks relevant investigations across names, fuels, and descriptions', () => {
  const pmmaHits = globalSearchInvestigations('PMMA', INVESTIGATIONS, 5);
  assert.ok(pmmaHits.length >= 2);
  assert.ok(pmmaHits.some((h) => h.record.id === 'sofie-mist'));

  const idHits = globalSearchInvestigations('13000367', INVESTIGATIONS, 5);
  assert.equal(idHits[0].record.id, 'saffire');
});

test('buildReferenceLibrary and filterReferences classify NASA, Paper, Presentation, Review, and Complementary sources', () => {
  const refs = buildReferenceLibrary(INVESTIGATIONS);
  assert.ok(refs.length >= 16);

  const nasaRefs = filterReferences(refs, 'NASA');
  assert.ok(nasaRefs.length >= 14);

  const paperRefs = filterReferences(refs, 'PAPER');
  assert.ok(paperRefs.some((r) => r.doi === '10.1016/j.firesaf.2026.104719'));

  const reviewRefs = filterReferences(refs, 'REVIEW');
  assert.ok(reviewRefs.length >= 1);

  const complementaryRefs = filterReferences(refs, 'COMPLEMENTARY');
  assert.ok(complementaryRefs.some((r) => r.investigationId === 'battery-fire-ul'));
});

test('retrieveRelevantInvestigations returns bounded relevant context rather than full DB', () => {
  const batteryHits = retrieveRelevantInvestigations(
    'Are there microgravity battery fire datasets from UL?',
    INVESTIGATIONS,
    3
  );
  assert.ok(batteryHits.length <= 3);
  assert.equal(batteryHits[0].id, 'battery-fire-ul');

  const efieldHits = retrieveRelevantInvestigations(
    'Does E-FIELD Flames test partial gravity?',
    INVESTIGATIONS,
    3
  );
  assert.ok(efieldHits.some((r) => r.id === 'acme-efield'));
});

test('filterInvestigations sorts by startYear descending cleanly', () => {
  const sortedNewest = filterInvestigations(INVESTIGATIONS, {
    query: '',
    family: 'ALL',
    evidenceType: 'ALL',
    platform: 'ALL',
    dataAvailability: 'ALL',
    sortBy: 'year-desc',
  });
  assert.ok((sortedNewest[0].startYear ?? 0) >= 2021);
});

test('buildComparisonRows preserves missing fields as explicit unavailable notices rather than 0', () => {
  const selected = INVESTIGATIONS.filter((r) =>
    ['bass-ii', 'acme-efield', 'battery-fire-ul'].includes(r.id)
  );
  const rows = buildComparisonRows(selected);

  assert.equal(rows.length, 18);
  assert.ok(rows.some((r) => r.fieldKey === 'oxygenConcentration'));
  assert.ok(rows.some((r) => r.fieldKey === 'pressure'));
  assert.ok(rows.some((r) => r.fieldKey === 'airflow'));
  assert.ok(rows.some((r) => r.fieldKey === 'sourceReference'));

  const materialsRow = rows.find((r) => r.fieldKey === 'materialsAndGeometry');
  assert.ok(materialsRow);
  for (const cell of materialsRow.values) {
    assert.notEqual(cell.display, '0');
    if (cell.isMissing) {
      assert.equal(cell.display, NOT_SPECIFIED);
    }
  }
  const platformRow = rows.find((r) => r.fieldKey === 'platform');
  assert.ok(platformRow);
  const batteryCell = platformRow.values.find(
    (v) => v.investigationId === 'battery-fire-ul'
  );
  assert.ok(batteryCell?.cautionNote?.includes('NOT microgravity'));
});
