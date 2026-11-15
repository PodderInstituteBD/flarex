import type { InvestigationRecord, OfficialResourceLink } from '../types/research.ts';
import type { NasaAvailabilityStage10, UnifiedDiscoveryItem2 } from './nasaDataDiscovery.ts';

export type SourceRetrievalMethod =
  | 'NASA NTRS Public REST API'
  | 'NASA PSI AWS S3 ListObjectsV2'
  | 'NASA OSDR Public Search API'
  | 'HTTP HEAD/GET Availability Probe'
  | 'Manual Authenticated Portal Navigation'
  | 'Bundled Workspace File';

export interface SourceTransparencyRecord {
  id: string;
  sourceName: string;
  organization: string;
  url: string;
  resourceType:
    | 'Portal'
    | 'Technical Report / Manuscript'
    | 'Peer-Reviewed Journal'
    | 'Open Data Bucket'
    | 'Bundled Dossier';
  retrievalMethod: SourceRetrievalMethod;
  availabilityStatus: NasaAvailabilityStage10;
  lastCheckedTimestamp: string | null;
  metadataStatus: 'Retrieved' | 'Curated Static' | 'Not Checked';
  fileRetrievalStatus: 'Retrieved' | 'Public Downloadable' | 'Gated / Manual Only';
  validationStatus: 'Validated' | 'Not Validated' | 'Failed';
  accessRestrictions: string;
  knownLimitations: string;
}

export interface SourceCheckHistoryEntry {
  id: string;
  sourceName: string;
  url: string;
  method: string;
  httpStatus: number | null;
  resultingStage: NasaAvailabilityStage10;
  checkedAt: string;
  note: string;
}

export function buildSourceTransparencyRegistry(input: {
  discoveryItems: UnifiedDiscoveryItem2[];
  officialResources?: OfficialResourceLink[];
  investigations?: InvestigationRecord[];
}): SourceTransparencyRecord[] {
  const out: SourceTransparencyRecord[] = [];
  const seenUrls = new Set<string>();

  for (const item of input.discoveryItems) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);

    const isLocal = item.url.startsWith('/assets/');
    const isAws = /opendata\.aws|s3\.us-west-2/i.test(item.url);
    const isOsdr = /osdr\.nasa\.gov/i.test(item.url);
    const isNtrs = /ntrs\.nasa\.gov/i.test(item.url);
    const isPsi = /psi\.nasa\.gov/i.test(item.url);

    const retrievalMethod: SourceRetrievalMethod = isLocal
      ? 'Bundled Workspace File'
      : isAws
      ? 'NASA PSI AWS S3 ListObjectsV2'
      : isOsdr
      ? 'NASA OSDR Public Search API'
      : isNtrs
      ? 'NASA NTRS Public REST API'
      : isPsi
      ? 'Manual Authenticated Portal Navigation'
      : 'HTTP HEAD/GET Availability Probe';

    const resourceType: SourceTransparencyRecord['resourceType'] = isLocal
      ? 'Bundled Dossier'
      : isAws
      ? 'Open Data Bucket'
      : item.repository === 'PEER_REVIEWED_JOURNAL'
      ? 'Peer-Reviewed Journal'
      : isPsi
      ? 'Portal'
      : 'Technical Report / Manuscript';

    out.push({
      id: item.id,
      sourceName: item.title,
      organization: item.organization,
      url: item.url,
      resourceType,
      retrievalMethod,
      availabilityStatus: item.stage10,
      lastCheckedTimestamp: item.lastCheckedAt,
      metadataStatus:
        item.lastCheckedAt || item.ntrsId || item.doi ? 'Retrieved' : 'Curated Static',
      fileRetrievalStatus:
        item.stage10 === 'FILE_RETRIEVED' ||
        item.stage10 === 'DATA_IMPORTED' ||
        item.stage10 === 'ANALYSIS_READY'
          ? 'Retrieved'
          : item.directDownloadable
          ? 'Public Downloadable'
          : 'Gated / Manual Only',
      validationStatus:
        item.stage10 === 'ANALYSIS_READY' || item.stage10 === 'FILE_STRUCTURE_VALIDATED'
          ? 'Validated'
          : item.stage10 === 'SOURCE_UNAVAILABLE'
          ? 'Failed'
          : 'Not Validated',
      accessRestrictions: item.requiresPortalAuth
        ? 'Requires NASA PSI portal web navigation or authenticated user session for raw experiment archives.'
        : 'Publicly accessible over HTTPS or bundled directly.',
      knownLimitations: item.knownLimitation,
    });
  }

  return out;
}

export function appendSourceCheckHistory(
  history: SourceCheckHistoryEntry[],
  entry: Omit<SourceCheckHistoryEntry, 'id'>
): SourceCheckHistoryEntry[] {
  const item: SourceCheckHistoryEntry = {
    id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
  };
  return [item, ...history].slice(0, 60);
}
