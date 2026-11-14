import test from 'node:test';
import assert from 'node:assert/strict';
import { INVESTIGATIONS } from '../data/researchCatalog';
import {
  extractEnvironmentalParams,
  validateResearchDatabase,
} from './databaseValidator';

test('validateResearchDatabase confirms zero duplicates and valid provenance across all 16 records', () => {
  const audit = validateResearchDatabase(INVESTIGATIONS);

  assert.equal(audit.totalRecords, 16);
  assert.equal(audit.validRecords, 16);
  assert.deepEqual(audit.duplicateIds, []);
  assert.deepEqual(audit.duplicateSlugs, []);
  assert.deepEqual(audit.recordsWithIssues, []);
  assert.equal(audit.allPassedIntegrityChecks, true);
  assert.ok(audit.averageCompletenessPct >= 65);
});

test('validateResearchDatabase detects duplicate IDs when injected', () => {
  const duplicateSet = [INVESTIGATIONS[0], INVESTIGATIONS[0]];
  const audit = validateResearchDatabase(duplicateSet);

  assert.equal(audit.duplicateIds.length, 1);
  assert.equal(audit.duplicateIds[0], INVESTIGATIONS[0].id);
  assert.equal(audit.allPassedIntegrityChecks, false);
});

test('extractEnvironmentalParams preserves absent parameters as null without fabrication', () => {
  const bass = INVESTIGATIONS.find((r) => r.id === 'bass-ii')!;
  const bassParams = extractEnvironmentalParams(bass);
  assert.equal(bassParams.acronym, 'BASS / BASS-II');
  assert.ok(bassParams.oxygenConcentration?.toLowerCase().includes('oxygen'));
  assert.ok(bassParams.airflow?.toLowerCase().includes('airflow'));
  assert.equal(bassParams.pressure, null);

  const daft = INVESTIGATIONS.find((r) => r.id === 'daft')!;
  const daftParams = extractEnvironmentalParams(daft);
  assert.equal(daftParams.oxygenConcentration, null);
  assert.equal(daftParams.pressure, null);
  assert.equal(daftParams.temperature, null);
  assert.equal(daftParams.airflow, null);

  const review = INVESTIGATIONS.find(
    (r) => r.id === 'dossier-literature-review'
  )!;
  const reviewParams = extractEnvironmentalParams(review);
  assert.equal(reviewParams.oxygenConcentration, null);
  assert.equal(reviewParams.temperature, null);
});
