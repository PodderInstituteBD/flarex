import type { InvestigationRecord, ResearchGapRecord } from '../types/research.ts';
import type { EvidenceClaimRecord } from './evidenceEngine.ts';
import { buildComparisonRows } from './researchLogic.ts';
import type { ResearchWorkspaceState } from './workspaceStore.ts';

export type ExportReportType =
  | 'investigation_report_v2'
  | 'numerical_analysis_report_v2'
  | 'scientific_full_report'
  | 'investigation_profile'
  | 'comparison_report'
  | 'workspace_summary'
  | 'source_list'
  | 'gap_report'
  | 'evidence_claims'
  | 'database_records';

export interface ExportBundleInput {
  reportType: ExportReportType;
  selectedInvestigations: InvestigationRecord[];
  allInvestigations: InvestigationRecord[];
  gaps: ResearchGapRecord[];
  claims: EvidenceClaimRecord[];
  workspace: ResearchWorkspaceState;
  aiSummaryNote?: string;
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvTable(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function generateExportCsv(input: ExportBundleInput): string {
  switch (input.reportType) {
    case 'investigation_report_v2':
    case 'numerical_analysis_report_v2':
    case 'scientific_full_report':
    case 'investigation_profile':
    case 'database_records': {
      const target =
        (input.reportType === 'investigation_profile' ||
          input.reportType === 'scientific_full_report' ||
          input.reportType === 'investigation_report_v2') &&
        input.selectedInvestigations.length > 0
          ? input.selectedInvestigations
          : input.allInvestigations;
      return toCsvTable(
        [
          'ID',
          'Short Name',
          'Full Name',
          'Family',
          'Platform',
          'Gravity Context',
          'Is Microgravity',
          'Is Planned/Ongoing',
          'Timeframe',
          'Evidence Type',
          'Data Availability',
          'PSI ID',
          'NTRS ID',
          'DOI',
          'Source Label',
          'Source URL',
          'Reported Findings',
          'Limitations',
        ],
        target.map((r) => [
          r.id,
          r.shortName,
          r.name,
          r.family,
          r.platform,
          r.gravityContext,
          r.isMicrogravity,
          r.isPlannedOrOngoing,
          r.timeframe,
          r.evidenceType,
          r.dataAvailabilityLabel,
          r.psiId ?? '',
          r.ntrsDocumentId ?? '',
          r.doi ?? '',
          r.sourceLabel,
          r.sourceUrl,
          r.reportedFindings ?? 'Not available in reviewed source',
          r.limitations.join(' | '),
        ])
      );
    }

    case 'comparison_report': {
      const compared = input.selectedInvestigations.slice(0, 3);
      if (compared.length === 0) {
        return 'Attribute,Note\nComparison Empty,Select up to 3 investigations to export comparison.';
      }
      const rows = buildComparisonRows(compared);
      return toCsvTable(
        ['Parameter', ...compared.map((c) => `${c.shortName} (${c.gravityContext})`)],
        rows.map((row) => [
          row.label,
          ...row.values.map((v) =>
            v.cautionNote ? `${v.display} [CAUTION: ${v.cautionNote}]` : v.display
          ),
        ])
      );
    }

    case 'source_list': {
      return toCsvTable(
        [
          'Investigation ID',
          'Short Name',
          'Source Label',
          'Evidence Type',
          'PSI ID',
          'NTRS ID',
          'DOI',
          'Publication Date / Timeframe',
          'Primary URL',
          'Secondary URLs',
        ],
        input.allInvestigations.map((r) => [
          r.id,
          r.shortName,
          r.sourceLabel,
          r.evidenceType,
          r.psiId ?? '',
          r.ntrsDocumentId ?? '',
          r.doi ?? '',
          r.publicationDate || r.timeframe,
          r.sourceUrl,
          r.secondaryUrls.map((s) => `${s.label}: ${s.url}`).join(' | '),
        ])
      );
    }

    case 'gap_report': {
      return toCsvTable(
        [
          'Gap ID',
          'Title',
          'Area',
          'Evidence Strength',
          'Provenance (AI Synthesis vs Dossier)',
          'Description',
          'Why It Matters',
          'Supporting Sources',
          'Limitations',
        ],
        input.gaps.map((g) => [
          g.id,
          g.title,
          g.area,
          g.evidenceStrength,
          g.isAiSynthesis ? 'AI/Review Synthesis' : 'Directly Documented in Dossier',
          g.description,
          g.whyItMatters,
          g.supportingSources.join(' | '),
          g.limitations.join(' | '),
        ])
      );
    }

    case 'evidence_claims': {
      return toCsvTable(
        [
          'Claim ID',
          'Investigation',
          'Evidence Category',
          'Verification Status',
          'Evidence Strength',
          'Identifier',
          'Source Label',
          'Source URL',
          'Claim Text',
        ],
        input.claims.map((c) => [
          c.id,
          c.investigationShortName,
          c.category,
          c.verificationStatus,
          c.evidenceStrength,
          c.doiOrId ?? '',
          c.sourceLabel,
          c.sourceUrl,
          c.claimText,
        ])
      );
    }

    case 'workspace_summary': {
      const savedSet = new Set(input.workspace.savedInvestigationIds);
      const savedRecords = input.allInvestigations.filter((r) => savedSet.has(r.id));
      return toCsvTable(
        ['Item Type', 'ID / Reference', 'Title', 'Details / Note', 'Source URL or Timestamp'],
        [
          ...savedRecords.map((r) => [
            'Saved Investigation',
            r.id,
            r.name,
            `${r.platform} | ${r.evidenceType}`,
            r.sourceUrl,
          ]),
          ...input.workspace.bookmarkedSources.map((b) => [
            'Bookmarked Source',
            b.repository,
            b.title,
            b.investigationId ?? 'Repository Entry',
            b.url,
          ]),
          ...input.workspace.notes.map((n) => [
            'Research Note',
            n.targetId,
            n.targetTitle,
            n.content,
            n.updatedAt,
          ]),
        ]
      );
    }
  }
}

export function generateExportJson(input: ExportBundleInput): string {
  const baseEnvelope = {
    exportedBy: 'FLAREX — Fire Learning and Research Explorer (Independent Student Platform)',
    exportedAt: new Date().toISOString(),
    reportType: input.reportType,
    integrityNotice:
      'Verified dossier records and NASA source URLs are stored separately from any AI synthesis or user research notes.',
    aiInterpretationIncluded: Boolean(input.aiSummaryNote?.trim()),
    aiInterpretationText: input.aiSummaryNote?.trim() || null,
  };

  switch (input.reportType) {
    case 'investigation_report_v2':
    case 'numerical_analysis_report_v2':
    case 'scientific_full_report':
    case 'investigation_profile':
    case 'database_records':
      return JSON.stringify(
        {
          ...baseEnvelope,
          records:
            (input.reportType === 'investigation_profile' ||
              input.reportType === 'scientific_full_report' ||
              input.reportType === 'investigation_report_v2') &&
            input.selectedInvestigations.length > 0
              ? input.selectedInvestigations
              : input.allInvestigations,
        },
        null,
        2
      );
    case 'comparison_report':
      return JSON.stringify(
        {
          ...baseEnvelope,
          comparedInvestigations: input.selectedInvestigations.map((r) => ({
            id: r.id,
            name: r.name,
            gravityContext: r.gravityContext,
            isMicrogravity: r.isMicrogravity,
            isPlannedOrOngoing: r.isPlannedOrOngoing,
            sourceUrl: r.sourceUrl,
          })),
          comparisonMatrix: buildComparisonRows(input.selectedInvestigations.slice(0, 3)),
        },
        null,
        2
      );
    case 'source_list':
      return JSON.stringify(
        {
          ...baseEnvelope,
          sources: input.allInvestigations.map((r) => ({
            id: r.id,
            shortName: r.shortName,
            sourceLabel: r.sourceLabel,
            sourceUrl: r.sourceUrl,
            psiId: r.psiId,
            ntrsDocumentId: r.ntrsDocumentId ?? null,
            doi: r.doi,
            publications: r.publications ?? [],
            secondaryUrls: r.secondaryUrls,
          })),
        },
        null,
        2
      );
    case 'gap_report':
      return JSON.stringify({ ...baseEnvelope, researchGaps: input.gaps }, null, 2);
    case 'evidence_claims':
      return JSON.stringify({ ...baseEnvelope, claims: input.claims }, null, 2);
    case 'workspace_summary':
      return JSON.stringify({ ...baseEnvelope, workspace: input.workspace }, null, 2);
  }
}

export function generateExportMarkdown(input: ExportBundleInput): string {
  const lines: string[] = [
    `# FLAREX Scientific Export — ${input.reportType.replace(/_/g, ' ').toUpperCase()}`,
    '',
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Platform Notice:** FLAREX (Fire Learning and Research Explorer) — Independent student research platform, not affiliated with NASA.`,
    `- **Provenance Rule:** Verified dossier facts and official URLs are presented separately from AI interpretation.`,
    '',
  ];

  if (input.aiSummaryNote?.trim()) {
    lines.push(
      '## AI Interpretation / User Note (Clearly Separated from Experimental Data)',
      '',
      input.aiSummaryNote.trim(),
      ''
    );
  }

  switch (input.reportType) {
    case 'investigation_report_v2':
    case 'numerical_analysis_report_v2':
    case 'scientific_full_report':
    case 'investigation_profile':
    case 'database_records': {
      const target =
        (input.reportType === 'investigation_profile' ||
          input.reportType === 'scientific_full_report' ||
          input.reportType === 'investigation_report_v2') &&
        input.selectedInvestigations.length > 0
          ? input.selectedInvestigations
          : input.allInvestigations;
      lines.push(`## Verified Dossier Records (${target.length})`, '');
      for (const r of target) {
        lines.push(`### ${r.shortName} — ${r.name}`);
        lines.push(`- **Category / Platform:** ${r.family} · ${r.platform} (${r.gravityContext})`);
        lines.push(`- **Evidence Classification:** ${r.evidenceType} · ${r.dataAvailabilityLabel}`);
        lines.push(`- **Identifiers:** PSI: ${r.psiId ?? 'Not listed'} · NTRS: ${r.ntrsDocumentId ?? 'Not listed'} · DOI: ${r.doi ?? 'Not listed'}`);
        lines.push(`- **Primary Source:** [${r.sourceLabel}](${r.sourceUrl})`);
        lines.push(`- **Overview:** ${r.overview}`);
        lines.push(`- **Documented Findings:** ${r.reportedFindings ?? 'None published yet / Not available in reviewed source'}`);
        lines.push(`- **Limitations:** ${r.limitations.join('; ')}`);
        lines.push('');
      }
      break;
    }

    case 'comparison_report': {
      const compared = input.selectedInvestigations.slice(0, 3);
      lines.push(`## Cross-Investigation Comparison (${compared.map((c) => c.shortName).join(' vs. ')})`, '');
      const rows = buildComparisonRows(compared);
      for (const row of rows) {
        lines.push(`### ${row.label}`);
        for (const v of row.values) {
          const recName = compared.find((c) => c.id === v.investigationId)?.shortName ?? v.investigationId;
          lines.push(`- **${recName}:** ${v.display}${v.cautionNote ? ` _(CAUTION: ${v.cautionNote})_` : ''}`);
        }
        lines.push('');
      }
      break;
    }

    case 'source_list': {
      lines.push('## Verified Sources & NASA Citations', '');
      for (const r of input.allInvestigations) {
        lines.push(`- **${r.shortName}**: [${r.sourceLabel}](${r.sourceUrl}) (${r.evidenceType}${r.psiId ? `, PSI ${r.psiId}` : ''}${r.ntrsDocumentId ? `, NTRS ${r.ntrsDocumentId}` : ''})`);
      }
      lines.push('');
      break;
    }

    case 'gap_report': {
      lines.push('## Potential Gaps in the Reviewed FLAREX Sources', '');
      for (const g of input.gaps) {
        lines.push(`### ${g.title} (${g.isAiSynthesis ? 'Review / AI Synthesis' : 'Dossier-Documented'})`);
        lines.push(`- **Area:** ${g.area} · **Strength:** ${g.evidenceStrength}`);
        lines.push(`- **Summary:** ${g.description}`);
        lines.push(`- **Relevance:** ${g.whyItMatters}`);
        lines.push(`- **Limitations:** ${g.limitations.join('; ')}`);
        lines.push('');
      }
      break;
    }

    case 'evidence_claims': {
      lines.push(`## Evidence Traceability Claims (${input.claims.length})`, '');
      for (const c of input.claims.slice(0, 80)) {
        lines.push(`- **[${c.category} · ${c.verificationStatus}]** (${c.investigationShortName}): ${c.claimText} — [${c.sourceLabel}](${c.sourceUrl})`);
      }
      lines.push('');
      break;
    }

    case 'workspace_summary': {
      lines.push('## Local Browser Workspace Summary', '');
      lines.push(`- **Saved Investigation IDs:** ${input.workspace.savedInvestigationIds.join(', ') || 'None'}`);
      lines.push(`- **Bookmarked Sources:** ${input.workspace.bookmarkedSources.length}`);
      lines.push(`- **Saved Comparisons:** ${input.workspace.savedComparisons.length}`);
      lines.push(`- **Collections:** ${input.workspace.collections.length}`);
      lines.push('');
      if (input.workspace.notes.length > 0) {
        lines.push('### Researcher Notes', '');
        for (const n of input.workspace.notes) {
          lines.push(`- **${n.targetTitle}** (${n.updatedAt}): ${n.content}`);
        }
      }
      break;
    }
  }

  return lines.join('\n');
}
