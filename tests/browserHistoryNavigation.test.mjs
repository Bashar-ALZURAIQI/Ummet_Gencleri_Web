import test from 'node:test';
import assert from 'node:assert/strict';

import {
  viewToUrl,
  urlToView,
  createHistoryNavigator,
} from '../src/domain/appNavigation.ts';

function createMockBrowserWindow(initialUrl = 'https://site.example/') {
  const historyEntries = [initialUrl];
  let currentIndex = 0;
  const popstateListeners = [];

  return {
    location: {
      get href() {
        return historyEntries[currentIndex];
      },
      get pathname() {
        return new URL(historyEntries[currentIndex]).pathname;
      },
      get search() {
        return new URL(historyEntries[currentIndex]).search;
      },
      origin: 'https://site.example',
    },
    history: {
      get length() {
        return historyEntries.length;
      },
      get state() {
        return null;
      },
      pushState(state, title, url) {
        const fullUrl = new URL(url, 'https://site.example').toString();
        // Truncate any forward history and append
        historyEntries.splice(currentIndex + 1);
        historyEntries.push(fullUrl);
        currentIndex = historyEntries.length - 1;
      },
      replaceState(state, title, url) {
        const fullUrl = new URL(url, 'https://site.example').toString();
        historyEntries[currentIndex] = fullUrl;
      },
      back() {
        if (currentIndex > 0) {
          currentIndex -= 1;
          for (const listener of popstateListeners) listener();
        }
      },
      forward() {
        if (currentIndex < historyEntries.length - 1) {
          currentIndex += 1;
          for (const listener of popstateListeners) listener();
        }
      },
    },
    addEventListener(event, listener) {
      if (event === 'popstate') popstateListeners.push(listener);
    },
    removeEventListener(event, listener) {
      if (event === 'popstate') {
        const idx = popstateListeners.indexOf(listener);
        if (idx !== -1) popstateListeners.splice(idx, 1);
      }
    },
    getHistoryEntries() {
      return [...historyEntries];
    },
    getCurrentIndex() {
      return currentIndex;
    },
  };
}

// ---------------------------------------------------------------------------
// Browser History Tests (14 - 19, 24 - 26, 64)
// ---------------------------------------------------------------------------

test('14. user navigation creates pushState entry', () => {
  const mockWin = createMockBrowserWindow('https://site.example/');
  let currentView = { kind: 'home' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'about' });
  assert.equal(mockWin.location.pathname, '/about');
  assert.equal(mockWin.history.length, 2);
  assert.deepEqual(currentView, { kind: 'about' });

  navigator.navigate({ kind: 'programs' });
  assert.equal(mockWin.location.pathname, '/programs');
  assert.equal(mockWin.history.length, 3);
  assert.deepEqual(currentView, { kind: 'programs' });
});

test('15. same destination does not create duplicate history entry', () => {
  const mockWin = createMockBrowserWindow('https://site.example/news');
  let currentView = { kind: 'news' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  assert.equal(mockWin.history.length, 1);
  navigator.navigate({ kind: 'news' });
  assert.equal(mockWin.history.length, 1, 'Should not push duplicate entry for same view');
});

test('16. Back/popstate updates View without pushState', () => {
  const mockWin = createMockBrowserWindow('https://site.example/');
  let currentView = { kind: 'home' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'about' });
  navigator.navigate({ kind: 'news' });
  assert.equal(mockWin.history.length, 3);
  assert.deepEqual(currentView, { kind: 'news' });

  // Simulate Back button
  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'about' });
  assert.equal(mockWin.history.length, 3, 'Back should not increase history length');

  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'home' });
  assert.equal(mockWin.history.length, 3);
});

test('17. Forward/popstate works correctly', () => {
  const mockWin = createMockBrowserWindow('https://site.example/');
  let currentView = { kind: 'home' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'about' });
  navigator.navigate({ kind: 'news' });

  mockWin.history.back();
  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'home' });

  // Forward
  mockWin.history.forward();
  assert.deepEqual(currentView, { kind: 'about' });

  mockWin.history.forward();
  assert.deepEqual(currentView, { kind: 'news' });
});

test('18. refresh/direct parse preserves destination', () => {
  const mockWin = createMockBrowserWindow('https://site.example/gallery');
  const initial = urlToView(mockWin.location.href);
  assert.deepEqual(initial.view, { kind: 'gallery' });
});

test('19. no popstate navigation loop', () => {
  const mockWin = createMockBrowserWindow('https://site.example/');
  let popstateCount = 0;
  let pushStateCount = 0;

  const originalPush = mockWin.history.pushState.bind(mockWin.history);
  mockWin.history.pushState = (state, title, url) => {
    pushStateCount += 1;
    originalPush(state, title, url);
  };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: () => {
      popstateCount += 1;
    },
  });

  navigator.navigate({ kind: 'about' }); // push 1
  navigator.navigate({ kind: 'news' });  // push 2
  assert.equal(pushStateCount, 2);

  // Trigger popstate via back
  mockWin.history.back();
  // pushStateCount must NOT increase on popstate!
  assert.equal(pushStateCount, 2, 'popstate handling must never trigger pushState');
});

test('24. tab change creates browser history', () => {
  const mockWin = createMockBrowserWindow('https://site.example/admin?tab=stats');
  let currentView = { kind: 'admin', tab: 'stats' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'admin', tab: 'members' });
  assert.equal(mockWin.location.pathname, '/admin');
  assert.equal(mockWin.location.search, '?tab=members');
  assert.equal(mockWin.history.length, 2);

  navigator.navigate({ kind: 'admin', tab: 'member-points' });
  assert.equal(mockWin.location.search, '?tab=member-points');
  assert.equal(mockWin.history.length, 3);
});

test('25. Back changes Admin tab', () => {
  const mockWin = createMockBrowserWindow('https://site.example/admin?tab=stats');
  let currentView = { kind: 'admin', tab: 'stats' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'admin', tab: 'members' });
  navigator.navigate({ kind: 'admin', tab: 'member-points' });

  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'admin', tab: 'members' });
  assert.equal(mockWin.location.search, '?tab=members');

  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'admin', tab: 'stats' });
  assert.equal(mockWin.location.search, '?tab=stats');
});

test('26. Forward changes Admin tab', () => {
  const mockWin = createMockBrowserWindow('https://site.example/admin?tab=stats');
  let currentView = { kind: 'admin', tab: 'stats' };

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: (next) => { currentView = next; },
  });

  navigator.navigate({ kind: 'admin', tab: 'members' });
  mockWin.history.back();
  assert.deepEqual(currentView, { kind: 'admin', tab: 'stats' });

  mockWin.history.forward();
  assert.deepEqual(currentView, { kind: 'admin', tab: 'members' });
});

test('64. push query cleanup uses replaceState and does not create duplicate Back history', () => {
  const mockWin = createMockBrowserWindow('https://site.example/?push=news');
  let pushStateCount = 0;
  let replaceStateCount = 0;

  const originalPush = mockWin.history.pushState.bind(mockWin.history);
  mockWin.history.pushState = (state, title, url) => {
    pushStateCount += 1;
    originalPush(state, title, url);
  };

  const originalReplace = mockWin.history.replaceState.bind(mockWin.history);
  mockWin.history.replaceState = (state, title, url) => {
    replaceStateCount += 1;
    originalReplace(state, title, url);
  };

  const parsed = urlToView(mockWin.location.href);
  assert.equal(parsed.pushDestination, 'news');

  const navigator = createHistoryNavigator({
    window: mockWin,
    onViewChange: () => {},
  });

  // Clean up push parameter using replace
  navigator.cleanPushQuery();
  assert.equal(replaceStateCount, 1, 'Should call replaceState to clean push param');
  assert.equal(pushStateCount, 0, 'Should not pushState when cleaning push param');
  assert.equal(mockWin.location.search, '');
  assert.equal(mockWin.history.length, 1);
});
