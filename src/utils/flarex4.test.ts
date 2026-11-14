import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RESEARCH_GAPS } from '../data/researchCatalog.ts';
import type { InvestigationRecord } from '../types/research.ts';
import {
  classifyUnitFamily,
  exportDatasetCatalogCsv,
  exportDatasetCatalogJson,
  extractDatasetCatalog,
  extractPublishedCountsFromRecords,
  recommendValidChartType,
} from './dataExplorer.ts';
import { DEMO_TOUR_STEPS } from './demoGuide.ts';
import { buildGapIntelligence } from './gapIntelligence.ts';
import { buildKnowledgeGraph } from './knowledgeGraph.ts';
import {
  buildRetrievedSourceRefs,
  classifyResearchQuery,
} from './ragPipeline.ts';
import { resolveResourceVerificationStatus } from './sourceVerification.ts';
import { buildResearchUrlPath, parseResearchUrlState } from './urlState.ts';

const dbPath = path.resolve(process.cwd(), 'src/data/researchDatabase.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as {
  records: InvestigationRecord[];
};
const RECORDS = rawDb.records;

test('Scientific Data Explorer: extracts dataset catalog dynamically from records without fabrication', () => {
  const catalog = extractDatasetCatalog(RECORDS);
  assert.ok(
    catalog.length >= RECORDS.length,
    'Dataset catalog must extract at least one metadata entry per investigation'
  );
  assert.ok(
    catalog.every((item) => item.sourceUrl && item.repository && item.title),
    'Every dataset catalog entry must have title, repository, and sourceUrl'
  );
  assert.equal(classifyUnitFamily('tests'), 'COUNTS');
  assert.equal(classifyUnitFamily('kV'), 'FLOW_ELECTRIC');
  assert.equal(classifyUnitFamily('K'), 'THERMAL_POWER');
  assert.equal(classifyUnitFamily('mm'), 'SIZE_TIME');
});

test('Scientific Data Explorer: published counts filter dynamically by selected study and disable invalid line charts', () => {
  const allCounts = extractPublishedCountsFromRecords(RECORDS, 'ALL');
  assert.ok(
    allCounts.some((c) => c.investigationId === 'spice' && c.count === 250),
    'All-study published counts should dynamically find SPICE 250 tests from JSON'
  );
  assert.ok(
    allCounts.some((c) => c.investigationId === 'flex-cfi-g' && c.count === 150),
    'All-study published counts should dynamically find CFI-G 150 tests from JSON'
  );

  const spiceOnly = extractPublishedCountsFromRecords(RECORDS, 'spice');
  assert.equal(spiceOnly.length, 2, 'Filtering to SPICE returns exactly SPICE count rows');
  assert.ok(spiceOnly.every((c) => c.investigationId === 'spice'));

  const rec = recommendValidChartType('PUBLISHED_COUNTS', allCounts.length);
  assert.equal(rec.chartType, 'BAR');
  assert.equal(rec.lineChartSupported, false);

  const emptyRec = recommendValidChartType('PUBLISHED_COUNTS', 0);
  assert.equal(emptyRec.chartType, 'NONE');
});

test('Scientific Data Explorer: CSV and JSON exporters preserve headers, provenance, and non-local raw disclaimer', () => {
  const catalog = extractDatasetCatalog(RECORDS.slice(0, 3));
  const csv = exportDatasetCatalogCsv(catalog);
  assert.ok(csv.includes('Dataset ID,Title,Investigation,Repository'));
  assert.ok(csv.includes('Source URL'));

  const jsonParsed = JSON.parse(exportDatasetCatalogJson(catalog));
  assert.equal(jsonParsed.rawTelemetryBundledLocally, false);
  assert.equal(jsonParsed.recordCount, catalog.length);
});

test('Knowledge Graph 2.0: contains canonical 7 predicates, zero duplicate edges, and clean inferred filtering', () => {
  const fullGraph = buildKnowledgeGraph(RECORDS, { includeInferred: true });
  const predicates = new Set(fullGraph.edges.map((e) => e.relationship));

  const requiredPredicates = [
    'INVESTIGATES',
    'USES_MATERIAL',
    'MEASURES',
    'USES_SENSOR',
    'DOCUMENTED_IN',
    'SUPPORTS_FINDING',
    'RELATED_TO',
  ];

  for (const pred of requiredPredicates) {
    assert.ok(
      predicates.has(pred),
      `Knowledge Graph must contain canonical predicate ${pred}`
    );
  }

  const edgeIdSet = new Set(fullGraph.edges.map((e) => e.id));
  assert.equal(
    edgeIdSet.size,
    fullGraph.edges.length,
    'Knowledge Graph must not emit duplicate edge IDs'
  );

  const verifiedOnlyGraph = buildKnowledgeGraph(RECORDS, {
    includeInferred: false,
  });
  assert.ok(
    verifiedOnlyGraph.edges.every((e) => e.verification === 'VERIFIED'),
    'includeInferred: false must strip all INFERRED edges'
  );
  assert.ok(
    verifiedOnlyGraph.edges.length < fullGraph.edges.length,
    'Full graph should include additional INFERRED edges compared to verified-only'
  );
});

test('FLAREX Research Intelligence 2.0: exposes complete 5-part structured gap audit and honest coverage counts', () => {
  const report = buildGapIntelligence(RECORDS, RESEARCH_GAPS);
  assert.equal(report.coverageAudit.totalRecords, RECORDS.length);
  assert.ok(report.dynamicSignals.length >= 4);

  for (const sig of report.dynamicSignals) {
    assert.ok(sig.title.length > 0);
    assert.ok(sig.evidenceBasis.length > 0);
    assert.ok(sig.missingInformation.length > 0);
    assert.ok(sig.caveat.length > 0);
    assert.ok(Array.isArray(sig.affectedInvestigationIds));
  }
});

test('AI RAG Pipeline: classifies query categories and enriches retrieved citations with limitations', () => {
  assert.equal(
    classifyResearchQuery('Compare BASS-II and Saffire').category,
    'comparison'
  );
  assert.equal(
    classifyResearchQuery('What are the limitations of E-FIELD?').category,
    'limitations'
  );
  assert.equal(
    classifyResearchQuery('Where is the NASA PSI dataset URL?').category,
    'source_discovery'
  );
  assert.equal(
    classifyResearchQuery('Why do microgravity flames turn spherical?').category,
    'explanation'
  );

  const refs = buildRetrievedSourceRefs(RECORDS.slice(0, 2));
  assert.equal(refs.length, 2);
  assert.ok(refs[0].sourceLabel.length > 0);
  assert.ok(refs[0].primaryLimitation.length > 0);
  assert.ok('ntrsDocumentId' in refs[0]);
});

test('NASA Source Verification Engine: honestly resolves all 5 verification states without hardcoded dates', () => {
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123').status,
    'Link not checked'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://psi.nasa.gov/physci/repo').status,
    'Requires manual review'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', undefined, {
      metadataRetrieved: true,
    }).status,
    'Metadata retrieved'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', {
      ok: true,
      status: 200,
    }).status,
    'Metadata retrieved'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/123', {
      ok: true,
      status: 200,
      contentVerified: true,
    }).status,
    'Original source verified'
  );
  assert.equal(
    resolveResourceVerificationStatus('https://ntrs.nasa.gov/citations/999', {
      ok: false,
      status: 404,
    }).status,
    'Source unavailable'
  );
});

test('Demonstration Mode & URL State: tour steps reference real studies and ?demo=1 round-trips cleanly', () => {
  const validIds = new Set(RECORDS.map((r) => r.id));
  assert.equal(DEMO_TOUR_STEPS.length, 6);

  for (const step of DEMO_TOUR_STEPS) {
    if (step.featuredInvestigationId) {
      assert.ok(
        validIds.has(step.featuredInvestigationId),
        `Featured ID ${step.featuredInvestigationId} must exist in database`
      );
    }
    if (step.comparisonPresetIds) {
      for (const id of step.comparisonPresetIds) {
        assert.ok(
          validIds.has(id),
          `Comparison preset ID ${id} must exist in database`
        );
      }
    }
  }

  const parsedDemo = parseResearchUrlState('?page=compare&demo=1', validIds, RECORDS[0].id);
  assert.equal(parsedDemo.page, 'compare');
  assert.equal(parsedDemo.demoMode, true);

  const builtUrl = buildResearchUrlPath('/', { page: 'overview', demoMode: true });
  assert.equal(builtUrl, '/?demo=1');
});
