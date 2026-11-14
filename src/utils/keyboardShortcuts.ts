import type { AppPage } from '../components/Layout.tsx';

export type ShortcutAction =
  | { type: 'NAVIGATE'; page: Exclude<AppPage, 'detail'>; focusTarget?: 'search' | 'assistant' }
  | { type: 'COPY_URL' }
  | { type: 'TOGGLE_HELP' };

export interface ShortcutTargetInfo {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface ShortcutModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface ShortcutDefinition {
  key: string;
  displayKey: string;
  label: string;
  description: string;
}

export const GLOBAL_SHORTCUTS: ShortcutDefinition[] = [
  {
    key: 'h',
    displayKey: 'H',
    label: 'Go to Overview',
    description: 'Navigate to Home / Overview dashboard',
  },
  {
    key: 's',
    displayKey: 'S',
    label: 'Search Investigations',
    description: 'Open Investigation Explorer and focus the search input',
  },
  {
    key: 'a',
    displayKey: 'A',
    label: 'Open AI Assistant',
    description: 'Open FLAREX Research Intelligence and focus the prompt input',
  },
  {
    key: 'c',
    displayKey: 'C',
    label: 'Copy Page Link',
    description: 'Copy the current URL of the active research page to clipboard',
  },
  {
    key: 'm',
    displayKey: 'M',
    label: 'Compare Studies',
    description: 'Navigate to Investigation Comparison',
  },
  {
    key: 'd',
    displayKey: 'D',
    label: 'Data Explorer',
    description: 'Navigate to Scientific Data Explorer',
  },
  {
    key: 'g',
    displayKey: 'G',
    label: 'Research Gaps',
    description: 'Navigate to Research Gap Explorer',
  },
  {
    key: '?',
    displayKey: '?',
    label: 'Keyboard Shortcuts',
    description: 'Toggle this keyboard shortcuts reference',
  },
];

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function shouldIgnoreShortcutEvent(
  target: ShortcutTargetInfo | null,
  modifiers: ShortcutModifiers
): boolean {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) {
    return true;
  }
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  return EDITABLE_TAGS.has(tag);
}

export function resolveGlobalShortcut(key: string): ShortcutAction | null {
  if (key === '?') {
    return { type: 'TOGGLE_HELP' };
  }

  const normalized = key.toLowerCase();
  switch (normalized) {
    case 'h':
      return { type: 'NAVIGATE', page: 'overview' };
    case 's':
    case '/':
      return { type: 'NAVIGATE', page: 'explorer', focusTarget: 'search' };
    case 'a':
      return { type: 'NAVIGATE', page: 'assistant', focusTarget: 'assistant' };
    case 'c':
      return { type: 'COPY_URL' };
    case 'm':
      return { type: 'NAVIGATE', page: 'compare' };
    case 'd':
      return { type: 'NAVIGATE', page: 'data' };
    case 'g':
      return { type: 'NAVIGATE', page: 'gaps' };
    default:
      return null;
  }
}

export function getNextSidebarIndex(
  currentIndex: number,
  key: string,
  totalItems: number
): number | null {
  if (totalItems <= 0) return null;
  if (key === 'ArrowDown') {
    return (currentIndex + 1) % totalItems;
  }
  if (key === 'ArrowUp') {
    return (currentIndex - 1 + totalItems) % totalItems;
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return totalItems - 1;
  }
  return null;
}

export function getSidebarTabIndex(slotIndex: number, baseOffset = 2): number {
  return Math.max(1, baseOffset + slotIndex);
}
