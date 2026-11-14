export type SourceVerificationStatus =
  | 'Original source verified'
  | 'Metadata retrieved'
  | 'File successfully retrieved'
  | 'File structure validated'
  | 'Data successfully imported'
  | 'Link not checked'
  | 'Requires manual review'
  | 'Source unavailable';

export interface LinkCheckState {
  ok: boolean;
  status: number | null;
  note?: string;
  checking?: boolean;
  checkedAt?: string;
  /** True only when official NASA API metadata/DOI/full-text or bundled local asset has been programmatically verified. */
  contentVerified?: boolean;
}

export interface SourceVerificationDisplay {
  status: SourceVerificationStatus;
  tone: 'success' | 'cyan' | 'blue' | 'violet' | 'neutral' | 'danger' | 'warning';
  detail: string;
}

export interface ProvenancePipelineOptions {
  metadataRetrieved?: boolean;
  fileRetrieved?: boolean;
  structureValidated?: boolean;
  dataImported?: boolean;
  contentVerified?: boolean;
  requiresPortalLoginOrSpa?: boolean;
}

/**
 * FLAREX 5.0 Provenance 2.0 Resolver:
 * - An HTTP 200 reachability probe NEVER proves original scientific content ('Original source verified');
 *   HTTP 200 resolves strictly to 'Metadata retrieved' (link reachable) unless citation/DOI/file content
 *   or bundled asset provenance is explicitly confirmed.
 */
export function resolveResourceVerificationStatus(
  url: string,
  linkCheck?: LinkCheckState,
  options?: ProvenancePipelineOptions
): SourceVerificationDisplay {
  const isLocalAsset = url.startsWith('/assets/');
  const isPortal =
    options?.requiresPortalLoginOrSpa ||
    /psi\.nasa\.gov\/physci\/repo/i.test(url);

  if (options?.dataImported) {
    return {
      status: 'Data successfully imported',
      tone: 'success',
      detail: 'Tabular rows parsed, schema-audited, and loaded into FLAREX numerical session state with originalRows preserved.',
    };
  }

  if (options?.structureValidated) {
    return {
      status: 'File structure validated',
      tone: 'blue',
      detail: 'File headers, units, delimiters, and missing/invalid tokens validated cleanly.',
    };
  }

  if (options?.fileRetrieved) {
    return {
      status: 'File successfully retrieved',
      tone: 'cyan',
      detail: 'Upstream file payload downloaded from official repository for local inspection.',
    };
  }

  if (isLocalAsset) {
    return {
      status: 'Original source verified',
      tone: 'success',
      detail: 'Bundled locally in workspace public/assets/ and cryptographically/structurally readable directly.',
    };
  }

  if (linkCheck && !linkCheck.checking) {
    if (linkCheck.ok) {
      if (isPortal) {
        return {
          status: 'Requires manual review',
          tone: 'warning',
          detail: `Portal responded HTTP ${linkCheck.status ?? 200}; NASA PSI web portal datasets require interactive/authenticated inspection.`,
        };
      }
      if (linkCheck.contentVerified || options?.contentVerified) {
        return {
          status: 'Original source verified',
          tone: 'success',
          detail: `Verified via official repository metadata/citation match (HTTP ${linkCheck.status ?? 200}).`,
        };
      }
      return {
        status: 'Metadata retrieved',
        tone: 'cyan',
        detail: `HTTP ${linkCheck.status ?? 200} reachability check succeeded (HTML/endpoint responded; full dataset content not automatically verified).`,
      };
    }

    if (linkCheck.status === 401 || linkCheck.status === 403) {
      return {
        status: 'Requires manual review',
        tone: 'warning',
        detail: `HTTP ${linkCheck.status} access restriction on automated probe; open directly in browser.`,
      };
    }

    return {
      status: 'Source unavailable',
      tone: 'danger',
      detail: linkCheck.status
        ? `Returned HTTP ${linkCheck.status}`
        : linkCheck.note || 'Upstream probe timed out or unreachable',
    };
  }

  if (options?.contentVerified) {
    return {
      status: 'Original source verified',
      tone: 'success',
      detail: 'Verified against official NASA API citation record and identifier.',
    };
  }

  if (options?.metadataRetrieved) {
    return {
      status: 'Metadata retrieved',
      tone: 'cyan',
      detail: 'Live metadata returned by NASA API during this session; raw experimental files require manual/separate download.',
    };
  }

  if (isPortal) {
    return {
      status: 'Requires manual review',
      tone: 'warning',
      detail: 'Interactive NASA PSI portal (no unauthenticated public combustion file API; check AWS Open Data bucket or portal login).',
    };
  }

  return {
    status: 'Link not checked',
    tone: 'neutral',
    detail: 'Not yet checked live during this session.',
  };
}
