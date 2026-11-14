import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  GitCompare,
  Info,
  Keyboard,
  LayoutDashboard,
  Link2,
  Menu,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';
import { InvestigationRecord } from '../types/research';
import {
  getNextSidebarIndex,
  getSidebarTabIndex,
  GLOBAL_SHORTCUTS,
} from '../utils/keyboardShortcuts';
import { globalSearchInvestigations } from '../utils/researchLogic';
import { FlarexLogo } from './FlarexLogo';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';

export type AppPage =
  | 'overview'
  | 'explorer'
  | 'detail'
  | 'compare'
  | 'data'
  | 'assistant'
  | 'gaps'
  | 'sources'
  | 'about';

interface NavItem {
  id: Exclude<AppPage, 'detail'>;
  label: string;
  shortLabel: string;
  Icon: typeof LayoutDashboard;
  shortcut?: string;
  group: 'OVERVIEW' | 'RESEARCH' | 'INTELLIGENCE' | 'INFORMATION';
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    Icon: LayoutDashboard,
    shortcut: 'H',
    group: 'OVERVIEW',
  },
  {
    id: 'explorer',
    label: 'Investigation Explorer',
    shortLabel: 'Explorer',
    Icon: Search,
    shortcut: 'S',
    group: 'RESEARCH',
  },
  {
    id: 'compare',
    label: 'Investigation Comparison',
    shortLabel: 'Comparison',
    Icon: GitCompare,
    shortcut: 'M',
    group: 'RESEARCH',
  },
  {
    id: 'data',
    label: 'Scientific Data Explorer',
    shortLabel: 'Data Explorer',
    Icon: BarChart3,
    shortcut: 'D',
    group: 'RESEARCH',
  },
  {
    id: 'gaps',
    label: 'Research Gap Explorer',
    shortLabel: 'Research Gaps',
    Icon: ShieldAlert,
    shortcut: 'G',
    group: 'RESEARCH',
  },
  {
    id: 'assistant',
    label: 'AI Research Assistant',
    shortLabel: 'AI Intelligence',
    Icon: MessageSquareText,
    shortcut: 'A',
    group: 'INTELLIGENCE',
  },
  {
    id: 'sources',
    label: 'Sources & References',
    shortLabel: 'Sources',
    Icon: BookOpen,
    group: 'INFORMATION',
  },
  {
    id: 'about',
    label: 'About FLAREX',
    shortLabel: 'About',
    Icon: Info,
    group: 'INFORMATION',
  },
];

const NAV_GROUPS: Array<{
  key: NavItem['group'];
  heading: string;
}> = [
  { key: 'OVERVIEW', heading: 'Overview' },
  { key: 'RESEARCH', heading: 'Research' },
  { key: 'INTELLIGENCE', heading: 'Intelligence' },
  { key: 'INFORMATION', heading: 'Information' },
];

export interface CopyToastState {
  id: number;
  message: string;
  isError?: boolean;
}

interface LayoutProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  investigations: InvestigationRecord[];
  onOpenInvestigation: (id: string) => void;
  onGlobalSearchSubmit: (query: string) => void;
  breadcrumbDetail?: string | null;
  compareCount: number;
  shortcutsOpen: boolean;
  onToggleShortcuts: (open?: boolean) => void;
  onCopyLink: () => void;
  copyToast: CopyToastState | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSE_KEY = 'flarex_sidebar_collapsed_v1';

export function Layout({
  activePage,
  onNavigate,
  investigations,
  onOpenInvestigation,
  onGlobalSearchSubmit,
  breadcrumbDetail,
  compareCount,
  shortcutsOpen,
  onToggleShortcuts,
  onCopyLink,
  copyToast,
  theme,
  onToggleTheme,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [globalQuery, setGlobalQuery] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  const desktopNavRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileNavRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null);

  const globalHits = useMemo(
    () => globalSearchInvestigations(globalQuery, investigations, 6),
    [globalQuery, investigations]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSE_KEY,
        sidebarCollapsed ? 'true' : 'false'
      );
    } catch {
      // Ignore storage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchDropdownOpen) {
          setSearchDropdownOpen(false);
          globalSearchInputRef.current?.blur();
          return;
        }
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          mobileTriggerRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, searchDropdownOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      mobileCloseRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  const handleSelectNav = (page: Exclude<AppPage, 'detail'>) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  const handleNavKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    isMobile: boolean
  ) => {
    const nextIdx = getNextSidebarIndex(index, e.key, NAV_ITEMS.length);
    if (nextIdx !== null) {
      e.preventDefault();
      const refs = isMobile ? mobileNavRefs.current : desktopNavRefs.current;
      refs[nextIdx]?.focus();
    }
  };

  const handleGlobalSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalQuery.trim()) return;
    setSearchDropdownOpen(false);
    onGlobalSearchSubmit(globalQuery.trim());
  };

  const handleSelectSearchHit = (id: string) => {
    setSearchDropdownOpen(false);
    setGlobalQuery('');
    onOpenInvestigation(id);
  };

  const currentNavLabel =
    activePage === 'detail'
      ? 'Investigation Details'
      : NAV_ITEMS.find((item) => item.id === activePage)?.label ?? 'Dashboard';

  const renderSidebar = (isMobile: boolean) => {
    const isCollapsed = !isMobile && sidebarCollapsed;

    return (
      <div className="flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] select-none">
        {/* Brand row */}
        <div
          className={`flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] ${
            isCollapsed ? 'px-3 py-4 flex-col' : 'px-4 py-4'
          }`}
        >
          <button
            type="button"
            tabIndex={getSidebarTabIndex(0)}
            onClick={() => handleSelectNav('overview')}
            aria-label="FLAREX — Go to Dashboard (Shortcut: H)"
            aria-keyshortcuts="h"
            title="FLAREX — Fire Learning and Research Explorer"
            className={`flex items-center gap-2.5 text-left group rounded-[8px] cursor-pointer ${
              isCollapsed ? 'justify-center' : 'min-w-0 flex-1'
            }`}
          >
            <FlarexLogo className="w-8 h-8 shrink-0" />
            {!isCollapsed && (
              <span className="min-w-0">
                <span className="block font-display text-[15px] font-extrabold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                  FLAREX
                </span>
                <span className="block text-[11px] text-[var(--text-muted)] truncate">
                  Fire Research Explorer
                </span>
              </span>
            )}
          </button>

          {!isMobile && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {/* Grouped Navigation */}
        <nav
          className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto"
          aria-label={isMobile ? 'Mobile navigation' : 'Primary navigation'}
        >
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((item) => item.group === group.key);
            return (
              <div key={group.key} className="space-y-1">
                {!isCollapsed && (
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-muted)]">
                    {group.heading}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map(({ id, label, Icon, shortcut }) => {
                    const globalIdx = NAV_ITEMS.findIndex((x) => x.id === id);
                    const isActive =
                      activePage === id ||
                      (activePage === 'detail' && id === 'explorer');
                    const navAriaLabel = `${label}${
                      id === 'compare' && compareCount > 0
                        ? ` (${compareCount} selected)`
                        : ''
                    }${shortcut ? ` (Shortcut: ${shortcut})` : ''}`;

                    return (
                      <button
                        key={id}
                        ref={(el) => {
                          if (isMobile) {
                            mobileNavRefs.current[globalIdx] = el;
                          } else {
                            desktopNavRefs.current[globalIdx] = el;
                          }
                        }}
                        type="button"
                        tabIndex={getSidebarTabIndex(globalIdx + 1)}
                        onClick={() => handleSelectNav(id)}
                        onKeyDown={(e) =>
                          handleNavKeyDown(e, globalIdx, isMobile)
                        }
                        aria-label={navAriaLabel}
                        aria-current={isActive ? 'page' : undefined}
                        aria-keyshortcuts={
                          shortcut ? shortcut.toLowerCase() : undefined
                        }
                        title={isCollapsed ? label : undefined}
                        className={`relative w-full flex items-center ${
                          isCollapsed ? 'justify-center px-2' : 'justify-between px-2.5'
                        } py-2 text-[13px] font-medium rounded-[8px] transition-colors whitespace-nowrap cursor-pointer ${
                          isActive
                            ? 'bg-[var(--accent-blue)]/12 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/70 border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive
                                ? 'text-[var(--accent-blue)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                            aria-hidden="true"
                          />
                          {!isCollapsed && (
                            <span className="truncate">{label}</span>
                          )}
                        </span>

                        {!isCollapsed && (
                          <span className="flex items-center gap-1.5 shrink-0">
                            {id === 'compare' && compareCount > 0 && (
                              <span className="font-mono-tabular text-[11px] px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-elevated)] text-[var(--accent-blue)] border border-[var(--border-subtle)]">
                                {compareCount}
                              </span>
                            )}
                            {shortcut && !isMobile && (
                              <kbd className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-primary)]/80 text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                {shortcut}
                              </kbd>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom utility bar */}
        <div className="px-2.5 pb-3 pt-2 border-t border-[var(--border-subtle)] space-y-2">
          <button
            type="button"
            tabIndex={getSidebarTabIndex(NAV_ITEMS.length + 1)}
            onClick={() => {
              setMobileMenuOpen(false);
              onToggleShortcuts(true);
            }}
            aria-label="Keyboard Shortcuts (Shortcut: ?)"
            aria-keyshortcuts="?"
            title={isCollapsed ? 'Keyboard Shortcuts (?)' : undefined}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-2.5'
            } py-2 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer`}
          >
            <span className="flex items-center gap-2">
              <Keyboard
                className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0"
                aria-hidden="true"
              />
              {!isCollapsed && <span>Shortcuts</span>}
            </span>
            {!isCollapsed && (
              <kbd className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                ?
              </kbd>
            )}
          </button>

          {!isCollapsed && (
            <p className="px-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Independent student research platform · Not affiliated with NASA.
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Skip link */}
      <a
        href="#main-content"
        tabIndex={1}
        aria-label="Skip to main content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-[8px] focus:bg-[var(--accent-blue)] focus:text-[var(--accent-blue-contrast)] focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Desktop persistent collapsible sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-[74px]' : 'lg:w-[276px]'
        }`}
      >
        {renderSidebar(false)}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <button
            type="button"
            aria-label="Close navigation backdrop"
            onClick={() => {
              setMobileMenuOpen(false);
              mobileTriggerRef.current?.focus();
            }}
            className="fixed inset-0 bg-black/65"
          />
          <div className="relative z-10 w-72 max-w-[84vw] h-full">
            <div className="absolute top-3.5 right-3 z-20">
              <button
                ref={mobileCloseRef}
                type="button"
                aria-label="Close menu"
                onClick={() => {
                  setMobileMenuOpen(false);
                  mobileTriggerRef.current?.focus();
                }}
                className="p-2 rounded-[8px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {renderSidebar(true)}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Reference Modal */}
      <Modal
        open={shortcutsOpen}
        onClose={() => onToggleShortcuts(false)}
        titleId="shortcuts-dialog-title"
        title={
          <>
            <Keyboard
              className="w-4 h-4 text-[var(--accent-blue)]"
              aria-hidden="true"
            />
            <span>Keyboard Shortcuts &amp; Navigation</span>
          </>
        }
      >
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Shortcuts trigger anywhere outside form inputs. Inside the sidebar,
          use{' '}
          <kbd className="font-mono-tabular px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            Tab
          </kbd>{' '}
          or{' '}
          <kbd className="font-mono-tabular px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            ↑
          </kbd>{' '}
          /{' '}
          <kbd className="font-mono-tabular px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            ↓
          </kbd>{' '}
          arrows to move across sections.
        </p>

        <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[12px] bg-[var(--bg-secondary)]">
          {GLOBAL_SHORTCUTS.map((sc) => (
            <li
              key={sc.key}
              className="px-3.5 py-2.5 flex items-center justify-between gap-4 text-xs"
            >
              <div>
                <span className="block font-medium text-[var(--text-primary)]">
                  {sc.label}
                </span>
                <span className="block text-[var(--text-secondary)]">
                  {sc.description}
                </span>
              </div>
              <kbd className="font-mono-tabular text-xs px-2 py-1 rounded-[6px] bg-[var(--bg-card)] text-[var(--accent-blue)] border border-[var(--border-subtle)] shrink-0">
                {sc.displayKey}
              </kbd>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-14 bg-[var(--bg-secondary)]/95 backdrop-blur-sm border-b border-[var(--border-subtle)] px-4 lg:px-8 flex items-center justify-between gap-3">
          {/* Breadcrumb + Mobile trigger */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 -ml-1 rounded-[8px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="lg:hidden font-display font-bold text-[var(--text-primary)] whitespace-nowrap">
                FLAREX
              </span>
              <span className="lg:hidden text-[var(--text-muted)]" aria-hidden="true">
                /
              </span>
              <span className="text-[var(--text-secondary)] font-medium truncate">
                {currentNavLabel}
              </span>
              {activePage === 'detail' && breadcrumbDetail && (
                <>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    /
                  </span>
                  <span className="text-[var(--text-primary)] font-semibold truncate max-w-[160px] sm:max-w-xs">
                    {breadcrumbDetail}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Functional Global Search + Theme Toggle + Share */}
          <div className="flex items-center gap-2 shrink-0">
            <div ref={searchBoxRef} className="relative hidden md:block w-64 xl:w-80">
              <form onSubmit={handleGlobalSearchFormSubmit}>
                <label htmlFor="global-header-search" className="sr-only">
                  Global research search across investigations, fuels, and categories
                </label>
                <Search
                  className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={globalSearchInputRef}
                  id="global-header-search"
                  type="search"
                  role="combobox"
                  aria-expanded={searchDropdownOpen && globalQuery.trim().length > 0}
                  aria-controls="global-search-results"
                  value={globalQuery}
                  onFocus={() => setSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setGlobalQuery(e.target.value);
                    setSearchDropdownOpen(true);
                  }}
                  placeholder="Search studies, fuels, PSI IDs..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)]"
                />
              </form>

              {searchDropdownOpen && globalQuery.trim().length > 0 && (
                <div
                  id="global-search-results"
                  role="listbox"
                  aria-label="Matching research records"
                  className="absolute right-0 mt-1.5 w-[360px] rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-[var(--shadow-elevated)] overflow-hidden z-50"
                >
                  {globalHits.length === 0 ? (
                    <div className="p-4 text-xs text-[var(--text-secondary)]">
                      No records match &ldquo;{globalQuery.trim()}&rdquo;. Press Enter to open Explorer.
                    </div>
                  ) : (
                    <>
                      <ul className="divide-y divide-[var(--border-subtle)] max-h-80 overflow-y-auto">
                        {globalHits.map((hit) => (
                          <li key={hit.record.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={false}
                              onClick={() => handleSelectSearchHit(hit.record.id)}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-[var(--bg-elevated)] transition-colors flex items-start justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                  {hit.record.shortName} — {hit.record.name}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)] truncate">
                                  {hit.record.family} · {hit.record.platform}
                                </p>
                              </div>
                              <Badge tone="blue" className="shrink-0">
                                {hit.matchReason}
                              </Badge>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchDropdownOpen(false);
                          onGlobalSearchSubmit(globalQuery.trim());
                        }}
                        className="w-full px-3.5 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] text-xs font-medium text-[var(--accent-blue)] hover:underline flex items-center justify-between cursor-pointer"
                      >
                        <span>Filter Investigation Explorer by &ldquo;{globalQuery.trim()}&rdquo;</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'
              }
              title={
                theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'
              }
              className="inline-flex items-center justify-center p-2 rounded-[8px] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[var(--status-warning)]" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onCopyLink}
              aria-label="Copy link to active research page"
              aria-keyshortcuts="c"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[8px] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Link2
                className="w-3.5 h-3.5 text-[var(--accent-blue)]"
                aria-hidden="true"
              />
              <span className="hidden xl:inline">Share</span>
              <kbd className="font-mono-tabular text-[10px] px-1 py-0.2 rounded-[4px] bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                C
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              aria-label="Ask FLAREX Research Intelligence"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[8px] bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] hover:bg-[var(--accent-blue-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Ask AI</span>
            </button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 focus:outline-none"
        >
          <div key={`${activePage}-${breadcrumbDetail ?? ''}`} className="flarex-view-enter">
            {children}
          </div>
        </main>

        <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
            <p>
              FLAREX (Fire Learning and Research Explorer) · Independent student research platform for NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.
            </p>
            <div className="flex items-center gap-4 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('sources')}
                aria-label="Navigate to Sources and References"
                className="hover:text-[var(--accent-blue)] underline-offset-4 hover:underline cursor-pointer"
              >
                Sources &amp; References
              </button>
              <button
                type="button"
                onClick={() => onNavigate('about')}
                aria-label="Navigate to About FLAREX"
                className="hover:text-[var(--accent-blue)] underline-offset-4 hover:underline cursor-pointer"
              >
                About &amp; Transparency
              </button>
            </div>
          </div>
        </footer>
      </div>

      {copyToast && (
        <div
          key={copyToast.id}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`fixed bottom-5 right-5 z-[70] pointer-events-none flex items-center gap-2.5 px-4 py-2.5 rounded-[10px] border shadow-[var(--shadow-elevated)] text-sm font-medium bg-[var(--bg-card)] text-[var(--text-primary)] ${
            copyToast.isError
              ? 'border-[var(--status-warning)]/60'
              : 'border-[var(--status-success)]/60'
          }`}
        >
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
              copyToast.isError
                ? 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]'
                : 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
            }`}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <span>{copyToast.message}</span>
        </div>
      )}
    </div>
  );
}
