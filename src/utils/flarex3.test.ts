import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DOSSIER_REFERENCES,
  OFFICIAL_RESOURCES,
  RESEARCH_GAPS,
} from '../data/researchCatalog.ts';
import type { InvestigationRecord } from '../types/research.ts';
import {
  analyzeCrossInvestigations,
  discoverRelatedInvestigations,
} from './crossInvestigation.ts';
import { runDataQualityAudit } from './dataQualityMonitor.ts';
import {
  buildDiscoveryIndex,
  filterDiscoveryResources,
  inferRepositoryFromUrl,
} from './discoveryEngine.ts';
import {
  extractDocumentIntelligence,
  extractFromCsv,
  extractFromJson,
  extractFromXml,
} from './documentIntelligence.ts';
import {
  buildEvidenceClaims,
  EVIDENCE_CLAIM_CATEGORIES,
  filterEvidenceClaims,
} from './evidenceEngine.ts';
import {
  generateExportCsv,
  generateExportJson,
  generateExportMarkdown,
} from './exportCenter.ts';
import { buildGapIntelligence } from './gapIntelligence.ts';
import {
  buildKnowledgeGraph,
  layoutKnowledgeGraph,
  NODE_TYPE_META,
} from './knowledgeGraph.ts';
import { computeScientificTrends } from './trendAnalysis.ts';
import {
  addSavedComparison,
  createCollection,
  createEmptyWorkspace,
  sanitizeWorkspaceState,
  toggleBookmarkedSource,
  toggleSavedInvestigation,
  upsertResearchNote,
} from './workspaceStore.ts';

const dbRaw = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'src', 'data', 'researchDatabase.json'),
    'utf-8'
  )
) as { records: InvestigationRecord[] };
const RECORDS = dbRaw.records;

test('Module 1 Discovery Engine indexes all repositories and filters cleanly', () => {
  const index = buildDiscoveryIndex(
    RECORDS,
    OFFICIAL_RESOURCES,
    DOSSIER_REFERENCES
  );
  assert.ok(index.length >= RECORDS.length);
  assert.equal(
    inferRepositoryFromUrl('https://psi.nasa.gov/physci/repo').id,
    'NASA_PSI'
  );
  assert.equal(
    inferRepositoryFromUrl('https://ntrs.nasa.gov/citations/20210002821').id,
    'NASA_NTRS'
  );
  assert.equal(
    inferRepositoryFromUrl('https://registry.opendata.aws/nasa-psi/').id,
    'NASA_PSI_AWS'
  );
  assert.equal(
    inferRepositoryFromUrl('https://osdr.nasa.gov/').id,
    'NASA_OSDR'
  );

  const ntrsItems = filterDiscoveryResources(index, {
    query: 'BASS',
    repository: 'NASA_NTRS',
    category: 'ALL',
    investigationId: 'ALL',
    year: 'ALL',
    evidenceType: 'ALL',
    dataAvailability: 'ALL',
  });
  assert.ok(ntrsItems.length >= 1);
  assert.ok(ntrsItems.some((i) => i.investigationId === 'bass-ii'));
});

test('Module 2 Document Intelligence extracts CSV, JSON, XML, TXT, and PDF headers without guessing', () => {
  const csvRes = extractFromCsv(
    'flame_log.csv',
    'time_s,o2_pct,temp_k\n0,21,300\n5,18.5,720\n',
    42
  );
  assert.equal(csvRes.format, 'CSV');
  assert.equal(csvRes.experimentalVariables.length, 3);

  const jsonRes = extractFromJson(
    'sample.json',
    JSON.stringify({
      title: 'Saffire Test',
      scientificPurpose: 'Verify large-scale cabin flame spread',
      reportedFindings: 'Observed self-propagating flames',
      limitations: ['High mass flux sensitivity'],
    }),
    120
  );
  assert.equal(jsonRes.title, 'Saffire Test');
  assert.equal(jsonRes.objectives.length, 1);
  assert.equal(jsonRes.findings.length, 1);

  const xmlRes = extractFromXml(
    'study.xml',
    '<study><title>ACME BRE</title><purpose>Test gaseous porous burner extinction</purpose><limitation>Uses gaseous analog rather than solid</limitation></study>',
    140
  );
  assert.equal(xmlRes.title, 'ACME BRE');
  assert.equal(xmlRes.objectives.length, 1);

  const txtRes = extractDocumentIntelligence(
    'notes.txt',
    'BASS-II Notes\n\nABSTRACT:\nThin solid fuels burned at low airflow.\n\nFINDINGS\nFlames persisted below 1 cm/s.',
    98
  );
  assert.equal(txtRes.format, 'TXT');
  assert.ok(txtRes.scientificTerms.includes('Buoyant Convection') === false);
  assert.ok(txtRes.findings.length >= 1);

  const pdfRes = extractDocumentIntelligence(
    'dossier.pdf',
    '%PDF-1.4\n/Type /Page\n/Title (Flame in Freefall Dossier)\n/Author (Student Researcher)\n(Microgravity oxygen flame extinction) Tj\n',
    120
  );
  assert.equal(pdfRes.format, 'PDF');
  assert.equal(pdfRes.title, 'Flame in Freefall Dossier');
});

test('Module 3 Knowledge Graph supports all 10 node types and separates VERIFIED vs INFERRED edges', () => {
  const fullGraph = buildKnowledgeGraph(RECORDS, { includeInferred: true });
  assert.ok(Object.keys(NODE_TYPE_META).length === 10);
  assert.ok(fullGraph.edges.some((e) => e.verification === 'VERIFIED'));
  assert.ok(fullGraph.edges.some((e) => e.verification === 'INFERRED'));

  const egoGraph = buildKnowledgeGraph(RECORDS, {
    focusInvestigationId: 'bass-ii',
    includeInferred: false,
  });
  assert.ok(egoGraph.nodes.some((n) => n.type === 'FINDING'));
  assert.ok(egoGraph.nodes.some((n) => n.type === 'LIMITATION'));
  assert.ok(egoGraph.edges.every((e) => e.verification === 'VERIFIED'));

  const positioned = layoutKnowledgeGraph(egoGraph);
  assert.equal(positioned.length, egoGraph.nodes.length);
  assert.ok(positioned.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('Module 4 Cross-Investigation Intelligence enforces gravity/planned compatibility warnings and never equates missing info with contradiction', () => {
  const bass = RECORDS.find((r) => r.id === 'bass-ii')!;
  const battery = RECORDS.find((r) => r.id === 'battery-fire-ul')!;
  const sofie = RECORDS.find((r) => r.id === 'sofie-mist')!;

  const related = discoverRelatedInvestigations(bass, RECORDS, 4);
  assert.ok(related.length >= 1);

  const analysis = analyzeCrossInvestigations([bass, battery, sofie]);
  assert.ok(
    analysis.compatibilityWarnings.some((w) =>
      w.toLowerCase().includes('incompatible gravity regimes')
    )
  );
  assert.ok(
    analysis.compatibilityWarnings.some((w) =>
      w.toLowerCase().includes('planned/in-progress')
    )
  );
  assert.ok(
    analysis.missingInformationGaps.some((m) =>
      m.includes('treated as missing source info, not a contradiction')
    )
  );
});

test('Module 5 & 11 Scientific Trend Analysis calculates real DB statistics honestly', () => {
  const trends = computeScientificTrends(RECORDS);
  assert.equal(trends.publicationCoverage.totalRecords, RECORDS.length);
  assert.ok(trends.scopeNotice.includes(String(RECORDS.length)));
  assert.equal(
    trends.underrepresentedAreas.find((u) => u.area.includes('Partial-Gravity'))
      ?.recordCount,
    0
  );
});

test('Module 6 Evidence Engine covers 7 categories without invented scores', () => {
  const claims = buildEvidenceClaims(RECORDS, RESEARCH_GAPS);
  assert.ok(claims.length > RECORDS.length);
  assert.equal(EVIDENCE_CLAIM_CATEGORIES.length, 7);

  const bassClaims = filterEvidenceClaims(claims, {
    query: '',
    category: 'ALL',
    investigationId: 'bass-ii',
    verificationStatus: 'ALL',
  });
  assert.ok(bassClaims.length >= 2);
});

test('Module 8 Gap Intelligence frames findings strictly as potential gaps in reviewed FLAREX sources', () => {
  const report = buildGapIntelligence(RECORDS, RESEARCH_GAPS);
  assert.ok(report.dynamicSignals.length >= 4);
  assert.ok(
    report.dynamicSignals.every((s) =>
      s.signalLabel.includes('Potential gap in the reviewed FLAREX sources')
    )
  );
});

test('Module 9 & 10 Workspace reducers and CSV/JSON/Markdown exporters preserve attribution and AI separation', () => {
  let ws = createEmptyWorkspace();
  ws = toggleSavedInvestigation(ws, 'saffire');
  assert.ok(!ws.savedInvestigationIds.includes('saffire'));
  ws = toggleSavedInvestigation(ws, 'saffire');
  ws = toggleBookmarkedSource(ws, {
    id: 'src-1',
    title: 'BASS-II TM',
    url: 'https://ntrs.nasa.gov/citations/20210002821',
    repository: 'NASA NTRS',
    investigationId: 'bass-ii',
  });
  ws = addSavedComparison(ws, 'Solid vs Battery', ['bass-ii', 'battery-fire-ul']);
  ws = upsertResearchNote(ws, {
    targetType: 'investigation',
    targetId: 'bass-ii',
    targetTitle: 'BASS-II',
    content: 'Check airflow limits below 1 cm/s.',
  });
  ws = createCollection(ws, 'Cabin Fire Safety', 'Test notes', ['bass-ii']);

  const sanitized = sanitizeWorkspaceState(
    JSON.parse(JSON.stringify(ws)),
    new Set(RECORDS.map((r) => r.id))
  );
  assert.equal(sanitized.bookmarkedSources.length, 1);
  assert.equal(sanitized.savedComparisons.length, 1);
  assert.equal(sanitized.notes.length, 1);

  const claims = buildEvidenceClaims(RECORDS, RESEARCH_GAPS);
  const selected = RECORDS.slice(0, 2);
  const csv = generateExportCsv({
    reportType: 'comparison_report',
    selectedInvestigations: selected,
    allInvestigations: RECORDS,
    gaps: RESEARCH_GAPS,
    claims,
    workspace: sanitized,
  });
  assert.ok(csv.includes('Parameter'));

  const json = JSON.parse(
    generateExportJson({
      reportType: 'investigation_profile',
      selectedInvestigations: selected,
      allInvestigations: RECORDS,
      gaps: RESEARCH_GAPS,
      claims,
      workspace: sanitized,
      aiSummaryNote: 'Sample AI note',
    })
  );
  assert.equal(json.aiInterpretationIncluded, true);

  const md = generateExportMarkdown({
    reportType: 'gap_report',
    selectedInvestigations: selected,
    allInvestigations: RECORDS,
    gaps: RESEARCH_GAPS,
    claims,
    workspace: sanitized,
    aiSummaryNote: 'AI draft comment',
  });
  assert.ok(md.includes('AI Interpretation / User Note'));
});

test('Module 12 Data Quality Monitor detects missing dates/notes cleanly and passes zero critical errors on curated DB', () => {
  const claims = buildEvidenceClaims(RECORDS, RESEARCH_GAPS);
  const audit = runDataQualityAudit(RECORDS, claims);
  assert.equal(audit.totalRecords, RECORDS.length);
  assert.equal(audit.criticalCount, 0);
  assert.ok(audit.uniqueCheckableUrls.length >= 10);
});
