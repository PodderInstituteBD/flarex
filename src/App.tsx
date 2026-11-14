/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppPage, CopyToastState, Layout } from './components/Layout';
import { LoadingSkeleton } from './components/ui/States';
import { INVESTIGATIONS } from './data/researchCatalog';
import { HomeOverview } from './pages/HomeOverview';
import { InvestigationDetails } from './pages/InvestigationDetails';
import { InvestigationExplorer } from './pages/InvestigationExplorer';
import { InvestigationRecord } from './types/research';
import {
  resolveGlobalShortcut,
  shouldIgnoreShortcutEvent,
} from './utils/keyboardShortcuts';
import { computeResearchStats, DomainCategoryId } from './utils/researchLogic';
import { buildResearchUrlPath, parseResearchUrlState } from './utils/urlState';

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

const STORAGE_RECENT_KEY = 'flarex_recent_investigations_v1';
const STORAGE_COMPARE_KEY = 'flarex_compare_ids_v1';
const STORAGE_THEME_KEY = 'flarex_theme_v1';

const VALID_INVESTIGATION_IDS = new Set(INVESTIGATIONS.map((r) => r.id));

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
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [assistantFocusTrigger, setAssistantFocusTrigger] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copyToast, setCopyToast] = useState<CopyToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const stats = useMemo(() => computeResearchStats(INVESTIGATIONS), []);

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

  const selectedInvestigation =
    INVESTIGATIONS.find((r) => r.id === selectedInvestigationId) ??
    INVESTIGATIONS[0];

  useEffect(() => {
    const pageTitles: Record<AppPage, string> = {
      overview: 'FLAREX — Fire Learning and Research Explorer',
      explorer: 'Investigation Explorer — FLAREX',
      detail: `${selectedInvestigation.shortName} — FLAREX`,
      compare: 'Investigation Comparison — FLAREX',
      data: 'Scientific Data Explorer — FLAREX',
      assistant: 'FLAREX Research Intelligence — FLAREX',
      gaps: 'Research Gap Explorer — FLAREX',
      sources: 'Sources & References — FLAREX',
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
      shortcutsOpen={shortcutsOpen}
      onToggleShortcuts={handleToggleShortcuts}
      onCopyLink={handleCopyCurrentUrl}
      copyToast={copyToast}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    >
      {activePage === 'overview' && (
        <HomeOverview
          stats={stats}
          investigations={INVESTIGATIONS}
          recentIds={recentIds}
          onNavigate={handleNavigate}
          onOpenInvestigation={handleOpenInvestigation}
          onSelectCategoryFilter={handleSelectCategoryFilter}
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
          isCompared={compareIds.includes(selectedInvestigation.id)}
          compareFull={compareIds.length >= 3}
          onToggleCompare={handleToggleCompare}
          onBackToExplorer={() => handleNavigate('explorer')}
          onAskAboutInvestigation={handleAskAboutInvestigation}
        />
      )}

      {activePage === 'compare' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <InvestigationComparison
            investigations={INVESTIGATIONS}
            selectedIds={compareIds}
            onUpdateSelection={setCompareIds}
            onOpenInvestigation={handleOpenInvestigation}
          />
        </Suspense>
      )}

      {activePage === 'data' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ScientificDataExplorer
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
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
          />
        </Suspense>
      )}

      {activePage === 'gaps' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <ResearchGapExplorer
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
          />
        </Suspense>
      )}

      {activePage === 'sources' && (
        <Suspense fallback={<LoadingSkeleton rows={4} />}>
          <SourcesReferences
            investigations={INVESTIGATIONS}
            onOpenInvestigation={handleOpenInvestigation}
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
