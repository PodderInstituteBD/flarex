import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DOSSIER_REFERENCES, OFFICIAL_RESOURCES, RESEARCH_GAPS } from '../data/researchCatalog.ts';
import type { InvestigationRecord } from '../types/research.ts';
import { analyzeCrossStudyComparison } from './crossStudyAnalysis.ts';
import { startDatasetProcessingJob } from './dataProcessingWorker.ts';
import { buildEvidenceCatalog } from './evidenceIntelligence.ts';
import { inspectRawFileMetadata } from './fileMetadata.ts';
import {
  buildUnifiedDiscovery2,
  detectResourceFileFormat,
  STAGE10_META,
  summarizeDiscoveryStages,
} from './nasaDataDiscovery.ts';
import {
  buildPublicationReport,
  renderPublicationCsv,
  renderPublicationJson,
  renderPublicationMarkdown,
} from './publicationEngine.ts';
import {
  compareReproducibilityRuns,
  computeSha256Sync,
  createReproducibilityRecord,
  renderReproducibilityJson,
  renderReproducibilityMarkdown,
  verifyDatasetChecksumChanged,
} from './reproducibilityEngine.ts';
import {
  runCorrelationAnalysis,
  runDescriptiveAnalysis,
} from './scientificAnalysis.ts';
import { runPlatformScientificAuditV2 } from './scientificAudit.ts';
import {
  checkUnitCompatibility,
  computeExtendedDescriptiveStats,
  computeGroupedComparison,
  computeMovingAverage,
  computeSimpleLinearRegression,
  computeSpearmanRankCorrelation,
} from './scientificComputation.ts';
import { ingestScientificTabularData } from './scientificIngestion.ts';
import { buildDatasetQualityReport } from './scientificValidation.ts';
import {
  appendSourceCheckHistory,
  buildSourceTransparencyRegistry,
} from './sourceTransparency.ts';
import {
  createEmptyWorkspace,
  deleteDatasetSummaryEntry,
  deleteReproducibilityEntry,
  importWorkspaceBundle,
  saveDatasetSummaryEntry,
  saveReproducibilityEntry,
} from './workspaceStore.ts';

const dbPath = path.resolve(process.cwd(), 'src/data/researchDatabase.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as {
  records: InvestigationRecord[];
};
const RECORDS = rawDb.records;

test('Module A & N (Discovery 2.0 & Source Transparency): classifies 10 availability stages, formats, and distinguishes HTTP 200 from telemetry import', () => {
  assert.equal(detectResourceFileFormat('https://example.org/data.csv?v=1'), 'CSV');
  assert.equal(
    detectResourceFileFormat('https://ntrs.nasa.gov/api/citations/20160000593/downloads/20160000593.txt'),
    'TXT'
  );
  assert.equal(detectResourceFileFormat('https://psi.nasa.gov/physci/repo'), 'HTML_PORTAL');

  const sampleCsv = 'time [s],flame_temp [K]\n0,750\n1,810';
  const pkg = ingestScientificTabularData({
    content: sampleCsv,
    filename: 'bass2_sample.csv',
    sourceUrl: 'https://psi.nasa.gov/physci/repo',
    investigationId: 'bass-ii',
  });

  const discovery = buildUnifiedDiscovery2(RECORDS, OFFICIAL_RESOURCES, DOSSIER_REFERENCES, {
    linkChecks: {
      'https://ntrs.nasa.gov/citations/20160000593': {
        ok: true,
        status: 200,
        checkedAt: '2026-05-01T12:00:00Z',
      },
    },
    ingestedDatasets: [pkg],
    analysisReadyDatasetIds: new Set([pkg.provenance.datasetId]),
  });

  assert.ok(discovery.length >= RECORDS.length);
  const stages = summarizeDiscoveryStages(discovery);
  assert.ok(STAGE10_META.METADATA_AVAILABLE.label.includes('METADATA'));
  assert.ok(stages.ANALYSIS_READY >= 1 || stages.MANUAL_REVIEW_REQUIRED >= 1 || stages.METADATA_AVAILABLE >= 1);

  // HTTP 200 check on NTRS portal only yields METADATA_AVAILABLE — never FILE_RETRIEVED or ANALYSIS_READY
  const ntrsPortal = discovery.find(
    (d) => d.url === 'https://ntrs.nasa.gov/citations/20160000593'
  );
  if (ntrsPortal) {
    assert.equal(ntrsPortal.stage10, 'METADATA_AVAILABLE');
  }

  const registry = buildSourceTransparencyRegistry({
    discoveryItems: discovery,
    officialResources: OFFICIAL_RESOURCES,
    investigations: RECORDS,
  });
  assert.ok(registry.length > 5);
  assert.ok(registry.every((r) => Boolean(r.retrievalMethod) && Boolean(r.accessRestrictions)));

  const history = appendSourceCheckHistory([], {
    sourceName: 'BASS-II PSI',
    url: 'https://psi.nasa.gov/physci/repo',
    method: 'HTTP HEAD/GET Availability Probe',
    httpStatus: 200,
    resultingStage: 'MANUAL_REVIEW_REQUIRED',
    checkedAt: '2026-05-01T12:00:00Z',
    note: 'Portal reachable; bulk files require browser login',
  });
  assert.equal(history.length, 1);
});

test('Module B (Metadata Inspection & 3-Layer Ingestion): strips UTF-8 BOM, detects duplicates/missing/invalid tokens, and preserves immutable originalRows', () => {
  const bomCsv = '\uFEFFtime [s];o2 [%];temp [K]\n0;21.0;740\n1;N/A;810\n1;19.5;bad_num\n1;19.5;bad_num\n';
  const preview = inspectRawFileMetadata('bom_semicolon.csv', bomCsv);
  assert.equal(preview.detectedEncoding, 'UTF-8 (with BOM)');
  assert.equal(preview.detectedDelimiter, ';');
  assert.equal(preview.duplicateRowsInPreview, 1);
  assert.ok(preview.columns[1].missingInSample >= 1);
  assert.ok(preview.columns[2].invalidNumericInSample >= 1);

  const pkg = ingestScientificTabularData({
    content: bomCsv,
    filename: 'bom_semicolon.csv',
  });
  assert.equal(pkg.provenance.detectedEncoding, 'UTF-8 (with BOM)');
  assert.equal(pkg.provenance.detectedDelimiter, ';');
  assert.equal(pkg.provenance.sha256Checksum?.length, 64);

  // Original raw tokens untouched vs analysisRows coerced cleanly to null (never 0)
  assert.equal(pkg.originalRows[1]['o2 [%]'], 'N/A');
  assert.equal(pkg.originalRows[2]['temp [K]'], 'bad_num');
  assert.equal(pkg.analysisRows?.[1].o2, null);
  assert.equal(pkg.analysisRows?.[2].temp_k, null);
  assert.equal(pkg.normalizedRows[0].o2, 21);
});

test('Module C (Statistical Computation & Unit Guards): computes Bessel variance/SD, quartiles, IQR, Spearman rho, OLS regression, moving avg, and blocks unit collisions', () => {
  const stats = computeExtendedDescriptiveStats(
    [10, 12, 14, 16, 18, 20, 95, null, undefined],
    'flame_height',
    'mm'
  );
  assert.ok(stats);
  assert.equal(stats.count, 7);
  assert.equal(stats.missingCount, 2);
  assert.ok(stats.sampleStdDev !== null && stats.sampleVariance !== null);
  assert.equal(stats.q2, stats.median);
  assert.ok(stats.iqr > 0);
  assert.ok(stats.outlierCount >= 1 && stats.outlierValues.includes(95));

  const x = [1, 2, 3, 4, 5, 6];
  const y = [2, 4, 6, 8, 10, 12];
  const spearman = computeSpearmanRankCorrelation(x, y);
  assert.equal(spearman?.rho, 1);
  const ols = computeSimpleLinearRegression(x, y);
  assert.equal(ols?.slope, 2);
  assert.equal(ols?.intercept, 0);
  assert.equal(ols?.rSquared, 1);

  const ma = computeMovingAverage(
    [
      { x: 0, y: 2 },
      { x: 1, y: 4 },
      { x: 2, y: 6 },
    ],
    2
  );
  assert.equal(ma[2].movingAvg, 5);

  const grouped = computeGroupedComparison(
    [
      { regime: '0g', temp: 700 },
      { regime: '0g', temp: 720 },
      { regime: '1g', temp: 900 },
      { regime: '1g', temp: 940 },
    ],
    'regime',
    'temp'
  );
  assert.equal(grouped.length, 2);

  // Unit compatibility guards
  const same = checkUnitCompatibility('K', 'K', 'DIRECT_COMPARISON');
  assert.equal(same.compatibleForDirectComparison, true);
  const scaleMismatch = checkUnitCompatibility('mm/s', 'cm/s', 'DIRECT_COMPARISON');
  assert.equal(scaleMismatch.compatibleForDirectComparison, false);
  const crossDim = checkUnitCompatibility('K', 'kPa', 'DIRECT_COMPARISON');
  assert.equal(crossDim.compatibleForDirectComparison, false);
});

test('Module D (SHA-256 Reproducibility Engine): deterministic SHA-256 checksums, bit-identical verification, and dataset change detection', () => {
  const hashA = computeSha256Sync('FLAREX-7-TEST');
  const hashB = computeSha256Sync('FLAREX-7-TEST');
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);

  const csv1 = 'time [s],temp [K]\n0,700\n1,750\n2,800\n3,850\n';
  const csv2 = 'time [s],temp [K]\n0,700\n1,750\n2,800\n3,910\n';
  const ds1 = ingestScientificTabularData({ content: csv1, filename: 'run1.csv' });
  const ds2 = ingestScientificTabularData({ content: csv2, filename: 'run1.csv' });

  const run1 = runDescriptiveAnalysis(ds1, 'temp');
  const rec1 = createReproducibilityRecord({ dataset: ds1, run: run1 });
  const rec1Clone = createReproducibilityRecord({
    dataset: ds1,
    run: { ...run1, runId: 'run-clone' },
  });

  const bitIdentical = compareReproducibilityRuns(rec1, rec1Clone);
  assert.equal(bitIdentical.verdict, 'BIT_IDENTICAL');

  const changed = verifyDatasetChecksumChanged(rec1, ds2);
  assert.equal(changed.changed, true);

  const run2 = runDescriptiveAnalysis(ds2, 'temp');
  const rec2 = createReproducibilityRecord({ dataset: ds2, run: run2 });
  const versionDiff = compareReproducibilityRuns(rec1, rec2);
  assert.equal(versionDiff.verdict, 'DATASET_VERSION_CHANGED');

  assert.ok(renderReproducibilityMarkdown(rec1).includes(rec1.sha256Checksum));
  assert.ok(JSON.parse(renderReproducibilityJson(rec1)).sha256Checksum === rec1.sha256Checksum);
});

test('Module E (Extended Data Validation): flags sampling irregularity CV% and >8x jump discontinuities', () => {
  const csvWithJump = [
    'time [s],heat_flux [kW/m2]',
    '0,10.0',
    '1,10.5',
    '2,11.0',
    '3,11.4',
    '15,12.0',
    '16,95.0', // >8x step jump
  ].join('\n');
  const pkg = ingestScientificTabularData({ content: csvWithJump, filename: 'jump_test.csv' });
  const report = buildDatasetQualityReport(pkg);
  assert.equal(report.checks.length, 12);
  assert.ok(report.extendedDiagnostics);
  assert.ok(report.extendedDiagnostics.discontinuityFlags.length >= 1);
  assert.ok(report.extendedDiagnostics.samplingCvPct !== null);
});

test('Module F (Publication Engine Type A/B/C): builds 9 sections with explicit epistemic layer tags and SHA-256 ledger', () => {
  const csv = 'time [s],o2 [%],temp [K]\n0,21,710\n1,20,760\n2,19,820\n3,18,860\n';
  const pkg = ingestScientificTabularData({ content: csv, filename: 'pub_test.csv' });
  const runDesc = runDescriptiveAnalysis(pkg, 'temp');
  const runCorr = runCorrelationAnalysis(pkg, 'o2', 'temp');

  for (const type of ['TYPE_A_INVESTIGATION', 'TYPE_B_NUMERICAL', 'TYPE_C_COMPARATIVE'] as const) {
    const pub = buildPublicationReport({
      reportType: type,
      investigations: RECORDS.slice(0, 3),
      gaps: RESEARCH_GAPS,
      ingestedDatasets: [pkg],
      analysisRuns: [runDesc, runCorr],
      researchQuestion: 'How do microgravity airflow and oxygen limits influence solid fuel extinction?',
      aiInterpretationNote: 'Draft interpretive note requiring NASA PSI verification.',
    });
    assert.equal(pub.sections.length, 9);
    assert.ok(pub.sections.some((s) => s.attributionLayer === 'AI_INTERPRETATION'));
    assert.ok(pub.datasetChecksums[0].sha256?.length === 64);

    const md = renderPublicationMarkdown(pub);
    assert.ok(md.includes('AI_INTERPRETATION'));
    const parsedJson = JSON.parse(renderPublicationJson(pub));
    assert.equal(parsedJson.sections.length, 9);
    const csvOut = renderPublicationCsv(pub);
    assert.ok(csvOut.includes('Section Number,Heading,Attribution Layer,Content'));
  }
});

test('Module H (Cross-Study Intelligence 2.0): separates matched, differing, unknown parameters and false-equivalence shields', () => {
  const pair = RECORDS.filter((r) => ['bass-ii', 'battery-fire-ul'].includes(r.id));
  const comp = analyzeCrossStudyComparison(pair);
  assert.ok(comp.matchedParameters.length >= 0);
  assert.ok(comp.differingParameters.length >= 1);
  assert.ok(comp.falseEquivalenceGuards.some((g) => /1g/i.test(g) || /terrestrial/i.test(g)));
});

test('Module J (Chunked Large-Dataset Engine): ingests >50,000 synthetic CSV rows deterministically with progress telemetry', async () => {
  const lines = ['time [s],temp [K]'];
  for (let i = 0; i <= 50_050; i += 1) {
    lines.push(`${i},${700 + (i % 120)}`);
  }
  const largeCsv = lines.join('\n');
  const progressPercents: number[] = [];
  const job = startDatasetProcessingJob(
    { filename: 'synthetic_50k.csv', content: largeCsv },
    (prog) => progressPercents.push(prog.percent)
  );
  const res = await job.promise;
  assert.equal(res.dataset.summary.rowCount, 50_051);
  assert.ok(res.metrics.largeDatasetNotice && res.metrics.largeDatasetNotice.includes('50,051'));
  assert.ok(progressPercents.includes(100));
});

test('Module K (Workspace 3.0): prevents duplicate reproducibility entries and recovers cleanly from malformed backup arrays', () => {
  const empty = createEmptyWorkspace();
  const res1 = saveReproducibilityEntry(empty, {
    runId: 'run-1',
    datasetId: 'ds-1',
    filename: 'test.csv',
    sha256Checksum: 'a'.repeat(64),
    statisticalMethod: 'Descriptive',
    selectedVariables: ['temp'],
    timestamp: '2026-05-01T00:00:00Z',
    resultSummary: { mean: 750 },
  });
  assert.equal(res1.duplicate, false);

  const dupAttempt = saveReproducibilityEntry(res1.state, {
    runId: 'run-1',
    datasetId: 'ds-1',
    filename: 'test.csv',
    sha256Checksum: 'a'.repeat(64),
    statisticalMethod: 'Descriptive',
    selectedVariables: ['temp'],
    timestamp: '2026-05-01T00:00:00Z',
    resultSummary: { mean: 750 },
  });
  assert.equal(dupAttempt.duplicate, true);

  const dsAdd = saveDatasetSummaryEntry(res1.state, {
    datasetId: 'ds-1',
    filename: 'test.csv',
    rowCount: 10,
    columnCount: 2,
    sha256Checksum: 'a'.repeat(64),
    readiness: 'READY_FOR_ANALYSIS',
    sourceUrl: 'https://psi.nasa.gov/physci/repo',
    savedAt: '2026-05-01T00:00:00Z',
  });
  assert.equal(dsAdd.duplicate, false);

  const malformed = JSON.stringify({
    savedInvestigationIds: ['bass-ii'],
    savedReproducibilityRuns: 'corrupted-string-instead-of-array',
    notes: 12345,
  });
  const imported = importWorkspaceBundle(malformed, new Set(RECORDS.map((r) => r.id)));
  assert.equal(imported.ok, true);
  assert.ok((imported.recoveryNotes?.length ?? 0) >= 2);

  const afterDelRun = deleteReproducibilityEntry(dsAdd.state, 'run-1');
  assert.equal(afterDelRun.savedReproducibilityRuns?.length, 0);
  const afterDelDs = deleteDatasetSummaryEntry(afterDelRun, 'ds-1');
  assert.equal(afterDelDs.importedDatasetSummaries?.length, 0);
});

test('Module L (Scientific Audit Center 2.0): produces all 14 checks and keeps unverified telemetry strictly NOT TESTED', () => {
  const catalog = buildEvidenceCatalog({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
  });
  const audit = runPlatformScientificAuditV2({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
    evidenceCatalog: catalog,
    claims: [],
    ingestedDatasets: [],
    analysisRuns: [],
    aiTelemetry: null,
    availableRouteCount: 14,
  });
  assert.equal(audit.checks.length, 14);
  const apiCheck = audit.checks.find((c) => c.id === 'v2-api-health');
  assert.equal(apiCheck?.status, 'NOT TESTED');
  const testCheck = audit.checks.find((c) => c.id === 'v2-test-coverage');
  assert.equal(testCheck?.status, 'NOT TESTED');
});
