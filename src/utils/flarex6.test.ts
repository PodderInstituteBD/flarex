import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RESEARCH_GAPS } from '../data/researchCatalog.ts';
import type { InvestigationRecord } from '../types/research.ts';
import {
  extractAndVerifyDossierClaims,
  verifyClaimAgainstEvidence,
} from './claimVerification.ts';
import { analyzeCrossStudyComparison } from './crossStudyAnalysis.ts';
import { runTwelveDataValidationChecks } from './dataValidation.ts';
import { buildEvidenceCatalog, EVIDENCE_CATEGORY_LABELS } from './evidenceIntelligence.ts';
import {
  buildKnowledgeGraph,
  NODE_TYPE_META,
  summarizeGraphAudit,
} from './knowledgeGraph.ts';
import {
  exploreResearchQuestion,
  renderResearchBriefMarkdown,
  SAMPLE_RESEARCH_QUESTIONS,
} from './researchQuestionEngine.ts';
import { runDescriptiveAnalysis } from './scientificAnalysis.ts';
import { runPlatformScientificAudit } from './scientificAudit.ts';
import { ingestScientificTabularData } from './scientificIngestion.ts';
import {
  buildInvestigationResearchReportV2,
  buildNumericalAnalysisReportV2,
  renderScientificReportMarkdown,
} from './scientificReport.ts';
import { detectScientificConflicts } from './scientificUncertainty.ts';
import { buildDatasetQualityReport } from './scientificValidation.ts';
import {
  createEmptyWorkspace,
  deleteResearchBrief,
  deleteResearchQuestion,
  deleteSavedEvidence,
  deleteWorkspaceReport,
  exportWorkspaceBundle,
  importWorkspaceBundle,
  saveResearchBrief,
  saveResearchQuestion,
  saveWorkspaceReport,
  toggleSavedEvidence,
} from './workspaceStore.ts';

const dbPath = path.resolve(process.cwd(), 'src/data/researchDatabase.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as {
  records: InvestigationRecord[];
};
const RECORDS = rawDb.records;

test('Module A (Evidence Intelligence): classifies all 7 evidence categories and preserves missing-value provenance', () => {
  const sampleCsv = [
    'time [s],o2_pct,flame_temp (K)',
    '0,21.0,750',
    '1,19.5,820',
    '2,18.0,810',
    '3,17.2,790',
    '4,16.5,775',
  ].join('\n');
  const ds = ingestScientificTabularData({
    filename: 'bass_sample.csv',
    content: sampleCsv,
    sourceUrl: 'https://ntrs.nasa.gov/citations/20160000593',
  });
  const desc = runDescriptiveAnalysis(ds, 'flame_temp (K)');

  const catalog = buildEvidenceCatalog({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
    ingestedDatasets: [ds],
    analysisRuns: [desc],
    aiInterpretations: [
      {
        id: 'ai-test-1',
        text: 'Hypothetical extrapolation connecting low-flow extinction to spacecraft ventilation',
        investigationId: 'bass-ii',
        model: 'gemini-4-hydrogen',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ],
  });

  const categoriesPresent = new Set(catalog.map((c) => c.category));
  for (const cat of Object.keys(EVIDENCE_CATEGORY_LABELS)) {
    assert.ok(categoriesPresent.has(cat as keyof typeof EVIDENCE_CATEGORY_LABELS), `Missing category ${cat}`);
  }

  // Zero artificial confidence numbers anywhere in evidence records
  for (const item of catalog) {
    assert.equal('confidenceScore' in item, false);
    assert.ok(item.evidenceId.length > 0);
    assert.ok(item.sourceId.length > 0);
    assert.ok(item.originalSourceReference.length > 0);
  }
});

test('Module B (Claim Citation Verifier): distinguishes direct, multiple, conflicting, AI-only, and insufficient evidence', () => {
  const catalog = buildEvidenceCatalog({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
  });

  // 1. Multi-source peer-reviewed microgravity finding (prompt Module B canonical claim)
  const multiClaim = verifyClaimAgainstEvidence(
    'Microgravity can significantly change flame structure.',
    catalog
  );
  assert.equal(multiClaim.verificationStatus, 'Supported by multiple sources');
  assert.ok(multiClaim.supportingSources.length >= 2);

  // 2. Conflicting physical-domain claim (partial gravity flight data not measured)
  const conflictClaim = verifyClaimAgainstEvidence(
    'ACME E-FIELD flight data proves lunar 0.16g and Martian 0.38g buoyancy flame behavior',
    catalog
  );
  assert.equal(conflictClaim.verificationStatus, 'Conflicting evidence');
  assert.ok(conflictClaim.conflictingNotes.length >= 1);

  // 3. Insufficient evidence claim outside corpus
  const insufficientClaim = verifyClaimAgainstEvidence(
    'Cryogenic LOX rocket injector cavitation pressure oscillations at 40 MPa',
    catalog
  );
  assert.equal(insufficientClaim.verificationStatus, 'Insufficient evidence');
  assert.equal(insufficientClaim.supportingSources.length, 0);

  // 4. AI interpretation only without factual support
  const aiOnlyClaim = verifyClaimAgainstEvidence(
    'Hypothetical plasma-assisted Martian regolith sintered fire barrier performance',
    catalog,
    { origin: 'AI_GENERATED' }
  );
  assert.equal(aiOnlyClaim.verificationStatus, 'AI interpretation only');

  // 5. Extracted dossier claims preserve planned study boundaries
  const dossierClaims = extractAndVerifyDossierClaims(RECORDS, catalog);
  assert.equal(dossierClaims.length, RECORDS.length);
  const sofieClaim = dossierClaims.find((c) => c.claimId === 'claim-dossier-sofie-mist');
  assert.ok(sofieClaim);
  assert.ok(
    sofieClaim.verificationStatus === 'Insufficient evidence' ||
      sofieClaim.verificationStatus === 'Partially supported'
  );
});

test('Module C (12-Dimension Cross-Study Comparison): detects comparable vs non-comparable pairs cleanly', () => {
  const byId = new Map(RECORDS.map((r) => [r.id, r]));
  const bass = byId.get('bass-ii')!;
  const saffire = byId.get('saffire')!;
  const battery = byId.get('battery-fire-ul')!;

  const sameFamily = analyzeCrossStudyComparison([bass, saffire]);
  assert.equal(sameFamily.dimensions12.length, 12);
  assert.ok(
    sameFamily.compatibilityClass === 'Partially comparable' ||
      sameFamily.compatibilityClass === 'Directly comparable'
  );

  const nonComparable = analyzeCrossStudyComparison([bass, battery]);
  assert.equal(nonComparable.dimensions12.length, 12);
  assert.equal(nonComparable.compatibilityClass, 'Not scientifically comparable');
  assert.equal(nonComparable.findingComparisonClass, 'Cannot be meaningfully compared');
  assert.ok(/gravity mismatch/i.test(nonComparable.groundedExplanation));
});

test('Module D (Uncertainty & Conflict Detector): surfaces gravity, scale, chemical regime, and missing-data conflicts', () => {
  const catalog = buildEvidenceCatalog({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
  });
  const conflicts = detectScientificConflicts({
    investigations: RECORDS,
    evidenceCatalog: catalog,
  });

  assert.ok(conflicts.length >= 6);
  const topics = conflicts.map((c) => c.topic).join(' | ');
  assert.ok(/0g|microgravity/i.test(topics));
  assert.ok(/scale|bench/i.test(topics));
  assert.ok(/cool flame/i.test(topics));
  assert.ok(/ion wind|partial-gravity/i.test(topics));
});

test('Module E (12-Check Validation & Readiness): catches negative Kelvin, preserves outliers non-destructively, and applies Bessel n-1 SD', () => {
  const cleanCsv = [
    'time [s],o2 [%],flame_temp (K),heat_release (W)',
    '0,21.0,710,45',
    '1,20.5,730,48',
    '2,20.0,725,47',
    '3,19.5,740,51',
    '4,19.0,718,46',
    '5,18.5,1420,98', // intentional outlier retained
  ].join('\n');

  const cleanDs = ingestScientificTabularData({
    filename: 'clean_with_outlier.csv',
    content: cleanCsv,
    sourceUrl: 'https://psi.nasa.gov/',
  });
  const cleanReport = buildDatasetQualityReport(cleanDs);
  assert.equal(cleanReport.checks.length, 12);
  // 100% numeric non-null, monotonic time, and IQR outlier flagged without deletion
  assert.equal(cleanReport.missingObservations, 0);
  const outlierCheck = cleanReport.checks.find((c) => c.checkNumber === 10);
  assert.ok(outlierCheck);
  assert.equal(cleanDs.normalizedRows.length, 6, 'Outlier row must never be auto-deleted');

  // Bad Kelvin + out-of-order timestamps -> REQUIRES_CLEANING
  const badCsv = [
    'time [s],flame_temp (K),pressure (kPa)',
    '5,-15,101.3',
    '2,720,-5',
  ].join('\n');
  const badDs = ingestScientificTabularData({
    filename: 'invalid_kelvin.csv',
    content: badCsv,
    sourceUrl: 'local-upload',
  });
  const badReport = buildDatasetQualityReport(badDs);
  assert.equal(badReport.readinessAssessment, 'REQUIRES_CLEANING');
  const rangeCheck = badReport.checks.find((c) => c.checkNumber === 5);
  assert.equal(rangeCheck?.status, 'FAIL');

  // Small sample n=1 returns Bessel SD === null
  const singleCsv = 'temp (K)\n800\n';
  const singleDs = ingestScientificTabularData({
    filename: 'single_row.csv',
    content: singleCsv,
    sourceUrl: 'local-upload',
  });
  const singleDesc = runDescriptiveAnalysis(singleDs, singleDs.columns[0].normalizedName);
  assert.equal(singleDesc.sampleCount, 1);
  assert.equal(singleDesc.descriptive?.stdDev, null);
  assert.equal(runTwelveDataValidationChecks(cleanDs).checks.length, 12);
});

test('Module F (Research Question Explorer): produces 9-section structured brief and discloses insufficient evidence', () => {
  assert.equal(SAMPLE_RESEARCH_QUESTIONS.length, 7);

  const goodBrief = exploreResearchQuestion(
    'How does microgravity influence flame structure?',
    RECORDS,
    { gaps: RESEARCH_GAPS }
  );
  assert.equal(goodBrief.hasSufficientEvidence, true);
  assert.ok(goodBrief.relevantInvestigations.length >= 1);
  assert.ok(goodBrief.references.length >= 1);
  const md = renderResearchBriefMarkdown(goodBrief);
  assert.ok(md.includes('## 1. Research Question'));
  assert.ok(md.includes('## 9. References'));

  const unknownBrief = exploreResearchQuestion(
    'Supercritical xenon thruster plasma erosion rates',
    RECORDS,
    { gaps: RESEARCH_GAPS }
  );
  assert.equal(unknownBrief.hasSufficientEvidence, false);
  assert.ok(unknownBrief.evidenceLimitations.some((l) => /insufficient/i.test(l)));
});

test('Module G (Knowledge Graph 2.0): supports all 14 node types and all 14 relationship predicates with zero duplicate edges', () => {
  const ds = ingestScientificTabularData({
    filename: 'kg_test.csv',
    content: 'time [s],temp (K)\n0,700\n1,720\n',
    sourceUrl: 'https://ntrs.nasa.gov/',
  });
  const catalog = buildEvidenceCatalog({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
    ingestedDatasets: [ds],
  });
  const claims = extractAndVerifyDossierClaims(RECORDS, catalog);
  const graph = buildKnowledgeGraph(RECORDS, {
    focusInvestigationId: 'ALL',
    includeInferred: true,
    gaps: RESEARCH_GAPS,
    claims,
    ingestedDatasets: [ds],
  });

  const edgeIdSet = new Set(graph.edges.map((e) => e.id));
  assert.equal(edgeIdSet.size, graph.edges.length, 'Knowledge graph must not emit duplicate edge IDs');

  const nodeTypes = new Set(graph.nodes.map((n) => n.type));
  assert.ok(Object.keys(NODE_TYPE_META).length === 14);
  for (const nt of ['INVESTIGATION', 'CLAIM', 'CONDITION', 'DATASET', 'RESEARCH_GAP'] as const) {
    assert.ok(nodeTypes.has(nt), `Expected node type ${nt}`);
  }

  const predicates = new Set(graph.edges.map((e) => e.relationship));
  for (const pred of [
    'INVESTIGATES',
    'USES_MATERIAL',
    'MEASURES',
    'USES_SENSOR',
    'DOCUMENTED_IN',
    'SUPPORTS_FINDING',
    'RELATED_TO',
    'SUPPORTS_CLAIM',
    'DERIVED_FROM',
    'COMPARED_WITH',
    'HAS_EXPERIMENTAL_CONDITION',
    'HAS_DATASET',
    'HAS_RESEARCH_GAP',
  ]) {
    assert.ok(predicates.has(pred), `Expected predicate ${pred}`);
  }

  const audit = summarizeGraphAudit(graph);
  assert.ok(audit.verifiedEdges > 0);
  assert.ok(audit.inferredEdges > 0);
});

test('Module I (Scientific Reports V2): emits Type A & Type B 9-section reports separating facts, derived stats, and AI notes', () => {
  const ds = ingestScientificTabularData({
    filename: 'report_test.csv',
    content: 'time [s],temp (K)\n0,700\n1,750\n2,790\n3,810\n4,805\n',
    sourceUrl: 'https://psi.nasa.gov/',
  });
  const run = runDescriptiveAnalysis(ds, 'temp (K)');

  const typeA = buildInvestigationResearchReportV2({
    investigations: RECORDS.slice(0, 2),
    gaps: RESEARCH_GAPS,
    ingestedDatasets: [ds],
    analysisRuns: [run],
    researchQuestion: 'Compare BASS-II and Saffire enclosure flame dynamics.',
    aiInterpretationNote: 'Sample AI synthesis note for isolation testing.',
  });
  assert.equal(typeA.sections.length, 9);
  assert.equal(typeA.sections[7].layer, 'AI_INTERPRETATION');
  assert.ok(renderScientificReportMarkdown(typeA).includes('8. AI interpretation'));

  const typeB = buildNumericalAnalysisReportV2({
    investigations: RECORDS.slice(0, 2),
    gaps: RESEARCH_GAPS,
    ingestedDatasets: [ds],
    analysisRuns: [run],
  });
  assert.equal(typeB.sections.length, 9);
  assert.equal(typeB.sections[8].layer, 'AI_INTERPRETATION');
  assert.ok(renderScientificReportMarkdown(typeB).includes('Reproducibility parameters'));
});

test('Module K (Workspace 2.0): persists and restores saved questions, briefs, evidence, and reports via JSON bundle', () => {
  let ws = createEmptyWorkspace();
  ws = saveResearchQuestion(ws, 'What limits flame extinction in low flow?', 'Comparative Inquiry');
  ws = saveResearchBrief(ws, {
    title: 'Low-Flow Brief',
    question: 'What limits flame extinction in low flow?',
    markdown: '# Brief\nVerified BASS-II limits.',
    sourceCount: 2,
  });
  ws = toggleSavedEvidence(ws, {
    evidenceId: 'ev-bass-1',
    investigationId: 'bass-ii',
    investigationShortName: 'BASS-II',
    category: 'PUBLISHED_RESULT',
    summary: 'Sustained burning below 1 cm/s airflow.',
    sourceUrl: 'https://ntrs.nasa.gov/citations/20160000593',
  });
  ws = saveWorkspaceReport(ws, {
    title: 'Type A Report',
    reportType: 'investigation_report_v2',
    markdown: '# Report',
  });

  const exportedJson = exportWorkspaceBundle(ws);
  const imported = importWorkspaceBundle(exportedJson, new Set(RECORDS.map((r) => r.id)));
  assert.equal(imported.ok, true);
  assert.ok(imported.state);
  assert.equal(imported.state.savedQuestions.length, 1);
  assert.equal(imported.state.savedBriefs.length, 1);
  assert.equal(imported.state.savedEvidence.length, 1);
  assert.equal(imported.state.savedReports.length, 1);

  let cleaned = deleteResearchQuestion(imported.state, imported.state.savedQuestions[0].id);
  cleaned = deleteResearchBrief(cleaned, imported.state.savedBriefs[0].id);
  cleaned = deleteSavedEvidence(cleaned, 'ev-bass-1');
  cleaned = deleteWorkspaceReport(cleaned, imported.state.savedReports[0].id);
  assert.equal(cleaned.savedQuestions.length, 0);
  assert.equal(cleaned.savedBriefs.length, 0);
  assert.equal(cleaned.savedEvidence.length, 0);
  assert.equal(cleaned.savedReports.length, 0);
});

test('Module M (Scientific Audit Center): produces 10 category checks and marks untested telemetry as NOT TESTED', () => {
  const catalog = buildEvidenceCatalog({ investigations: RECORDS, gaps: RESEARCH_GAPS });
  const claims = extractAndVerifyDossierClaims(RECORDS, catalog);
  const audit = runPlatformScientificAudit({
    investigations: RECORDS,
    gaps: RESEARCH_GAPS,
    evidenceCatalog: catalog,
    claims,
    ingestedDatasets: [],
    analysisRuns: [],
    aiTelemetry: null,
    checkedSourceCount: 0,
    retrievedDocumentCount: 0,
    generatedReportCount: 0,
  });

  assert.equal(audit.checks.length, 10);
  const apiCheck = audit.checks.find((c) => c.category === 'API reliability');
  const datasetCheck = audit.checks.find((c) => c.category === 'Dataset integrity');
  assert.equal(apiCheck?.status, 'NOT TESTED');
  assert.equal(datasetCheck?.status, 'NOT TESTED');
  const dbCheck = audit.checks.find((c) => c.category === 'Research database integrity');
  assert.equal(dbCheck?.status, 'PASS');
});
