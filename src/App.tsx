/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoTourModal } from './components/DemoTourModal';
import { AppPage, CopyToastState, Layout } from './components/Layout';
import { LoadingSkeleton } from './components/ui/States';
import { INVESTIGATIONS, RESEARCH_GAPS } from './data/researchCatalog';
import { HomeOverview } from './pages/HomeOverview';
import { InvestigationDetails } from './pages/InvestigationDetails';
import { InvestigationExplorer } from './pages/InvestigationExplorer';
import { InvestigationRecord } from './types/research';
import { verifyClaimAgainstEvidence } from './utils/claimVerification';
import { DemoTourStep } from './utils/demoGuide';
import { buildEvidenceCatalog, AiInterpretationInput } from './utils/evidenceIntelligence';
import { ExportReportType } from './utils/exportCenter';
import {
  resolveGlobalShortcut,
  shouldIgnoreShortcutEvent,
} from './utils/keyboardShortcuts';
import { computeResearchStats, DomainCategoryId } from './utils/researchLogic';
import type { ReproducibilityRecord } from './utils/reproducibilityEngine';
import { ReproducibleAnalysisRun } from './utils/scientificAnalysis';
import { IngestedDatasetPackage } from './utils/scientificIngestion';
import {
  appendSourceCheckHistory,
  SourceCheckHistoryEntry,
} from './utils/sourceTransparency';
import { detectScientificConflicts } from './utils/scientificUncertainty';
import { buildResearchUrlPath, parseResearchUrlState } from './utils/urlState';
import {
  addSavedComparison,
  BookmarkedSourceEntry,
  createCollection,
  deleteCollection,
  deleteDatasetSummaryEntry,
  deleteReproducibilityEntry,
  deleteResearchBrief,
  deleteResearchNote,
  deleteResearchQuestion,
  deleteSavedComparison,
  deleteSavedEvidence,
  deleteWorkspaceReport,
  importWorkspaceBundle,
  loadWorkspaceFromStorage,
  ResearchWorkspaceState,
  SavedDatasetSummaryEntry,
  SavedEvidenceEntry,
  SavedReportEntry,
  SavedReproducibilityEntry,
  SavedResearchBriefEntry,
  saveDatasetSummaryEntry,
  saveReproducibilityEntry,
  saveResearchBrief,
  saveResearchQuestion,
  saveWorkspaceReport,
  saveWorkspaceToStorage,
  toggleBookmarkedSource,
  toggleSavedEvidence,
  toggleSavedInvestigation,
  upsertResearchNote,
} from './utils/workspaceStore';

const InvestigationComparison = lazy(() =>
  import('./pages/InvestigationComparison').then((mod) => ({
    default: mod.InvestigationComparison,
  }))
);
const ScientificDataExplorer = lazy(() =>
  import('./pages/ScientificDataExplorer').then((mod) => ({
    default: mod.ScientificDataExplorer,
  }))
);
const AiAssistant = lazy(() =>
  import('./pages/AiAssistant').then((mod) => ({
    default: mod.AiAssistant,
  }))
);
const ResearchGapExplorer = lazy(() =>
  import('./pages/ResearchGapExplorer').then((mod) => ({
    default: mod.ResearchGapExplorer,
  }))
);
const SourcesReferences = lazy(() =>
  import('./pages/SourcesReferences').then((mod) => ({
    default: mod.SourcesReferences,
  }))
);
const AboutTransparency = lazy(() =>
  import('./pages/AboutTransparency').then((mod) => ({
    default: mod.AboutTransparency,
  }))
);
const KnowledgeGraph = lazy(() =>
  import('./pages/KnowledgeGraph').then((mod) => ({
    default: mod.KnowledgeGraph,
  }))
);
const DocumentIntelligence = lazy(() =>
  import('./pages/DocumentIntelligence').then((mod) => ({
    default: mod.DocumentIntelligence,
  }))
);
const EvidenceEngine = lazy(() =>
  import('./pages/EvidenceEngine').then((mod) => ({
    default: mod.EvidenceEngine,
  }))
);
const ResearchWorkspace = lazy(() =>
  import('./pages/ResearchWorkspace').then((mod) => ({
    default: mod.ResearchWorkspace,
  }))
);
const ExportCenter = lazy(() =>
  import('./pages/ExportCenter').then((mod) => ({
    default: mod.ExportCenter,
  }))
);

const STORAGE_RECENT_KEY = 'flarex_recent_investigations_v1';
const STORAGE_COMPARE_KEY = 'flarex_compare_ids_v1';
const STORAGE_THEME_KEY = 'flarex_theme_v1';
const STORAGE_FLAREX5_SESSION_KEY = 'flarex5_science_session_v1';

const VALID_INVESTIGATION_IDS = new Set(INVESTIGATIONS.map((r) => r.id));

export interface ActiveAiDocumentContext {
  title: string;
  sourceUrl: string;
  content: string;
}

export interface ClientErrorLogItem {
  id: string;
  timestamp: string;
  source: string;
  message: string;
}

interface StoredScienceSession {
  ingestedDatasets: IngestedDatasetPackage[];
  analysisHistory: ReproducibleAnalysisRun[];
  reproducibilityRecords?: ReproducibilityRecord[];
}

function readStoredScienceSession(): StoredScienceSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_FLAREX5_SESSION_KEY);
    if (!raw) {
      return { ingestedDatasets: [], analysisHistory: [], reproducibilityRecords: [] };
    }
    const parsed = JSON.parse(raw) as Partial<StoredScienceSession>;
    return {
      ingestedDatasets: Array.isArray(parsed.ingestedDatasets)
        ? parsed.ingestedDatasets.slice(0, 5)
        : [],
      analysisHistory: Array.isArray(parsed.analysisHistory)
        ? parsed.analysisHistory.slice(0, 20)
        : [],
      reproducibilityRecords: Array.isArray(parsed.reproducibilityRecords)
        ? parsed.reproducibilityRecords.slice(0, 30)
        : [],
    };
  } catch {
    return { ingestedDatasets: [], analysisHistory: [], reproducibilityRecords: [] };
  }
}

function readStoredIds(key: string, fallback: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(
      (id): id is string =>
        typeof id === 'string' && VALID_INVESTIGATION_IDS.has(id)
    );
  } catch {
    return fallback;
  }
}

function readInitialTheme(): 'dark' | 'light' {
  try {
    const saved = window.localStorage.getItem(STORAGE_THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'dark';
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to execCommand when Clipboard API permission is unavailable
    }
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  }
  return false;
}

export default function App() {
  const initialUrlState = useMemo(
    () =>
      parseResearchUrlState(
        typeof window !== 'undefined' ? window.location.search : '',
        VALID_INVESTIGATION_IDS,
        INVESTIGATIONS[0].id
      ),
    []
  );

  const [theme, setTheme] = useState<'dark' | 'light'>(readInitialTheme);
  const [activePage, setActivePage] = useState<AppPage>(initialUrlState.page);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string>(
    initialUrlState.investigationId ?? INVESTIGATIONS[0].id
  );
  const [explorerFamilyFilter, setExplorerFamilyFilter] = useState<string>(
    initialUrlState.family ?? 'ALL'
  );
  const [explorerCategoryFilter, setExplorerCategoryFilter] = useState<string>(
    initialUrlState.category ?? 'ALL'
  );
  const [explorerInitialQuery, setExplorerInitialQuery] = useState<string>('');
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readStoredIds(STORAGE_RECENT_KEY, ['bass-ii', 'saffire', 'flex-cfi-g'])
  );
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    readStoredIds(STORAGE_COMPARE_KEY, ['bass-ii', 'acme-efield', 'battery-fire-ul'])
  );
  const [assistantFocusId, setAssistantFocusId] = useState<string | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null);
  const [graphFocusId, setGraphFocusId] = useState<string | 'ALL'>('ALL');
  const [exportReportType, setExportReportType] =
    useState<ExportReportType>('scientific_full_report');
  const [workspace, setWorkspace] = useState<ResearchWorkspaceState>(() =>
    loadWorkspaceFromStorage(VALID_INVESTIGATION_IDS)
  );
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [assistantFocusTrigger, setAssistantFocusTrigger] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState<boolean>(
    Boolean(initialUrlState.demoMode)
  );
  const [copyToast, setCopyToast] = useState<CopyToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const initialSession = useMemo(() => readStoredScienceSession(), []);
  const [ingestedDatasets, setIngestedDatasets] = useState<IngestedDatasetPackage[]>(
    initialSession.ingestedDatasets
  );
  const [analysisHistory, setAnalysisHistory] = useState<ReproducibleAnalysisRun[]>(
    initialSession.analysisHistory
  );
  const [reproducibilityRecords, setReproducibilityRecords] = useState<
    ReproducibilityRecord[]
  >(initialSession.reproducibilityRecords ?? []);
  const [sourceCheckHistory, setSourceCheckHistory] = useState<SourceCheckHistoryEntry[]>([]);
  const [activeDocumentForAi, setActiveDocumentForAi] =
    useState<ActiveAiDocumentContext | null>(null);
  const [clientErrors, setClientErrors] = useState<ClientErrorLogItem[]>([]);
  const [checkedSourcesCount, setCheckedSourcesCount] = useState(0);
  const [retrievedDocTitles, setRetrievedDocTitles] = useState<string[]>([]);
  const [generatedReportsCount, setGeneratedReportsCount] = useState(0);
  const [aiInterpretations, setAiInterpretations] = useState<AiInterpretationInput[]>([]);
  const [evidenceInitialTab, setEvidenceInitialTab] = useState<
    'catalog' | 'claims' | 'conflicts' | 'audit'
  >('catalog');

  const stats = useMemo(() => computeResearchStats(INVESTIGATIONS), []);

  const evidenceCatalog = useMemo(
    () =>
      buildEvidenceCatalog({
        investigations: INVESTIGATIONS,
        gaps: RESEARCH_GAPS,
        ingestedDatasets,
        analysisRuns: analysisHistory,
        aiInterpretations,
      }),
    [ingestedDatasets, analysisHistory, aiInterpretations]
  );

  const dashboardEvidenceSummary = useMemo(() => {
    const conflicts = detectScientificConflicts({
      investigations: INVESTIGATIONS,
      evidenceCatalog,
      ingestedDatasets,
    });
    const sampleClaims = INVESTIGATIONS.slice(0, 10).map((r) =>
      verifyClaimAgainstEvidence(
        r.reportedFindings ?? r.overview,
        evidenceCatalog,
        { origin: 'DOSSIER_FACT', targetInvestigationId: r.id }
      )
    );
    return {
      totalEvidence: evidenceCatalog.length,
      supportedClaims: sampleClaims.filter(
        (c) => c.verificationStatus === 'Supported by direct evidence'
      ).length,
      multiSourceClaims: sampleClaims.filter(
        (c) => c.verificationStatus === 'Supported by multiple sources'
      ).length,
      needsVerificationClaims: sampleClaims.filter(
        (c) =>
          c.verificationStatus === 'Partially supported' ||
          c.verificationStatus === 'Insufficient evidence' ||
          c.verificationStatus === 'AI interpretation only'
      ).length,
      potentialConflicts: conflicts.length,
      readinessCheckedCount: ingestedDatasets.length,
    };
  }, [evidenceCatalog, ingestedDatasets]);

  useEffect(() => {
    try {
      const compactDatasets = ingestedDatasets.slice(0, 5).map((ds) => ({
        ...ds,
        originalRows: ds.originalRows.slice(0, 250),
        normalizedRows: ds.normalizedRows.slice(0, 250),
        analysisRows: ds.analysisRows ? ds.analysisRows.slice(0, 250) : undefined,
      }));
      window.localStorage.setItem(
        STORAGE_FLAREX5_SESSION_KEY,
        JSON.stringify({
          ingestedDatasets: compactDatasets,
          analysisHistory: analysisHistory.slice(0, 20),
          reproducibilityRecords: reproducibilityRecords.slice(0, 30),
        })
      );
    } catch {
      // Ignore storage quota overflow on large CSV uploads
    }
  }, [ingestedDatasets, analysisHistory, reproducibilityRecords]);

  const handleIngestDataset = useCallback((pkg: IngestedDatasetPackage) => {
    setIngestedDatasets((prev) => [
      pkg,
      ...prev.filter((d) => d.provenance.datasetId !== pkg.provenance.datasetId),
    ].slice(0, 6));
  }, []);

  const handleRemoveIngestedDataset = useCallback((datasetId: string) => {
    setIngestedDatasets((prev) =>
      prev.filter((d) => d.provenance.datasetId !== datasetId)
    );
  }, []);

  const handleRecordAnalysisRun = useCallback((run: ReproducibleAnalysisRun) => {
    setAnalysisHistory((prev) => [run, ...prev].slice(0, 25));
  }, []);

  const handleRecordReproducibility = useCallback((record: ReproducibilityRecord) => {
    setReproducibilityRecords((prev) =>
      [record, ...prev.filter((r) => r.runId !== record.runId)].slice(0, 35)
    );
  }, []);

  const handleLogSourceCheck = useCallback(
    (entry: Omit<SourceCheckHistoryEntry, 'id'>) => {
      setSourceCheckHistory((prev) => appendSourceCheckHistory(prev, entry));
    },
    []
  );

  const handleRecordClientError = useCallback((source: string, message: string) => {
    setClientErrors((prev) =>
      [
        {
          id: `cerr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: new Date().toISOString(),
          source,
          message,
        },
        ...prev,
      ].slice(0, 20)
    );
  }, []);

  const handleAttachDocumentToAi = useCallback(
    (doc: ActiveAiDocumentContext, navigateToAi = true) => {
      setActiveDocumentForAi(doc);
      if (navigateToAi) {
        setActivePage('assistant');
        setAssistantFocusTrigger((n) => n + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    []
  );

  useEffect(() => {
    saveWorkspaceToStorage(workspace);
  }, [workspace]);

  useEffect(() => {
    const rootEl = document.documentElement;
    if (theme === 'dark') {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(STORAGE_THEME_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(recentIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [recentIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_COMPARE_KEY,
        JSON.stringify(compareIds)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [compareIds]);

  useEffect(() => {
    const targetPath = buildResearchUrlPath(window.location.pathname, {
      page: activePage,
      investigationId:
        activePage === 'detail' ? selectedInvestigationId : undefined,
      family: activePage === 'explorer' ? explorerFamilyFilter : undefined,
      category: activePage === 'explorer' ? explorerCategoryFilter : undefined,
      demoMode: demoOpen || undefined,
    });
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [
    activePage,
    selectedInvestigationId,
    explorerFamilyFilter,
    explorerCategoryFilter,
    demoOpen,
  ]);

  useEffect(() => {
    const handlePopState = () => {
      const nextState = parseResearchUrlState(
        window.location.search,
        VALID_INVESTIGATION_IDS,
        INVESTIGATIONS[0].id
      );
      setActivePage(nextState.page);
      if (nextState.investigationId) {
        setSelectedInvestigationId(nextState.investigationId);
      }
      setExplorerFamilyFilter(nextState.family ?? 'ALL');
      setExplorerCategoryFilter(nextState.category ?? 'ALL');
      setDemoOpen(Boolean(nextState.demoMode));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showCopyToast = useCallback((message: string, isError = false) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setCopyToast({ id: Date.now(), message, isError });
    toastTimerRef.current = window.setTimeout(() => {
      setCopyToast(null);
      toastTimerRef.current = null;
    }, 2800);
  }, []);

  const handleCopyCurrentUrl = useCallback(async () => {
    const targetPath = buildResearchUrlPath(window.location.pathname, {
      page: activePage,
      investigationId:
        activePage === 'detail' ? selectedInvestigationId : undefined,
      family: activePage === 'explorer' ? explorerFamilyFilter : undefined,
      category: activePage === 'explorer' ? explorerCategoryFilter : undefined,
      demoMode: demoOpen || undefined,
    });
    const shareUrl = new URL(targetPath, window.location.origin).toString();
    const copied = await writeTextToClipboard(shareUrl);
    if (copied) {
      showCopyToast('Link copied');
    } else {
      showCopyToast('Unable to copy link', true);
    }
  }, [
    activePage,
    selectedInvestigationId,
    explorerFamilyFilter,
    explorerCategoryFilter,
    demoOpen,
    showCopyToast,
  ]);

  const handleToggleShortcuts = useCallback((open?: boolean) => {
    setShortcutsOpen((prev) => (typeof open === 'boolean' ? open : !prev));
  }, []);

  const handleNavigate = useCallback((page: AppPage) => {
    if (page !== 'explorer') {
      setExplorerFamilyFilter('ALL');
      setExplorerCategoryFilter('ALL');
      setExplorerInitialQuery('');
    }
    if (page === 'graph') {
      setGraphFocusId('ALL');
    }
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        shouldIgnoreShortcutEvent(
          target
            ? {
                tagName: target.tagName,
                isContentEditable: target.isContentEditable,
              }
            : null,
          {
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
          }
        )
      ) {
        return;
      }

      const action = resolveGlobalShortcut(e.key);
      if (!action) return;

      e.preventDefault();
      if (action.type === 'TOGGLE_HELP') {
        handleToggleShortcuts();
        return;
      }
      if (action.type === 'COPY_URL') {
        void handleCopyCurrentUrl();
        return;
      }

      setShortcutsOpen(false);
      handleNavigate(action.page);
      if (action.focusTarget === 'search') {
        setSearchFocusTrigger((n) => n + 1);
      } else if (action.focusTarget === 'assistant') {
        setAssistantFocusTrigger((n) => n + 1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleCopyCurrentUrl, handleNavigate, handleToggleShortcuts]);

  const handleOpenInvestigation = useCallback((id: string) => {
    setSelectedInvestigationId(id);
    setRecentIds((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 5));
    setActivePage('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectCategoryFilter = useCallback(
    (categoryId: DomainCategoryId) => {
      setExplorerFamilyFilter('ALL');
      setExplorerCategoryFilter(categoryId);
      setExplorerInitialQuery('');
      setActivePage('explorer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handleGlobalSearchSubmit = useCallback((query: string) => {
    setExplorerFamilyFilter('ALL');
    setExplorerCategoryFilter('ALL');
    setExplorerInitialQuery(query);
    setActivePage('explorer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleAskAboutInvestigation = (investigation: InvestigationRecord) => {
    setAssistantFocusId(investigation.id);
    setAssistantPrompt(
      `Summarize the documented purpose, platform provenance, findings, and limitations of ${investigation.shortName}.`
    );
    setActivePage('assistant');
    setAssistantFocusTrigger((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAskGapQuestion = useCallback((question: string) => {
    setAssistantFocusId(null);
    setAssistantPrompt(question);
    setActivePage('assistant');
    setAssistantFocusTrigger((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExecuteDemoStepAction = useCallback(
    (step: DemoTourStep) => {
      if (step.comparisonPresetIds && step.comparisonPresetIds.length > 0) {
        const valid = step.comparisonPresetIds
          .filter((id) => VALID_INVESTIGATION_IDS.has(id))
          .slice(0, 3);
        if (valid.length > 0) {
          setCompareIds(valid);
        }
        setActivePage('compare');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (
        step.featuredInvestigationId &&
        VALID_INVESTIGATION_IDS.has(step.featuredInvestigationId)
      ) {
        handleOpenInvestigation(step.featuredInvestigationId);
        return;
      }
      if (step.realAiDemoPrompt) {
        setAssistantFocusId(null);
        setAssistantPrompt(step.realAiDemoPrompt);
        setActivePage('assistant');
        setAssistantFocusTrigger((n) => n + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      handleNavigate(step.targetPage);
    },
    [handleNavigate, handleOpenInvestigation]
  );

  const handleToggleSaveInvestigation = useCallback(
    (id: string) => {
      setWorkspace((prev) => {
        const wasSaved = prev.savedInvestigationIds.includes(id);
        showCopyToast(wasSaved ? 'Removed from workspace' : 'Saved to workspace');
        return toggleSavedInvestigation(prev, id);
      });
    },
    [showCopyToast]
  );

  const handleToggleBookmarkSource = useCallback(
    (entry: Omit<BookmarkedSourceEntry, 'savedAt'>) => {
      setWorkspace((prev) => {
        const existed = prev.bookmarkedSources.some((b) => b.url === entry.url);
        showCopyToast(existed ? 'Bookmark removed' : 'Source bookmarked');
        return toggleBookmarkedSource(prev, entry);
      });
    },
    [showCopyToast]
  );

  const handleRemoveBookmarkUrl = useCallback(
    (url: string) => {
      setWorkspace((prev) => ({
        ...prev,
        bookmarkedSources: prev.bookmarkedSources.filter((b) => b.url !== url),
      }));
      showCopyToast('Bookmark removed');
    },
    [showCopyToast]
  );

  const handleSaveComparison = useCallback(
    (title: string, ids: string[]) => {
      setWorkspace((prev) => addSavedComparison(prev, title, ids));
      showCopyToast('Comparison saved to workspace');
    },
    [showCopyToast]
  );

  const handleSaveNote = useCallback(
    (note: {
      id?: string;
      targetType: 'investigation' | 'source' | 'general';
      targetId: string;
      targetTitle: string;
      content: string;
    }) => {
      setWorkspace((prev) => upsertResearchNote(prev, note));
      showCopyToast('Research note saved');
    },
    [showCopyToast]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      setWorkspace((prev) => deleteResearchNote(prev, noteId));
      showCopyToast('Research note deleted');
    },
    [showCopyToast]
  );

  const handleCreateCollection = useCallback(
    (name: string, description: string, ids: string[]) => {
      setWorkspace((prev) => createCollection(prev, name, description, ids));
      showCopyToast('Collection created');
    },
    [showCopyToast]
  );

  const handleDeleteCollection = useCallback(
    (collectionId: string) => {
      setWorkspace((prev) => deleteCollection(prev, collectionId));
      showCopyToast('Collection deleted');
    },
    [showCopyToast]
  );

  const handleSaveResearchQuestion = useCallback(
    (question: string, classificationLabel: string) => {
      setWorkspace((prev) => saveResearchQuestion(prev, question, classificationLabel));
      showCopyToast('Research question saved to workspace');
    },
    [showCopyToast]
  );

  const handleDeleteResearchQuestion = useCallback(
    (id: string) => {
      setWorkspace((prev) => deleteResearchQuestion(prev, id));
      showCopyToast('Saved question removed');
    },
    [showCopyToast]
  );

  const handleSaveResearchBrief = useCallback(
    (brief: Omit<SavedResearchBriefEntry, 'id' | 'createdAt'>) => {
      setWorkspace((prev) => saveResearchBrief(prev, brief));
      showCopyToast('Research brief saved to workspace');
    },
    [showCopyToast]
  );

  const handleDeleteResearchBrief = useCallback(
    (id: string) => {
      setWorkspace((prev) => deleteResearchBrief(prev, id));
      showCopyToast('Saved brief removed');
    },
    [showCopyToast]
  );

  const handleToggleSaveEvidence = useCallback(
    (item: Omit<SavedEvidenceEntry, 'savedAt'>) => {
      setWorkspace((prev) => {
        const existed = prev.savedEvidence.some((e) => e.evidenceId === item.evidenceId);
        showCopyToast(existed ? 'Evidence removed from workspace' : 'Evidence saved to workspace');
        return toggleSavedEvidence(prev, item);
      });
    },
    [showCopyToast]
  );

  const handleDeleteSavedEvidence = useCallback(
    (evidenceId: string) => {
      setWorkspace((prev) => deleteSavedEvidence(prev, evidenceId));
      showCopyToast('Saved evidence removed');
    },
    [showCopyToast]
  );

  const handleSaveReport = useCallback(
    (report: Omit<SavedReportEntry, 'id' | 'createdAt'>) => {
      setWorkspace((prev) => saveWorkspaceReport(prev, report));
      setGeneratedReportsCount((c) => c + 1);
      showCopyToast('Scientific report saved to workspace');
    },
    [showCopyToast]
  );

  const handleDeleteSavedReport = useCallback(
    (id: string) => {
      setWorkspace((prev) => deleteWorkspaceReport(prev, id));
      showCopyToast('Saved report removed');
    },
    [showCopyToast]
  );

  const handleDeleteSavedComparison = useCallback(
    (id: string) => {
      setWorkspace((prev) => deleteSavedComparison(prev, id));
      showCopyToast('Saved comparison removed');
    },
    [showCopyToast]
  );

  const handleSaveReproducibilityToWorkspace = useCallback(
    (entry: SavedReproducibilityEntry) => {
      setWorkspace((prev) => {
        const res = saveReproducibilityEntry(prev, entry);
        showCopyToast(
          res.duplicate
            ? 'Reproducibility run already saved in workspace'
            : 'Reproducibility run saved to workspace'
        );
        return res.state;
      });
    },
    [showCopyToast]
  );

  const handleDeleteReproducibility = useCallback(
    (runId: string) => {
      setWorkspace((prev) => deleteReproducibilityEntry(prev, runId));
      showCopyToast('Saved reproducibility run removed');
    },
    [showCopyToast]
  );

  const handleSaveDatasetSummaryToWorkspace = useCallback(
    (entry: SavedDatasetSummaryEntry) => {
      setWorkspace((prev) => {
        const res = saveDatasetSummaryEntry(prev, entry);
        showCopyToast(
          res.duplicate
            ? 'Dataset summary already saved in workspace'
            : 'Dataset summary saved to workspace'
        );
        return res.state;
      });
    },
    [showCopyToast]
  );

  const handleDeleteDatasetSummary = useCallback(
    (datasetId: string) => {
      setWorkspace((prev) => deleteDatasetSummaryEntry(prev, datasetId));
      showCopyToast('Saved dataset summary removed');
    },
    [showCopyToast]
  );

  const handleImportWorkspace = useCallback(
    (rawJson: string): { ok: boolean; error?: string; recoveryNotes?: string[] } => {
      const outcome = importWorkspaceBundle(rawJson, VALID_INVESTIGATION_IDS);
      if (outcome.ok && outcome.state) {
        setWorkspace(outcome.state);
        showCopyToast('Workspace imported from JSON backup');
        return { ok: true, recoveryNotes: outcome.recoveryNotes };
      }
      return { ok: false, error: outcome.error || 'Import failed.' };
    },
    [showCopyToast]
  );

  const handleLoadComparison = useCallback((ids: string[]) => {
    const valid = ids
      .filter((id) => VALID_INVESTIGATION_IDS.has(id))
      .slice(0, 3);
    if (valid.length > 0) {
      setCompareIds(valid);
      setActivePage('compare');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleOpenInGraph = useCallback((id: string) => {
    setGraphFocusId(id);
    setActivePage('graph');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExportReport = useCallback((reportType: ExportReportType) => {
    setExportReportType(reportType);
    setActivePage('export');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const selectedInvestigation =
    INVESTIGATIONS.find((r) => r.id === selectedInvestigationId) ??
    INVESTIGATIONS[0];

  const workspaceCount =
    workspace.savedInvestigationIds.length +
    workspace.bookmarkedSources.length +
    workspace.notes.length +
    workspace.savedComparisons.length +
    workspace.savedQuestions.length +
    workspace.savedBriefs.length +
    workspace.savedEvidence.length +
    workspace.savedReports.length +
    (workspace.savedReproducibilityRuns?.length ?? 0) +
    (workspace.importedDatasetSummaries?.length ?? 0);

  useEffect(() => {
    const pageTitles: Record<AppPage, string> = {
      overview: 'FLAREX — Fire Learning and Research Explorer',
      explorer: 'Investigation Explorer — FLAREX',
      detail: `${selectedInvestigation.shortName} — FLAREX`,
      compare: 'Investigation Comparison — FLAREX',
      data: 'Trends & Data Quality — FLAREX',
      graph: 'Scientific Knowledge Graph — FLAREX',
      documents: 'Document Intelligence — FLAREX',
      evidence: 'Evidence Engine — FLAREX',
      assistant: 'AI Research Analyst — FLAREX',
      gaps: 'Research Gap Intelligence — FLAREX',
      workspace: 'Research Workspace — FLAREX',
      export: 'Scientific Export Center — FLAREX',
      sources: 'NASA Discovery & Sources — FLAREX',
      about: 'About & Transparency — FLAREX',
    };
    document.title = pageTitles[activePage] ?? 'FLAREX — Fire Learning and Research Explorer';
  }, [activePage, selectedInvestigation.shortName]);

  return (
    <Layout
      activePage={activePage}
      onNavigate={handleNavigate}
      investigations={INVESTIGATIONS}
      onOpenInvestigation={handleOpenInvestigation}
      onGlobalSearchSubmit={handleGlobalSearchSubmit}
      breadcrumbDetail={
        activePage === 'detail' ? selectedInvestigation.shortName : null
      }
      compareCount={compareIds.length}
      workspaceCount={workspaceCount}
      shortcutsOpen={shortcutsOpen}
      onToggleShortcuts={handleToggleShortcuts}
      onCopyLink={handleCopyCurrentUrl}
      copyToast={copyToast}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      onOpenDemoMode={() => setDemoOpen(true)}
    >
      <DemoTourModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onNavigate={handleNavigate}
        onExecuteStepAction={handleExecuteDemoStepAction}
      />

      {activePage === 'overview' && (
        <HomeOverview
          stats={stats}
          investigations={INVESTIGATIONS}
          recentIds={recentIds}
          onNavigate={handleNavigate}
          onOpenInvestigation={handleOpenInvestigation}
          onSelectCategoryFilter={handleSelectCategoryFilter}
          onOpenDemoMode={() => setDemoOpen(true)}
          evidenceSummary={dashboardEvidenceSummary}
          sessionMetrics={{
            checkedSourcesCount: Math.max(checkedSourcesCount, sourceCheckHistory.length),
            retrievedDocumentsCount: retrievedDocTitles.length,
            generatedReportsCount: Math.max(generatedReportsCount, workspace.savedReports.length),
            importedDatasetsCount: ingestedDatasets.length,
            analysisRunsCount: analysisHistory.length,
            reproducibilityRunsCount: reproducibilityRecords.length,
            workspaceCount,
          }}
          onOpenEvidenceTab={(tab) => {
            setEvidenceInitialTab(tab);
            handleNavigate('evidence');
          }}
        />
      )}

      {activePage === 'explorer' && (
        <InvestigationExplorer
          investigations={INVESTIGATIONS}
          initialFamilyFilter={explorerFamilyFilter}
          initialCategoryFilter={explorerCategoryFilter}
          initialQuery={explorerInitialQuery}
          searchFocusTrigger={searchFocusTrigger}
          compareIds={compareIds}
          onToggleCompare={handleToggleCompare}
          onOpenInvestigation={handleOpenInvestigation}
        />
      )}

      {activePage === 'detail' && (
        <InvestigationDetails
          investigation={selectedInvestigation}
          allInvestigations={INVESTIGATIONS}
          isCompared={compareIds.includes(selectedInvestigation.id)}
          compareFull={compareIds.length >= 3}
          isSaved={workspace.savedInvestigationIds.includes(selectedInvestigation.id)}
          onToggleCompare={handleToggleCompare}
          onToggleSave={handleToggleSaveInvestigation}
          onBackToExplorer={() => handleNavigate('explorer')}
          onAskAboutInvestigation={handleAskAboutInvestigation}
          onOpenInvestigation={handleOpenInvestigation}
          onOpenInGraph={handleOpenInGraph}
          onExportProfile={() => handleExportReport('investigation_profile')}
        />
      )}

      {activePage === 'compare' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <InvestigationComparison
            investigations={INVESTIGATIONS}
            selectedIds={compareIds}
            onUpdateSelection={setCompareIds}
            onOpenInvestigation={handleOpenInvestigation}
            onSaveComparison={handleSaveComparison}
            onExportComparison={() => handleExportReport('comparison_report')}
          />
        </Suspense>
      )}

      {activePage === 'data' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ScientificDataExplorer
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
            ingestedDatasets={ingestedDatasets}
            analysisHistory={analysisHistory}
            reproducibilityRecords={reproducibilityRecords}
            onIngestDataset={handleIngestDataset}
            onRemoveIngestedDataset={handleRemoveIngestedDataset}
            onRecordAnalysisRun={handleRecordAnalysisRun}
            onRecordReproducibility={handleRecordReproducibility}
            onSaveReproducibilityToWorkspace={handleSaveReproducibilityToWorkspace}
            onSaveDatasetSummaryToWorkspace={handleSaveDatasetSummaryToWorkspace}
            clientErrors={clientErrors}
            onRecordClientError={handleRecordClientError}
          />
        </Suspense>
      )}

      {activePage === 'graph' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <KnowledgeGraph
            investigations={INVESTIGATIONS}
            initialFocusId={graphFocusId}
            onOpenInvestigation={handleOpenInvestigation}
            ingestedDatasets={ingestedDatasets}
          />
        </Suspense>
      )}

      {activePage === 'documents' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <DocumentIntelligence
            onOpenInvestigation={handleOpenInvestigation}
            onSendToNumericalAnalysis={(pkg) => {
              handleIngestDataset(pkg);
              handleNavigate('data');
              showCopyToast('Dataset imported into Numerical Analysis');
            }}
            onAnalyzeDocumentInAi={(doc) => {
              setRetrievedDocTitles((prev) =>
                prev.includes(doc.title) ? prev : [doc.title, ...prev].slice(0, 20)
              );
              handleAttachDocumentToAi(doc, true);
            }}
          />
        </Suspense>
      )}

      {activePage === 'evidence' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <EvidenceEngine
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
            ingestedDatasets={ingestedDatasets}
            analysisHistory={analysisHistory}
            reproducibilityRecords={reproducibilityRecords}
            workspaceItemCount={workspaceCount}
            checkedSourcesCount={Math.max(checkedSourcesCount, sourceCheckHistory.length)}
            retrievedDocumentsCount={retrievedDocTitles.length}
            generatedReportsCount={Math.max(generatedReportsCount, workspace.savedReports.length)}
            aiInterpretations={aiInterpretations}
            savedEvidenceIds={workspace.savedEvidence.map((e) => e.evidenceId)}
            onToggleSaveEvidence={handleToggleSaveEvidence}
            initialTab={evidenceInitialTab}
          />
        </Suspense>
      )}

      {activePage === 'assistant' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <AiAssistant
            investigations={INVESTIGATIONS}
            initialFocusId={assistantFocusId}
            initialPrompt={assistantPrompt}
            inputFocusTrigger={assistantFocusTrigger}
            onOpenInvestigation={handleOpenInvestigation}
            attachedDocument={activeDocumentForAi}
            onClearAttachedDocument={() => setActiveDocumentForAi(null)}
            onRecordClientError={handleRecordClientError}
            onSaveBrief={handleSaveResearchBrief}
            onRecordAiInterpretation={(item) =>
              setAiInterpretations((prev) => [item, ...prev].slice(0, 20))
            }
          />
        </Suspense>
      )}

      {activePage === 'gaps' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ResearchGapExplorer
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
            onAskAiQuestion={handleAskGapQuestion}
            ingestedDatasets={ingestedDatasets}
            onSaveQuestion={handleSaveResearchQuestion}
            onSaveBrief={handleSaveResearchBrief}
          />
        </Suspense>
      )}

      {activePage === 'workspace' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ResearchWorkspace
            investigations={INVESTIGATIONS}
            workspace={workspace}
            ingestedDatasets={ingestedDatasets}
            analysisHistory={analysisHistory}
            onToggleSaveInvestigation={handleToggleSaveInvestigation}
            onRemoveBookmark={handleRemoveBookmarkUrl}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
            onCreateCollection={handleCreateCollection}
            onDeleteCollection={handleDeleteCollection}
            onLoadComparison={handleLoadComparison}
            onDeleteComparison={handleDeleteSavedComparison}
            onDeleteQuestion={handleDeleteResearchQuestion}
            onDeleteBrief={handleDeleteResearchBrief}
            onDeleteEvidence={handleDeleteSavedEvidence}
            onDeleteReport={handleDeleteSavedReport}
            onDeleteReproducibility={handleDeleteReproducibility}
            onDeleteDatasetSummary={handleDeleteDatasetSummary}
            onImportWorkspace={handleImportWorkspace}
            onOpenInvestigation={handleOpenInvestigation}
            onNavigate={handleNavigate}
          />
        </Suspense>
      )}

      {activePage === 'export' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ExportCenter
            investigations={INVESTIGATIONS}
            compareIds={compareIds}
            workspace={workspace}
            initialReportType={exportReportType}
            ingestedDatasets={ingestedDatasets}
            analysisHistory={analysisHistory}
            reproducibilityRecords={reproducibilityRecords}
            onSaveReport={handleSaveReport}
            onReportDownloaded={() => setGeneratedReportsCount((c) => c + 1)}
          />
        </Suspense>
      )}

      {activePage === 'sources' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <SourcesReferences
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
            bookmarkedSources={workspace.bookmarkedSources}
            onToggleBookmark={handleToggleBookmarkSource}
            onAttachNtrsDocument={(doc) => {
              setRetrievedDocTitles((prev) =>
                prev.includes(doc.title) ? prev : [doc.title, ...prev].slice(0, 20)
              );
              handleAttachDocumentToAi(doc, true);
            }}
            onRecordClientError={handleRecordClientError}
            onRecordSourceChecked={(delta = 1) =>
              setCheckedSourcesCount((c) => c + delta)
            }
            onRecordRetrievedDocument={(title) =>
              setRetrievedDocTitles((prev) =>
                prev.includes(title) ? prev : [title, ...prev].slice(0, 20)
              )
            }
            ingestedDatasets={ingestedDatasets}
            retrievedDocTitles={retrievedDocTitles}
            sourceCheckHistory={sourceCheckHistory}
            onLogSourceCheck={handleLogSourceCheck}
          />
        </Suspense>
      )}

      {activePage === 'about' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <AboutTransparency />
        </Suspense>
      )}
    </Layout>
  );
}
