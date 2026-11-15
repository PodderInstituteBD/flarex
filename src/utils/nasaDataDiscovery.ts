import type {
  DossierReferenceItem,
  InvestigationRecord,
  OfficialResourceLink,
} from '../types/research.ts';
import {
  buildDiscoveryIndex,
  DiscoveryResourceItem,
  NasaRepositoryId,
} from './discoveryEngine.ts';
import type { IngestedDatasetPackage } from './scientificIngestion.ts';
import type { LinkCheckState } from './sourceVerification.ts';

export type NasaAvailabilityStage10 =
  | 'SOURCE_DISCOVERED'
  | 'METADATA_AVAILABLE'
  | 'DOWNLOAD_AVAILABLE'
  | 'FILE_RETRIEVED'
  | 'FILE_STRUCTURE_VALIDATED'
  | 'DATA_IMPORTED'
  | 'ANALYSIS_READY'
  | 'ACCESS_RESTRICTED'
  | 'SOURCE_UNAVAILABLE'
  | 'MANUAL_REVIEW_REQUIRED';

export type DetectedFileFormat =
  | 'CSV'
  | 'TSV'
  | 'TXT'
  | 'JSON'
  | 'XML'
  | 'PDF'
  | 'HTML_PORTAL'
  | 'UNKNOWN';

export interface UnifiedDiscoveryItem2 {
  id: string;
  title: string;
  organization: string;
  repository: NasaRepositoryId;
  repositoryLabel: string;
  url: string;
  investigationId: string | null;
  investigationShortName: string;
  psiId: string | null;
  ntrsId: string | null;
  doi: string | null;
  detectedFormat: DetectedFileFormat;
  stage10: NasaAvailabilityStage10;
  stage10Label: string;
  stage10Detail: string;
  directDownloadable: boolean;
  requiresPortalAuth: boolean;
  lastCheckedAt: string | null;
  retrievedAt: string | null;
  knownLimitation: string;
}

export const STAGE10_META: Record<
  NasaAvailabilityStage10,
  {
    label: string;
    tone: 'success' | 'cyan' | 'blue' | 'violet' | 'warning' | 'danger' | 'neutral';
    order: number;
  }
> = {
  ANALYSIS_READY: { label: 'ANALYSIS READY', tone: 'success', order: 7 },
  DATA_IMPORTED: { label: 'DATA IMPORTED', tone: 'success', order: 6 },
  FILE_STRUCTURE_VALIDATED: { label: 'FILE STRUCTURE VALIDATED', tone: 'blue', order: 5 },
  FILE_RETRIEVED: { label: 'FILE RETRIEVED', tone: 'cyan', order: 4 },
  DOWNLOAD_AVAILABLE: { label: 'DOWNLOAD AVAILABLE', tone: 'cyan', order: 3 },
  METADATA_AVAILABLE: { label: 'METADATA AVAILABLE', tone: 'blue', order: 2 },
  SOURCE_DISCOVERED: { label: 'SOURCE DISCOVERED', tone: 'neutral', order: 1 },
  ACCESS_RESTRICTED: { label: 'ACCESS RESTRICTED', tone: 'warning', order: 8 },
  MANUAL_REVIEW_REQUIRED: { label: 'MANUAL REVIEW REQUIRED', tone: 'warning', order: 9 },
  SOURCE_UNAVAILABLE: { label: 'SOURCE UNAVAILABLE', tone: 'danger', order: 10 },
};

export function detectResourceFileFormat(url: string): DetectedFileFormat {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.tsv')) return 'TSV';
  if (lower.endsWith('.txt')) return 'TXT';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.xml')) return 'XML';
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.includes('ntrs.nasa.gov/api/citations/') && lower.includes('/downloads/')) {
    return 'TXT';
  }
  if (
    lower.includes('psi.nasa.gov') ||
    lower.includes('osdr.nasa.gov') ||
    lower.includes('ntrs.nasa.gov/citations/') ||
    lower.includes('doi.org')
  ) {
    return 'HTML_PORTAL';
  }
  return 'UNKNOWN';
}

export interface LiveDiscoveryContext {
  linkChecks?: Record<string, LinkCheckState>;
  retrievedUrls?: Record<string, string>;
  ingestedDatasets?: IngestedDatasetPackage[];
  validatedDatasetIds?: ReadonlySet<string>;
  analysisReadyDatasetIds?: ReadonlySet<string>;
  fetchedNtrsIds?: ReadonlySet<number>;
  awsS3Verified?: boolean;
}

export function classifyResourceAvailability10(
  item: DiscoveryResourceItem,
  ctx: LiveDiscoveryContext = {}
): {
  stage10: NasaAvailabilityStage10;
  stage10Label: string;
  stage10Detail: string;
  detectedFormat: DetectedFileFormat;
  directDownloadable: boolean;
  requiresPortalAuth: boolean;
  lastCheckedAt: string | null;
  retrievedAt: string | null;
} {
  const url = item.url;
  const detectedFormat = detectResourceFileFormat(url);
  const linkCheck = ctx.linkChecks?.[url];
  const lastCheckedAt = linkCheck?.checkedAt ?? null;
  const retrievedAt = ctx.retrievedUrls?.[url] ?? null;

  const isLocalAsset = url.startsWith('/assets/');
  const isPsiPortal = /psi\.nasa\.gov/i.test(url) && !/registry\.opendata\.aws/i.test(url);
  const isAwsOpen = /registry\.opendata\.aws|nasa-psi\.s3/i.test(url);
  const ntrsNum = item.ntrsId ? Number(item.ntrsId) : null;
  const hasPublicNtrsTxt =
    Boolean(item.ntrsId && /^(20160000593|20180005168)$/.test(item.ntrsId)) ||
    Boolean(ntrsNum && ctx.fetchedNtrsIds?.has(ntrsNum));

  // Check if matching imported dataset exists
  const matchingDataset = (ctx.ingestedDatasets ?? []).find(
    (ds) =>
      ds.provenance.sourceUrl === url ||
      (item.investigationId && ds.provenance.investigationId === item.investigationId)
  );

  if (matchingDataset) {
    const id = matchingDataset.provenance.datasetId;
    if (ctx.analysisReadyDatasetIds?.has(id)) {
      return {
        stage10: 'ANALYSIS_READY',
        stage10Label: STAGE10_META.ANALYSIS_READY.label,
        stage10Detail: `Imported dataset "${matchingDataset.provenance.originalFilename}" passed validation checks and is analysis-ready.`,
        detectedFormat: matchingDataset.provenance.format,
        directDownloadable: true,
        requiresPortalAuth: false,
        lastCheckedAt,
        retrievedAt: matchingDataset.provenance.retrievalDate,
      };
    }
    if (ctx.validatedDatasetIds?.has(id)) {
      return {
        stage10: 'FILE_STRUCTURE_VALIDATED',
        stage10Label: STAGE10_META.FILE_STRUCTURE_VALIDATED.label,
        stage10Detail: `Tabular structure validated for "${matchingDataset.provenance.originalFilename}".`,
        detectedFormat: matchingDataset.provenance.format,
        directDownloadable: true,
        requiresPortalAuth: false,
        lastCheckedAt,
        retrievedAt: matchingDataset.provenance.retrievalDate,
      };
    }
    return {
      stage10: 'DATA_IMPORTED',
      stage10Label: STAGE10_META.DATA_IMPORTED.label,
      stage10Detail: `Dataset "${matchingDataset.provenance.originalFilename}" (${matchingDataset.summary.rowCount} rows) imported into FLAREX session.`,
      detectedFormat: matchingDataset.provenance.format,
      directDownloadable: true,
      requiresPortalAuth: false,
      lastCheckedAt,
      retrievedAt: matchingDataset.provenance.retrievalDate,
    };
  }

  if (retrievedAt) {
    return {
      stage10: 'FILE_RETRIEVED',
      stage10Label: STAGE10_META.FILE_RETRIEVED.label,
      stage10Detail: `File payload retrieved in session at ${retrievedAt}.`,
      detectedFormat,
      directDownloadable: true,
      requiresPortalAuth: false,
      lastCheckedAt,
      retrievedAt,
    };
  }

  if (linkCheck && !linkCheck.checking && !linkCheck.ok) {
    if (linkCheck.status === 401 || linkCheck.status === 403) {
      return {
        stage10: 'ACCESS_RESTRICTED',
        stage10Label: STAGE10_META.ACCESS_RESTRICTED.label,
        stage10Detail: `HTTP ${linkCheck.status} restricted automated access; manual browser review or login required.`,
        detectedFormat,
        directDownloadable: false,
        requiresPortalAuth: true,
        lastCheckedAt,
        retrievedAt: null,
      };
    }
    return {
      stage10: 'SOURCE_UNAVAILABLE',
      stage10Label: STAGE10_META.SOURCE_UNAVAILABLE.label,
      stage10Detail: linkCheck.status
        ? `Upstream check returned HTTP ${linkCheck.status}.`
        : linkCheck.note || 'Upstream source timed out or unreachable.',
      detectedFormat,
      directDownloadable: false,
      requiresPortalAuth: isPsiPortal,
      lastCheckedAt,
      retrievedAt: null,
    };
  }

  if (isLocalAsset || hasPublicNtrsTxt || detectedFormat === 'CSV' || detectedFormat === 'TSV' || detectedFormat === 'JSON') {
    return {
      stage10: 'DOWNLOAD_AVAILABLE',
      stage10Label: STAGE10_META.DOWNLOAD_AVAILABLE.label,
      stage10Detail: isLocalAsset
        ? 'Local workspace dossier asset readable directly without authentication.'
        : 'Public downloadable artifact / NTRS ASCII manuscript accessible via verified endpoint.',
      detectedFormat,
      directDownloadable: true,
      requiresPortalAuth: false,
      lastCheckedAt,
      retrievedAt: null,
    };
  }

  if (isPsiPortal) {
    return {
      stage10: 'MANUAL_REVIEW_REQUIRED',
      stage10Label: STAGE10_META.MANUAL_REVIEW_REQUIRED.label,
      stage10Detail:
        'NASA PSI portal hosts experiment descriptions & links; bulk combustion CSV/video bundles often require interactive portal navigation/authentication.',
      detectedFormat,
      directDownloadable: false,
      requiresPortalAuth: true,
      lastCheckedAt,
      retrievedAt: null,
    };
  }

  if (
    linkCheck?.ok ||
    item.ntrsId ||
    isAwsOpen ||
    item.doi ||
    item.repository === 'NASA_NTRS' ||
    item.repository === 'NASA_OSDR'
  ) {
    return {
      stage10: 'METADATA_AVAILABLE',
      stage10Label: STAGE10_META.METADATA_AVAILABLE.label,
      stage10Detail:
        linkCheck?.ok
          ? `Live HTTP ${linkCheck.status ?? 200} confirmed endpoint metadata reachability (HTTP 200 never implies bulk telemetry download).`
          : 'Structured citation/accession metadata available via official repository API or DOI resolver.',
      detectedFormat,
      directDownloadable: isAwsOpen,
      requiresPortalAuth: false,
      lastCheckedAt,
      retrievedAt: null,
    };
  }

  return {
    stage10: 'SOURCE_DISCOVERED',
    stage10Label: STAGE10_META.SOURCE_DISCOVERED.label,
    stage10Detail: 'Indexed external reference; run live availability check or open citation portal.',
    detectedFormat,
    directDownloadable: false,
    requiresPortalAuth: false,
    lastCheckedAt,
    retrievedAt: null,
  };
}

export function buildUnifiedDiscovery2(
  investigations: InvestigationRecord[],
  officialResources: OfficialResourceLink[],
  dossierReferences: DossierReferenceItem[],
  ctx: LiveDiscoveryContext = {}
): UnifiedDiscoveryItem2[] {
  const base = buildDiscoveryIndex(investigations, officialResources, dossierReferences);

  return base.map((item) => {
    const stage = classifyResourceAvailability10(item, ctx);
    const org =
      item.repository === 'PEER_REVIEWED_JOURNAL'
        ? item.repositoryLabel
        : item.repository === 'LOCAL_DOSSIER'
        ? 'FLAREX Curated Dossier'
        : 'NASA';

    return {
      id: item.id,
      title: item.title,
      organization: org,
      repository: item.repository,
      repositoryLabel: item.repositoryLabel,
      url: item.url,
      investigationId: item.investigationId,
      investigationShortName: item.investigationShortName,
      psiId: item.psiId,
      ntrsId: item.ntrsId,
      doi: item.doi,
      ...stage,
      knownLimitation: stage.requiresPortalAuth
        ? 'NASA PSI raw telemetry packages cannot be auto-downloaded unauthenticated from server proxy; verify AWS Open Data or download manually via browser.'
        : 'Metadata & citation records alone do not supply raw sensor time-series CSV rows.',
    };
  });
}

export function summarizeDiscoveryStages(items: UnifiedDiscoveryItem2[]) {
  const counts: Record<NasaAvailabilityStage10, number> = {
    SOURCE_DISCOVERED: 0,
    METADATA_AVAILABLE: 0,
    DOWNLOAD_AVAILABLE: 0,
    FILE_RETRIEVED: 0,
    FILE_STRUCTURE_VALIDATED: 0,
    DATA_IMPORTED: 0,
    ANALYSIS_READY: 0,
    ACCESS_RESTRICTED: 0,
    SOURCE_UNAVAILABLE: 0,
    MANUAL_REVIEW_REQUIRED: 0,
  };
  for (const it of items) {
    counts[it.stage10] += 1;
  }
  return counts;
}
