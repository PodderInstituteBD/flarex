export interface SavedComparisonEntry {
  id: string;
  title: string;
  investigationIds: string[];
  createdAt: string;
}

export interface BookmarkedSourceEntry {
  id: string;
  title: string;
  url: string;
  repository: string;
  investigationId: string | null;
  savedAt: string;
}

export interface ResearchNoteEntry {
  id: string;
  targetType: 'investigation' | 'source' | 'general';
  targetId: string;
  targetTitle: string;
  content: string;
  updatedAt: string;
}

export interface ResearchCollection {
  id: string;
  name: string;
  description: string;
  investigationIds: string[];
  createdAt: string;
}

export interface SavedResearchQuestionEntry {
  id: string;
  question: string;
  classificationLabel: string;
  savedAt: string;
}

export interface SavedResearchBriefEntry {
  id: string;
  title: string;
  question: string;
  markdown: string;
  sourceCount: number;
  createdAt: string;
}

export interface SavedEvidenceEntry {
  evidenceId: string;
  investigationId: string;
  investigationShortName: string;
  category: string;
  summary: string;
  sourceUrl: string;
  savedAt: string;
}

export interface SavedReportEntry {
  id: string;
  title: string;
  reportType: string;
  markdown: string;
  createdAt: string;
}

export interface ResearchWorkspaceState {
  version: 1;
  savedInvestigationIds: string[];
  bookmarkedSources: BookmarkedSourceEntry[];
  savedComparisons: SavedComparisonEntry[];
  notes: ResearchNoteEntry[];
  collections: ResearchCollection[];
  savedQuestions: SavedResearchQuestionEntry[];
  savedBriefs: SavedResearchBriefEntry[];
  savedEvidence: SavedEvidenceEntry[];
  savedReports: SavedReportEntry[];
}

export const WORKSPACE_STORAGE_KEY = 'flarex_workspace_v1';

export function createEmptyWorkspace(): ResearchWorkspaceState {
  return {
    version: 1,
    savedInvestigationIds: ['bass-ii', 'saffire'],
    bookmarkedSources: [],
    savedComparisons: [],
    notes: [],
    collections: [
      {
        id: 'col-artemis-baseline',
        name: 'Exploration Habitat Baseline',
        description: 'Key solid-fuel, enclosure, and planned SoFIE studies for reduced-pressure cabin reviews.',
        investigationIds: ['bass-ii', 'saffire', 'confined-combustion', 'sofie-mist'],
        createdAt: new Date().toISOString(),
      },
    ],
    savedQuestions: [],
    savedBriefs: [],
    savedEvidence: [],
    savedReports: [],
  };
}

export function sanitizeWorkspaceState(
  raw: unknown,
  validInvestigationIds?: ReadonlySet<string>
): ResearchWorkspaceState {
  const empty = createEmptyWorkspace();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;

  const savedInvestigationIds = Array.isArray(obj.savedInvestigationIds)
    ? obj.savedInvestigationIds.filter(
        (id): id is string =>
          typeof id === 'string' &&
          (!validInvestigationIds || validInvestigationIds.has(id))
      )
    : empty.savedInvestigationIds;

  const bookmarkedSources = Array.isArray(obj.bookmarkedSources)
    ? obj.bookmarkedSources.filter(
        (b): b is BookmarkedSourceEntry =>
          Boolean(b) &&
          typeof b === 'object' &&
          typeof (b as BookmarkedSourceEntry).id === 'string' &&
          typeof (b as BookmarkedSourceEntry).title === 'string' &&
          typeof (b as BookmarkedSourceEntry).url === 'string'
      )
    : [];

  const savedComparisons = Array.isArray(obj.savedComparisons)
    ? obj.savedComparisons.filter(
        (c): c is SavedComparisonEntry =>
          Boolean(c) &&
          typeof c === 'object' &&
          typeof (c as SavedComparisonEntry).id === 'string' &&
          Array.isArray((c as SavedComparisonEntry).investigationIds)
      )
    : [];

  const notes = Array.isArray(obj.notes)
    ? obj.notes.filter(
        (n): n is ResearchNoteEntry =>
          Boolean(n) &&
          typeof n === 'object' &&
          typeof (n as ResearchNoteEntry).id === 'string' &&
          typeof (n as ResearchNoteEntry).content === 'string'
      )
    : [];

  const collections = Array.isArray(obj.collections)
    ? obj.collections.filter(
        (col): col is ResearchCollection =>
          Boolean(col) &&
          typeof col === 'object' &&
          typeof (col as ResearchCollection).id === 'string' &&
          typeof (col as ResearchCollection).name === 'string' &&
          Array.isArray((col as ResearchCollection).investigationIds)
      )
    : empty.collections;

  const savedQuestions = Array.isArray(obj.savedQuestions)
    ? obj.savedQuestions.filter(
        (q): q is SavedResearchQuestionEntry =>
          Boolean(q) &&
          typeof q === 'object' &&
          typeof (q as SavedResearchQuestionEntry).id === 'string' &&
          typeof (q as SavedResearchQuestionEntry).question === 'string'
      )
    : [];

  const savedBriefs = Array.isArray(obj.savedBriefs)
    ? obj.savedBriefs.filter(
        (b): b is SavedResearchBriefEntry =>
          Boolean(b) &&
          typeof b === 'object' &&
          typeof (b as SavedResearchBriefEntry).id === 'string' &&
          typeof (b as SavedResearchBriefEntry).markdown === 'string'
      )
    : [];

  const savedEvidence = Array.isArray(obj.savedEvidence)
    ? obj.savedEvidence.filter(
        (ev): ev is SavedEvidenceEntry =>
          Boolean(ev) &&
          typeof ev === 'object' &&
          typeof (ev as SavedEvidenceEntry).evidenceId === 'string' &&
          typeof (ev as SavedEvidenceEntry).summary === 'string'
      )
    : [];

  const savedReports = Array.isArray(obj.savedReports)
    ? obj.savedReports.filter(
        (r): r is SavedReportEntry =>
          Boolean(r) &&
          typeof r === 'object' &&
          typeof (r as SavedReportEntry).id === 'string' &&
          typeof (r as SavedReportEntry).markdown === 'string'
      )
    : [];

  return {
    version: 1,
    savedInvestigationIds,
    bookmarkedSources,
    savedComparisons,
    notes,
    collections,
    savedQuestions,
    savedBriefs,
    savedEvidence,
    savedReports,
  };
}

export function loadWorkspaceFromStorage(
  validInvestigationIds?: ReadonlySet<string>
): ResearchWorkspaceState {
  try {
    if (typeof window === 'undefined') return createEmptyWorkspace();
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return createEmptyWorkspace();
    return sanitizeWorkspaceState(JSON.parse(raw), validInvestigationIds);
  } catch {
    return createEmptyWorkspace();
  }
}

export function saveWorkspaceToStorage(state: ResearchWorkspaceState): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function toggleSavedInvestigation(
  state: ResearchWorkspaceState,
  investigationId: string
): ResearchWorkspaceState {
  const exists = state.savedInvestigationIds.includes(investigationId);
  return {
    ...state,
    savedInvestigationIds: exists
      ? state.savedInvestigationIds.filter((id) => id !== investigationId)
      : [investigationId, ...state.savedInvestigationIds],
  };
}

export function toggleBookmarkedSource(
  state: ResearchWorkspaceState,
  entry: Omit<BookmarkedSourceEntry, 'savedAt'>
): ResearchWorkspaceState {
  const exists = state.bookmarkedSources.some((b) => b.url === entry.url);
  return {
    ...state,
    bookmarkedSources: exists
      ? state.bookmarkedSources.filter((b) => b.url !== entry.url)
      : [{ ...entry, savedAt: new Date().toISOString() }, ...state.bookmarkedSources],
  };
}

export function addSavedComparison(
  state: ResearchWorkspaceState,
  title: string,
  investigationIds: string[]
): ResearchWorkspaceState {
  if (investigationIds.length < 2) return state;
  const entry: SavedComparisonEntry = {
    id: `cmp-${Date.now()}`,
    title: title.trim() || `Comparison (${investigationIds.length} studies)`,
    investigationIds: [...investigationIds],
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    savedComparisons: [entry, ...state.savedComparisons].slice(0, 25),
  };
}

export function deleteSavedComparison(
  state: ResearchWorkspaceState,
  comparisonId: string
): ResearchWorkspaceState {
  return {
    ...state,
    savedComparisons: state.savedComparisons.filter((c) => c.id !== comparisonId),
  };
}

export function upsertResearchNote(
  state: ResearchWorkspaceState,
  note: Omit<ResearchNoteEntry, 'id' | 'updatedAt'> & { id?: string }
): ResearchWorkspaceState {
  const now = new Date().toISOString();
  const id = note.id ?? `note-${Date.now()}`;
  const existingIdx = state.notes.findIndex((n) => n.id === id);
  const nextNote: ResearchNoteEntry = {
    id,
    targetType: note.targetType,
    targetId: note.targetId,
    targetTitle: note.targetTitle,
    content: note.content,
    updatedAt: now,
  };
  const nextNotes =
    existingIdx >= 0
      ? state.notes.map((n, idx) => (idx === existingIdx ? nextNote : n))
      : [nextNote, ...state.notes];
  return { ...state, notes: nextNotes };
}

export function deleteResearchNote(
  state: ResearchWorkspaceState,
  noteId: string
): ResearchWorkspaceState {
  return {
    ...state,
    notes: state.notes.filter((n) => n.id !== noteId),
  };
}

export function createCollection(
  state: ResearchWorkspaceState,
  name: string,
  description: string,
  investigationIds: string[]
): ResearchWorkspaceState {
  const clean = name.trim();
  if (!clean) return state;
  const next: ResearchCollection = {
    id: `col-${Date.now()}`,
    name: clean,
    description: description.trim(),
    investigationIds,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    collections: [next, ...state.collections],
  };
}

export function addInvestigationToCollection(
  state: ResearchWorkspaceState,
  collectionId: string,
  investigationId: string
): ResearchWorkspaceState {
  return {
    ...state,
    collections: state.collections.map((c) => {
      if (c.id !== collectionId) return c;
      if (c.investigationIds.includes(investigationId)) return c;
      return { ...c, investigationIds: [...c.investigationIds, investigationId] };
    }),
  };
}

export function deleteCollection(
  state: ResearchWorkspaceState,
  collectionId: string
): ResearchWorkspaceState {
  return {
    ...state,
    collections: state.collections.filter((c) => c.id !== collectionId),
  };
}

export function saveResearchQuestion(
  state: ResearchWorkspaceState,
  question: string,
  classificationLabel: string
): ResearchWorkspaceState {
  const clean = question.trim();
  if (!clean) return state;
  if (state.savedQuestions.some((q) => q.question.toLowerCase() === clean.toLowerCase())) {
    return state;
  }
  const entry: SavedResearchQuestionEntry = {
    id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    question: clean,
    classificationLabel,
    savedAt: new Date().toISOString(),
  };
  return {
    ...state,
    savedQuestions: [entry, ...state.savedQuestions].slice(0, 40),
  };
}

export function deleteResearchQuestion(
  state: ResearchWorkspaceState,
  id: string
): ResearchWorkspaceState {
  return {
    ...state,
    savedQuestions: state.savedQuestions.filter((q) => q.id !== id),
  };
}

export function saveResearchBrief(
  state: ResearchWorkspaceState,
  brief: Omit<SavedResearchBriefEntry, 'id' | 'createdAt'>
): ResearchWorkspaceState {
  const entry: SavedResearchBriefEntry = {
    id: `brief-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    title: brief.title.trim() || 'FLAREX Research Brief',
    question: brief.question,
    markdown: brief.markdown,
    sourceCount: brief.sourceCount,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    savedBriefs: [entry, ...state.savedBriefs].slice(0, 30),
  };
}

export function deleteResearchBrief(
  state: ResearchWorkspaceState,
  id: string
): ResearchWorkspaceState {
  return {
    ...state,
    savedBriefs: state.savedBriefs.filter((b) => b.id !== id),
  };
}

export function toggleSavedEvidence(
  state: ResearchWorkspaceState,
  item: Omit<SavedEvidenceEntry, 'savedAt'>
): ResearchWorkspaceState {
  const exists = state.savedEvidence.some((e) => e.evidenceId === item.evidenceId);
  return {
    ...state,
    savedEvidence: exists
      ? state.savedEvidence.filter((e) => e.evidenceId !== item.evidenceId)
      : [{ ...item, savedAt: new Date().toISOString() }, ...state.savedEvidence].slice(0, 60),
  };
}

export function deleteSavedEvidence(
  state: ResearchWorkspaceState,
  evidenceId: string
): ResearchWorkspaceState {
  return {
    ...state,
    savedEvidence: state.savedEvidence.filter((e) => e.evidenceId !== evidenceId),
  };
}

export function saveWorkspaceReport(
  state: ResearchWorkspaceState,
  report: Omit<SavedReportEntry, 'id' | 'createdAt'>
): ResearchWorkspaceState {
  const entry: SavedReportEntry = {
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    title: report.title,
    reportType: report.reportType,
    markdown: report.markdown,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    savedReports: [entry, ...state.savedReports].slice(0, 25),
  };
}

export function deleteWorkspaceReport(
  state: ResearchWorkspaceState,
  id: string
): ResearchWorkspaceState {
  return {
    ...state,
    savedReports: state.savedReports.filter((r) => r.id !== id),
  };
}

export function exportWorkspaceBundle(state: ResearchWorkspaceState): string {
  return JSON.stringify(
    {
      platform: 'FLAREX 6.0 — Research Workspace Backup',
      exportedAt: new Date().toISOString(),
      workspace: state,
    },
    null,
    2
  );
}

export function importWorkspaceBundle(
  rawJson: string,
  validInvestigationIds?: ReadonlySet<string>
): { ok: boolean; state?: ResearchWorkspaceState; error?: string } {
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Imported JSON is not a valid object.' };
    }
    const candidate =
      parsed.workspace && typeof parsed.workspace === 'object'
        ? parsed.workspace
        : parsed;
    if (
      !('savedInvestigationIds' in (candidate as object)) &&
      !('notes' in (candidate as object)) &&
      !('savedBriefs' in (candidate as object))
    ) {
      return {
        ok: false,
        error: 'JSON file does not match a valid FLAREX workspace export structure.',
      };
    }
    const sanitized = sanitizeWorkspaceState(candidate, validInvestigationIds);
    return { ok: true, state: sanitized };
  } catch {
    return { ok: false, error: 'Invalid JSON syntax in workspace backup file.' };
  }
}

