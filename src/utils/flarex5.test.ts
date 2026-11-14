import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RESEARCH_GAPS } from '../data/researchCatalog.ts';
import type { InvestigationRecord } from '../types/research.ts';
import { classifyAiErrorStatus, computeBackoffDelayMs } from './aiReliability.ts';
import { analyzeExperimentalConditions } from './experimentalConditions.ts';
import {
  buildRetrievedSourceRefs,
  normalizeQuery,
  runAdvancedRagRetrieval,
  validateCitations,
} from './ragPipeline.ts';
import {
  reproduceAnalysisRun,
  runCorrelationAnalysis,
  runDescriptiveAnalysis,
  runTimeSeriesSummaryAnalysis,
} from './scientificAnalysis.ts';
import { ingestScientificTabularData } from './scientificIngestion.ts';
import {
  buildScientificReportPackage,
  renderScientificReportCsv,
  renderScientificReportJson,
  renderScientificReportMarkdown,
} from './scientificReport.ts';
import { resolveResourceVerificationStatus } from './sourceVerification.ts';

const dbPath = path.resolve(process.cwd(), 'src/data/researchDatabase.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as {
  records: InvestigationRecord[];
};
const RECORDS = rawDb.records;

test('Module 2 Ingestion: CSV/TSV/JSON unit extraction, duplicate detection, and null-safe immutability', () => {
  const csv = [
    'time [s],o2_pct,flame_temp (K),velocity_cm_s',
    '0,21.0,700,1.2',
    '1,18.5,NA,1.5',
    '2,20.0,bad_val,2.0',
    '2,20.0,bad_val,2.0',
  ].join('\n');

  const pkg = ingestScientificTabularData({
    filename: 'sample_test.csv',
    content: csv,
    sourceUrl: 'https://ntrs.nasa.gov/citations/20160000593',
  });

  assert.equal(pkg.provenance.importStatus, 'IMPORTED_WITH_WARNINGS');
  assert.equal(pkg.summary.rowCount, 4);
  assert.equal(pkg.summary.duplicateRowCount, 1);
  assert.equal(pkg.columns[0].detectedUnit, 's');
  assert.equal(pkg.columns[1].detectedUnit, '%');
  assert.equal(pkg.columns[2].detectedUnit, 'K');
  assert.equal(pkg.columns[3].detectedUnit, 'cm/s');

  // originalRows preserved verbatim; normalizedRows maps NA and 'bad_val' strictly to null (never 0)
  assert.equal(pkg.originalRows[1]['flame_temp (K)'], 'NA');
  assert.equal(pkg.normalizedRows[1].flame_temp_k, null);
  assert.equal(pkg.originalRows[2]['flame_temp (K)'], 'bad_val');
  assert.equal(pkg.normalizedRows[2].flame_temp_k, null);

  // JSON format ingestion
  const jsonPkg = ingestScientificTabularData({
    filename: 'records.json',
    content: JSON.stringify([
      { trial: 1, pressure_atm: 1.0 },
      { trial: 2, pressure_atm: null },
    ]),
  });
  assert.equal(jsonPkg.provenance.format, 'JSON');
  assert.equal(jsonPkg.normalizedRows[1].pressure_atm, null);
});

test('Module 3 & 7 Stats & Reproducibility: descriptive, histogram, non-causal correlation, time-series & exact rerun', () => {
  const tsv = [
    'elapsed_s\tflux_kw\tspread_cm_s',
    '0\t10\t2.0',
    '2\t20\t4.0',
    '4\t30\t6.0',
    '6\tNA\t8.0',
    '8\t50\t10.0',
  ].join('\n');

  const ds = ingestScientificTabularData({
    filename: 'flame_run.tsv',
    content: tsv,
  });

  const desc = runDescriptiveAnalysis(ds, 'flux_kw');
  assert.ok(desc.descriptive);
  assert.equal(desc.descriptive.sampleCount, 4);
  assert.equal(desc.descriptive.missingCount, 1);
  assert.equal(desc.descriptive.mean, 27.5);
  assert.equal(desc.descriptive.median, 25);
  assert.equal(desc.descriptive.min, 10);
  assert.equal(desc.descriptive.max, 50);
  assert.ok(desc.histogram && desc.histogram.length >= 3);

  const corr = runCorrelationAnalysis(ds, 'flux_kw', 'spread_cm_s');
  assert.ok(corr.correlation);
  assert.equal(corr.correlation.pearsonR, 1);
  assert.ok(corr.correlation.interpretationNote.includes('Does NOT imply causation'));

  const ts = runTimeSeriesSummaryAnalysis(ds, 'elapsed_s', 'spread_cm_s');
  assert.ok(ts.timeSeriesSummary);
  assert.equal(ts.timeSeriesSummary.isMonotonicIncreasing, true);
  assert.equal(ts.timeSeriesSummary.netDelta, 8);

  const reproduced = reproduceAnalysisRun(desc, ds);
  assert.equal(reproduced.descriptive?.mean, desc.descriptive?.mean);
  assert.equal(reproduced.sampleCount, desc.sampleCount);
});

test('Module 5 AI Reliability: classifies timeout, quota, auth, abort & backoff delays accurately', () => {
  assert.equal(classifyAiErrorStatus(new Error('GEMINI_TIMEOUT')).httpStatus, 504);
  assert.equal(classifyAiErrorStatus(new Error('REQUEST_ABORTED')).httpStatus, 499);
  assert.equal(classifyAiErrorStatus({ status: 429 }).errorCode, 'QUOTA_EXHAUSTED');
  assert.equal(classifyAiErrorStatus({ status: 403 }).errorCode, 'API_KEY_INVALID');
  assert.equal(computeBackoffDelayMs(0, 600), 600);
  assert.equal(computeBackoffDelayMs(2, 600), 2400);
});

test('Module 6 Advanced RAG & Citation Validator: scores records, logs exclusions & detects unverified DOIs', () => {
  const norm = normalizeQuery('Compare BASS-II and Saffire microgravity flame spread');
  assert.ok(norm.tokens.includes('bass-ii'));
  assert.ok(norm.tokens.includes('saffire'));

  const rag = runAdvancedRagRetrieval(
    'Compare BASS-II and Saffire microgravity flame spread',
    RECORDS,
    { maxResults: 4 }
  );
  assert.equal(rag.selectedRecords.length, 4);
  assert.ok(rag.selectedRecords.some((r) => r.id === 'bass-ii'));
  assert.ok(rag.selectedRecords.some((r) => r.id === 'saffire'));
  assert.equal(
    rag.diagnostics.selectedRecords.length + rag.diagnostics.excludedRecords.length,
    RECORDS.length
  );

  const refs = buildRetrievedSourceRefs(rag.selectedRecords);
  const badCheck = validateCitations(
    'BASS-II proves everything and see DOI 10.9999/fake-doi-123.',
    refs,
    RECORDS
  );
  assert.equal(badCheck.allCitationsValid, false);
  assert.ok(badCheck.unverifiedClaimsFlagged.length >= 2);
});

test('Module 8 Provenance 2.0: enforces all 8 states and forbids marking plain HTTP 200 as Original source verified', () => {
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', {
      ok: true,
      status: 200,
    }).status,
    'Metadata retrieved'
  );
  assert.equal(
    resolveResourceVerificationStatus('/assets/aistudio/flarex_research_database_def47b9d.json').status,
    'Original source verified'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', undefined, {
      fileRetrieved: true,
    }).status,
    'File successfully retrieved'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', undefined, {
      structureValidated: true,
    }).status,
    'File structure validated'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', undefined, {
      dataImported: true,
    }).status,
    'Data successfully imported'
  );
});

test('Module 9 Experimental Condition Intelligence: evaluates 8 dimensions and flags 0g vs 1g incompatibility', () => {
  const bass = RECORDS.find((r) => r.id === 'bass-ii')!;
  const battery = RECORDS.find((r) => r.id === 'battery-fire-ul')!;
  const report = analyzeExperimentalConditions([bass, battery]);

  assert.equal(report.dimensions.length, 8);
  assert.equal(report.overallStatus, 'Incompatible');
  const gravDim = report.dimensions.find((d) => d.dimension === 'Gravity Environment');
  assert.equal(gravDim?.status, 'Incompatible');
});

test('Module 10 Scientific Report Generator: produces 9 structured sections in Markdown, JSON, and CSV', () => {
  const pkg = buildScientificReportPackage({
    researchQuestion: 'How do BASS-II and Saffire differ in scale?',
    selectedInvestigations: RECORDS.slice(0, 2),
    ingestedDatasets: [],
    analysisRuns: [],
    gaps: RESEARCH_GAPS.slice(0, 2),
    aiInterpretationNote: 'Exploratory summary note.',
  });

  assert.equal(pkg.sections.length, 9);
  const md = renderScientificReportMarkdown(pkg);
  const json = renderScientificReportJson(pkg);
  const csv = renderScientificReportCsv(pkg);

  assert.ok(md.includes('## 1. Research Question'));
  assert.ok(md.includes('## 9. References & Official Repository URLs'));
  assert.equal(JSON.parse(json).sections.length, 9);
  assert.ok(csv.includes('Section Number,Heading,Data Layer,Content'));
});
