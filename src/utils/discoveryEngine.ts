import type {
  DataAvailabilityStatus,
  DossierReferenceItem,
  EvidenceType,
  InvestigationRecord,
  OfficialResourceLink,
} from '../types/research.ts';
import { computeCategoryBreakdown, DomainCategoryId } from './researchLogic.ts';

export type NasaRepositoryId =
  | 'NASA_PSI'
  | 'NASA_NTRS'
  | 'NASA_PSI_AWS'
  | 'NASA_OSDR'
  | 'PEER_REVIEWED_JOURNAL'
  | 'LOCAL_DOSSIER'
  | 'EXTERNAL_WORKSHOP';

export interface DiscoveryResourceItem {
  id: string;
  title: string;
  repository: NasaRepositoryId;
  repositoryLabel: string;
  investigationId: string | null;
  investigationShortName: string;
  researchCategory: DomainCategoryId | 'multi-domain';
  researchCategoryLabel: string;
  evidenceType: EvidenceType | 'OFFICIAL REPOSITORY PORTAL';
  dataAvailability: DataAvailabilityStatus | 'PORTAL_INDEX';
  dataAvailabilityLabel: string;
  publicationYear: number | null;
  publicationDateDisplay: string;
  authorsOrOrganization: string[];
  doi: string | null;
  psiId: string | null;
  ntrsId: string | null;
  url: string;
  summary: string;
}

export interface DiscoveryFilters {
  query: string;
  repository: NasaRepositoryId | 'ALL';
  category: DomainCategoryId | 'ALL';
  investigationId: string;
  year: string;
  evidenceType: string;
  dataAvailability: string;
}

export function inferRepositoryFromUrl(
  url: string,
  record?: InvestigationRecord
): { id: NasaRepositoryId; label: string } {
  const lower = url.toLowerCase();
  if (lower.includes('registry.opendata.aws/nasa-psi')) {
    return { id: 'NASA_PSI_AWS', label: 'NASA PSI AWS Open Data' };
  }
  if (lower.includes('psi.nasa.gov')) {
    return { id: 'NASA_PSI', label: 'NASA PSI' };
  }
  if (lower.includes('ntrs.nasa.gov')) {
    return { id: 'NASA_NTRS', label: 'NASA NTRS' };
  }
  if (lower.includes('osdr.nasa.gov')) {
    return { id: 'NASA_OSDR', label: 'NASA OSDR' };
  }
  if (lower.startsWith('/assets/')) {
    return { id: 'LOCAL_DOSSIER', label: 'Bundled FLAREX Dossier' };
  }
  if (
    lower.includes('doi.org') ||
    lower.includes('sciencedirect') ||
    record?.evidenceType === 'PEER-REVIEWED PAPER'
  ) {
    return { id: 'PEER_REVIEWED_JOURNAL', label: 'Peer-Reviewed / Partner' };
  }
  if (lower.includes('nasa.gov')) {
    return { id: 'NASA_PSI', label: 'NASA Mission / PSI Portal' };
  }
  return { id: 'EXTERNAL_WORKSHOP', label: 'External / Workshop Source' };
}

export function extractYearFromString(text?: string | null): number | null {
  if (!text) return null;
  const match = /\b(19\d{2}|20\d{2})\b/.exec(text);
  return match ? Number(match[1]) : null;
}

export function buildDiscoveryIndex(
  investigations: InvestigationRecord[],
  officialResources: OfficialResourceLink[],
  dossierReferences: DossierReferenceItem[]
): DiscoveryResourceItem[] {
  const catBreakdown = computeCategoryBreakdown(investigations);
  const categoryByInvId = new Map<string, { id: DomainCategoryId; label: string }>();
  for (const cat of catBreakdown) {
    for (const id of cat.recordIds) {
      if (!categoryByInvId.has(id)) {
        categoryByInvId.set(id, { id: cat.id, label: cat.label });
      }
    }
  }

  const items: DiscoveryResourceItem[] = [];
  const seenKey = new Set<string>();

  for (const rec of investigations) {
    const primaryCat = categoryByInvId.get(rec.id);
    const repo = inferRepositoryFromUrl(rec.sourceUrl, rec);
    const pubYear =
      extractYearFromString(rec.publicationDate) ?? rec.startYear ?? rec.endYear;
    const authors =
      rec.authors && rec.authors.length > 0
        ? rec.authors
        : rec.principalInvestigator
        ? [rec.principalInvestigator]
        : [rec.sourceLabel];

    const primaryKey = `${rec.id}|${rec.sourceUrl}`;
    if (!seenKey.has(primaryKey)) {
      seenKey.add(primaryKey);
      items.push({
        id: `disc-primary-${rec.id}`,
        title: `${rec.shortName}: ${rec.sourceLabel}`,
        repository: repo.id,
        repositoryLabel: repo.label,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        researchCategory: primaryCat?.id ?? 'fire-safety-modeling',
        researchCategoryLabel: primaryCat?.label ?? rec.family,
        evidenceType: rec.evidenceType,
        dataAvailability: rec.dataAvailability,
        dataAvailabilityLabel: rec.dataAvailabilityLabel,
        publicationYear: pubYear,
        publicationDateDisplay:
          rec.publicationDate || rec.timeframe || 'Not specified',
        authorsOrOrganization: authors,
        doi: rec.doi,
        psiId: rec.psiId,
        ntrsId: rec.ntrsDocumentId ?? null,
        url: rec.sourceUrl,
        summary: rec.overview,
      });
    }

    if (rec.publications) {
      for (const pub of rec.publications) {
        const pubUrl = `https://doi.org/${pub.doi}`;
        const key = `${rec.id}|${pubUrl}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        items.push({
          id: `disc-pub-${rec.id}-${pub.doi}`,
          title: pub.title,
          repository: 'PEER_REVIEWED_JOURNAL',
          repositoryLabel: pub.journal,
          investigationId: rec.id,
          investigationShortName: rec.shortName,
          researchCategory: primaryCat?.id ?? 'fire-safety-modeling',
          researchCategoryLabel: primaryCat?.label ?? rec.family,
          evidenceType: 'PEER-REVIEWED PAPER',
          dataAvailability: rec.dataAvailability,
          dataAvailabilityLabel: `Peer-reviewed publication (${rec.dataAvailabilityLabel})`,
          publicationYear: extractYearFromString(pub.date) ?? pubYear,
          publicationDateDisplay: pub.date,
          authorsOrOrganization: authors,
          doi: pub.doi,
          psiId: rec.psiId,
          ntrsId: rec.ntrsDocumentId ?? null,
          url: pubUrl,
          summary: `Published in ${pub.journal} supporting ${rec.name}.`,
        });
      }
    }

    for (const sec of rec.secondaryUrls) {
      const key = `${rec.id}|${sec.url}|${sec.label}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      const secRepo = inferRepositoryFromUrl(sec.url, rec);
      items.push({
        id: `disc-sec-${rec.id}-${items.length}`,
        title: `${rec.shortName} — ${sec.label}`,
        repository: secRepo.id,
        repositoryLabel: secRepo.label,
        investigationId: rec.id,
        investigationShortName: rec.shortName,
        researchCategory: primaryCat?.id ?? 'fire-safety-modeling',
        researchCategoryLabel: primaryCat?.label ?? rec.family,
        evidenceType: 'NASA INVESTIGATION DESCRIPTION',
        dataAvailability: rec.dataAvailability,
        dataAvailabilityLabel: rec.dataAvailabilityLabel,
        publicationYear: pubYear,
        publicationDateDisplay: rec.timeframe,
        authorsOrOrganization: authors,
        doi: rec.doi,
        psiId: rec.psiId,
        ntrsId: rec.ntrsDocumentId ?? null,
        url: sec.url,
        summary: `Secondary repository link for ${rec.shortName}: ${sec.label}.`,
      });
    }
  }

  for (const portal of officialResources) {
    const repo = inferRepositoryFromUrl(portal.url);
    items.push({
      id: `disc-portal-${portal.id}`,
      title: portal.name,
      repository: repo.id,
      repositoryLabel: portal.shortName,
      investigationId: null,
      investigationShortName: 'Multi-Investigation Archive',
      researchCategory: 'multi-domain',
      researchCategoryLabel: 'Official Repository & Dossier Assets',
      evidenceType: 'OFFICIAL REPOSITORY PORTAL',
      dataAvailability: 'PORTAL_INDEX',
      dataAvailabilityLabel: portal.accessType,
      publicationYear: null,
      publicationDateDisplay: 'Active Archive',
      authorsOrOrganization: ['NASA / Partner Curated Portal'],
      doi: null,
      psiId: null,
      ntrsId: null,
      url: portal.url,
      summary: `${portal.role} ${portal.distinctionNote}`,
    });
  }

  // Ensure dossier citation entries are searchable if not directly duplicated
  for (const dref of dossierReferences) {
    const rel = investigations.find((r) => r.id === dref.relatedInvestigationId);
    if (!rel) continue;
    const key = `dossier-${dref.id}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      items.push({
        id: `disc-${dref.id}`,
        title: dref.citation,
        repository: 'LOCAL_DOSSIER',
        repositoryLabel: 'Dossier Core Citation',
        investigationId: rel.id,
        investigationShortName: rel.shortName,
        researchCategory:
          categoryByInvId.get(rel.id)?.id ?? 'fire-safety-modeling',
        researchCategoryLabel:
          categoryByInvId.get(rel.id)?.label ?? rel.family,
        evidenceType: rel.evidenceType,
        dataAvailability: rel.dataAvailability,
        dataAvailabilityLabel: dref.sourceCategory,
        publicationYear:
          extractYearFromString(dref.citation) ?? rel.startYear,
        publicationDateDisplay:
          extractYearFromString(dref.citation)?.toString() ?? rel.timeframe,
        authorsOrOrganization: rel.authors ?? [rel.sourceLabel],
        doi: rel.doi,
        psiId: rel.psiId,
        ntrsId: rel.ntrsDocumentId ?? null,
        url: rel.sourceUrl,
        summary: `Core bibliographic entry (${dref.sourceCategory}) referencing ${rel.name}.`,
      });
    }
  }

  return items;
}

export function filterDiscoveryResources(
  items: DiscoveryResourceItem[],
  filters: DiscoveryFilters
): DiscoveryResourceItem[] {
  const q = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.repository !== 'ALL' && item.repository !== filters.repository) {
      return false;
    }
    if (filters.category !== 'ALL' && item.researchCategory !== filters.category) {
      return false;
    }
    if (
      filters.investigationId !== 'ALL' &&
      item.investigationId !== filters.investigationId
    ) {
      return false;
    }
    if (filters.year !== 'ALL') {
      if (String(item.publicationYear ?? '') !== filters.year) {
        return false;
      }
    }
    if (
      filters.evidenceType !== 'ALL' &&
      item.evidenceType !== filters.evidenceType
    ) {
      return false;
    }
    if (
      filters.dataAvailability !== 'ALL' &&
      item.dataAvailability !== filters.dataAvailability
    ) {
      return false;
    }
    if (!q) return true;

    const haystack = [
      item.title,
      item.repositoryLabel,
      item.investigationShortName,
      item.researchCategoryLabel,
      item.evidenceType,
      item.dataAvailabilityLabel,
      item.publicationDateDisplay,
      item.doi ?? '',
      item.psiId ?? '',
      item.ntrsId ?? '',
      item.url,
      item.summary,
      ...item.authorsOrOrganization,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
