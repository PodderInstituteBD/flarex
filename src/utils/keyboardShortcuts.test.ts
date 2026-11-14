import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextSidebarIndex,
  getSidebarTabIndex,
  resolveGlobalShortcut,
  shouldIgnoreShortcutEvent,
} from './keyboardShortcuts.ts';

test('resolveGlobalShortcut maps h, s, /, a, c, m, d, g, and ? accurately', () => {
  assert.deepEqual(resolveGlobalShortcut('h'), {
    type: 'NAVIGATE',
    page: 'overview',
  });
  assert.deepEqual(resolveGlobalShortcut('H'), {
    type: 'NAVIGATE',
    page: 'overview',
  });
  assert.deepEqual(resolveGlobalShortcut('s'), {
    type: 'NAVIGATE',
    page: 'explorer',
    focusTarget: 'search',
  });
  assert.deepEqual(resolveGlobalShortcut('/'), {
    type: 'NAVIGATE',
    page: 'explorer',
    focusTarget: 'search',
  });
  assert.deepEqual(resolveGlobalShortcut('a'), {
    type: 'NAVIGATE',
    page: 'assistant',
    focusTarget: 'assistant',
  });
  assert.deepEqual(resolveGlobalShortcut('c'), { type: 'COPY_URL' });
  assert.deepEqual(resolveGlobalShortcut('C'), { type: 'COPY_URL' });
  assert.deepEqual(resolveGlobalShortcut('m'), {
    type: 'NAVIGATE',
    page: 'compare',
  });
  assert.deepEqual(resolveGlobalShortcut('d'), {
    type: 'NAVIGATE',
    page: 'data',
  });
  assert.deepEqual(resolveGlobalShortcut('g'), {
    type: 'NAVIGATE',
    page: 'gaps',
  });
  assert.deepEqual(resolveGlobalShortcut('?'), { type: 'TOGGLE_HELP' });
  assert.equal(resolveGlobalShortcut('z'), null);
});

test('shouldIgnoreShortcutEvent ignores editable fields and modifier combos', () => {
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'INPUT', isContentEditable: false },
      { ctrlKey: false, metaKey: false, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'TEXTAREA', isContentEditable: false },
      { ctrlKey: false, metaKey: false, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'SELECT', isContentEditable: false },
      { ctrlKey: false, metaKey: false, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'DIV', isContentEditable: true },
      { ctrlKey: false, metaKey: false, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'BODY', isContentEditable: false },
      { ctrlKey: true, metaKey: false, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'BODY', isContentEditable: false },
      { ctrlKey: false, metaKey: true, altKey: false }
    ),
    true
  );
  assert.equal(
    shouldIgnoreShortcutEvent(
      { tagName: 'BUTTON', isContentEditable: false },
      { ctrlKey: false, metaKey: false, altKey: false }
    ),
    false
  );
});

test('getNextSidebarIndex computes circular ArrowUp/ArrowDown and Home/End indices', () => {
  assert.equal(getNextSidebarIndex(0, 'ArrowDown', 8), 1);
  assert.equal(getNextSidebarIndex(7, 'ArrowDown', 8), 0);
  assert.equal(getNextSidebarIndex(0, 'ArrowUp', 8), 7);
  assert.equal(getNextSidebarIndex(4, 'Home', 8), 0);
  assert.equal(getNextSidebarIndex(2, 'End', 8), 7);
  assert.equal(getNextSidebarIndex(2, 'Enter', 8), null);
});

test('getSidebarTabIndex produces a distinct strictly increasing tabIndex sequence', () => {
  const indices = Array.from({ length: 10 }, (_, i) => getSidebarTabIndex(i));
  assert.deepEqual(indices, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(new Set(indices).size, indices.length);
});
