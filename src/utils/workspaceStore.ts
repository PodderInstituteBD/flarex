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

export interface ResearchWorkspaceState {
  version: 1;
  savedInvestigationIds: string[];
  bookmarkedSources: BookmarkedSourceEntry[];
  savedComparisons: SavedComparisonEntry[];
  notes: ResearchNoteEntry[];
  collections: ResearchCollection[];
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

  return {
    version: 1,
    savedInvestigationIds,
    bookmarkedSources,
    savedComparisons,
    notes,
    collections,
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
