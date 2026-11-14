export type EvidenceType =
  | 'RAW DATA'
  | 'PEER-REVIEWED PAPER'
  | 'NASA INVESTIGATION DESCRIPTION'
  | 'PRESENTATION / ABSTRACT'
  | 'REVIEW PAPER'
  | 'COMPLEMENTARY TERRESTRIAL RESEARCH';

export type RecordCategory =
  | 'NASA_INVESTIGATION'
  | 'REVIEW_PAPER'
  | 'COMPLEMENTARY_TERRESTRIAL';

export type DataAvailabilityStatus =
  | 'PUBLIC_IN_PSI'
  | 'PARTIAL_OR_NTRS'
  | 'ARCHIVED_OR_CONDITIONAL'
  | 'PLANNED_NO_PUBLIC_DATA'
  | 'TERRESTRIAL_LAB_ONLY';

export type QuantitativeKind =
  | 'EXPERIMENTAL_CONDITION_RANGE'
  | 'PUBLISHED_TEST_COUNT'
  | 'PUBLISHED_THRESHOLD'
  | 'PUBLISHED_COMPARISON';

export interface QuantitativeDatum {
  id: string;
  label: string;
  kind: QuantitativeKind;
  valueDisplay: string;
  min?: number;
  max?: number;
  numericValue?: number;
  unit: string;
  conditionContext: string;
  sourceCitation: string;
  qualityNote: string;
}

export interface SecondarySourceLink {
  label: string;
  url: string;
}

export interface PublicationCitation {
  title: string;
  journal: string;
  date: string;
  doi: string;
}

export interface ChallengeContextData {
  fireSafetyCategories: string[];
  hardwareMapping: Array<{ label: string; description: string }>;
  atmosphereContext: Array<{ context: string; details: string }>;
  partialGravityCaveat: string;
  scopeExclusion: string;
  importantNote: string;
}

export interface InvestigationRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  family: string;
  recordCategory: RecordCategory;
  evidenceType: EvidenceType;
  evidenceTypes: EvidenceType[];
  platform: string;
  gravityContext: 'Microgravity' | 'Terrestrial Ground Lab' | 'Multi-Archive Literature Review';
  isMicrogravity: boolean;
  isPlannedOrOngoing: boolean;
  timeframe: string;
  startYear: number | null;
  endYear: number | null;
  dataAvailability: DataAvailabilityStatus;
  dataAvailabilityLabel: string;
  hasQuantitativeSummary: boolean;
  hasRawNumericalDataset: boolean;
  psiId: string | null;
  doi: string | null;
  principalInvestigator?: string | null;
  authors?: string[];
  ntrsDocumentId?: string | null;
  reportNumber?: string | null;
  publicationDate?: string | null;
  publications?: PublicationCitation[];
  historicalNotes?: string[];
  sourceUrl: string;
  secondaryUrls: SecondarySourceLink[];
  sourceLabel: string;
  overview: string;
  scientificPurpose: string | null;
  background: string | null;
  fuels: string[];
  materialsAndGeometry: string | null;
  environmentalVariables: string[];
  sensors: string[];
  hardware: string | null;
  measurementMethods: string | null;
  reportedFindings: string | null;
  scientificRelevance: string | null;
  limitations: string[];
  quantitativeData: QuantitativeDatum[];
  tags: string[];
}

export interface ResearchGapRecord {
  id: string;
  title: string;
  area: string;
  description: string;
  relatedInvestigationIds: string[];
  supportingSources: string[];
  whyItMatters: string;
  evidenceStrength: 'Strong Dossier Documentation' | 'Moderate / Emerging Evidence' | 'Active Data Gap (Pending Flight Data)';
  limitations: string[];
  isAiSynthesis: boolean;
}

export interface OfficialResourceLink {
  id: string;
  name: string;
  shortName: string;
  url: string;
  apiUrl?: string;
  role: string;
  distinctionNote: string;
  accessType: string;
}

export interface DossierReferenceItem {
  id: string;
  citation: string;
  sourceCategory: string;
  relatedInvestigationId: string | null;
}
