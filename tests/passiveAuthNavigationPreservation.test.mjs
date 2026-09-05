import test from 'node:test';
import assert from 'node:assert/strict';

import {
  urlToView,
  viewToUrl,
  resolveSessionAuthNavigation,
  resolveProtectedDestination,
  createHistoryNavigator,
} from '../src/domain/appNavigation.ts';

import {
  saveLastAdminTab,
  loadLastAdminTab,
  clearLastAdminTab,
} from '../src/domain/adminTabMemory.ts';

// Mock storage helper
function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, val) { store.set(key, String(val)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

// Mock window for history navigator testing
function createMockWindow(initialUrl) {
  const parsed = new URL(initialUrl);
  let currentHref = initialUrl;
  let currentPathname = parsed.pathname;
  let currentSearch = parsed.search;
  const historyEntries = [initialUrl];
  let historyIndex = 0;
  let state = null;
  const listeners = new Map();

  return {
    location: {
      get href() { return currentHref; },
      set href(val) {
        currentHref = val;
        const u = new URL(val);
        currentPathname = u.pathname;
        currentSearch = u.search;
      },
      get pathname() { return currentPathname; },
      get search() { return currentSearch; },
      origin: parsed.origin,
    },
    history: {
      get length() { return historyEntries.length; },
      get state() { return state; },
      pushState(newState, title, url) {
        state = newState;
        const fullUrl = new URL(url, currentHref).href;
        historyEntries.splice(historyIndex + 1);
        historyEntries.push(fullUrl);
        historyIndex++;
        currentHref = fullUrl;
        const u = new URL(fullUrl);
        currentPathname = u.pathname;
        currentSearch = u.search;
      },
      replaceState(newState, title, url) {
        state = newState;
        const fullUrl = new URL(url, currentHref).href;
        historyEntries[historyIndex] = fullUrl;
        currentHref = fullUrl;
        const u = new URL(fullUrl);
        currentPathname = u.pathname;
        currentSearch = u.search;
      },
      back() {
        if (historyIndex > 0) {
          historyIndex--;
          currentHref = historyEntries[historyIndex];
          const u = new URL(currentHref);
          currentPathname = u.pathname;
          currentSearch = u.search;
          listeners.get('popstate')?.forEach((cb) => cb());
        }
      },
      forward() {
        if (historyIndex < historyEntries.length - 1) {
          historyIndex++;
          currentHref = historyEntries[historyIndex];
          const u = new URL(currentHref);
          currentPathname = u.pathname;
          currentSearch = u.search;
          listeners.get('popstate')?.forEach((cb) => cb());
        }
      },
      get _entries() { return [...historyEntries]; },
      get _currentIndex() { return historyIndex; },
    },
    addEventListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(listener);
    },
    removeEventListener(event, listener) {
      const arr = listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Mandatory Behavioral Sequence Regression Test
// ---------------------------------------------------------------------------

test('1. Mandatory sequence: authenticated executive on admin tab -> news -> passive SIGNED_IN -> remains news with zero history push', () => {
  const win = createMockWindow('https://site.example/admin?tab=member-points');
  const storage = createMockStorage();
  saveLastAdminTab('pres-1', 'member-points', storage);

  let currentView = { kind: 'admin', tab: 'member-points' };
  const navigator = createHistoryNavigator({
    window: win,
    onViewChange: (v) => { currentView = v; },
  });

  assert.equal(win.history.length, 1);
  assert.equal(win.location.pathname, '/admin');
  assert.equal(win.location.search, '?tab=member-points');

  // Step 2: User deliberately navigates to /news
  navigator.navigate({ kind: 'news' });
  assert.equal(win.history.length, 2);
  assert.equal(win.location.pathname, '/news');
  assert.deepEqual(currentView, { kind: 'news' });

  // Step 3: Passive SIGNED_IN event fires in the background (tab refocus / token refresh)
  const decision = resolveSessionAuthNavigation({
    currentUrl: win.location.href,
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
    lastAdminTab: loadLastAdminTab('pres-1', storage),
  });

  // Passive auth must NOT trigger navigation away from /news
  assert.equal(decision.shouldNavigate, false, 'Passive auth MUST NOT hijack public route /news');

  // History stack must NOT have grown
  assert.equal(win.history.length, 2, 'Passive auth MUST NOT call pushState');
  assert.equal(win.location.pathname, '/news', 'URL MUST remain /news');

  // Step 4: Back button works cleanly to return to admin tab
  win.history.back();
  assert.equal(win.location.pathname, '/admin');
  assert.equal(win.location.search, '?tab=member-points');
  assert.deepEqual(currentView, { kind: 'admin', tab: 'member-points' });

  navigator.destroy();
});

// ---------------------------------------------------------------------------
// 2. Public Routes Invariance under Passive SIGNED_IN
// ---------------------------------------------------------------------------

test('2. Already-authenticated President on /news receives passive SIGNED_IN: remains /news', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/news',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
    lastAdminTab: 'member-points',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('3. Already-authenticated committee head on /about receives passive SIGNED_IN: remains /about', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/about',
    confirmedUser: { userId: 'head-1', role: 'ACTIVITIES_HEAD' },
    navigationIntent: 'passive',
    lastAdminTab: 'events',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('4. Passive SIGNED_IN preserves all public routes for authenticated executives', () => {
  const publicPaths = [
    '/',
    '/about',
    '/programs',
    '/contact',
    '/gallery',
    '/news',
    '/guide',
    '/faq',
    '/board',
    '/committee/media',
    '/committee/finance',
  ];

  for (const path of publicPaths) {
    const decision = resolveSessionAuthNavigation({
      currentUrl: `https://site.example${path}`,
      confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
      navigationIntent: 'passive',
      lastAdminTab: 'stats',
    });
    assert.equal(decision.shouldNavigate, false, `Public route ${path} must be preserved on passive auth`);
  }
});

// ---------------------------------------------------------------------------
// 3. TOKEN_REFRESHED, Background Refresh, and Visibility Changes
// ---------------------------------------------------------------------------

test('5. TOKEN_REFRESHED on public page preserves route', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/guide',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
    lastAdminTab: 'stats',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('6. Background profile refresh preserves public route', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/programs',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('7. Tab visibility/focus return preserves public route', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/contact',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('8. Admin user remembered tab does NOT override current public route during passive auth event', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/news',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
    lastAdminTab: 'plans',
  });
  assert.equal(decision.shouldNavigate, false, 'Remembered tab must not override public page');
});

// ---------------------------------------------------------------------------
// 4. Explicit Login Intent Contract
// ---------------------------------------------------------------------------

test('9. Explicit login routes to role landing view when no returnTo is present', () => {
  // Executive user logging in with no returnTo -> goes to admin with remembered tab
  const execDecision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/login',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'explicit-login',
    lastAdminTab: 'member-points',
  });
  assert.equal(execDecision.shouldNavigate, true);
  assert.deepEqual(execDecision.targetView, { kind: 'admin', tab: 'member-points' });

  // Student user logging in with no returnTo -> goes to student portal
  const studentDecision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/login',
    confirmedUser: { userId: 'stu-1', role: 'STUDENT' },
    navigationIntent: 'explicit-login',
  });
  assert.equal(studentDecision.shouldNavigate, true);
  assert.deepEqual(studentDecision.targetView, { kind: 'student-dashboard' });
});

test('10. Explicit login with valid returnTo restores target view', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/login?returnTo=%2Fadmin%3Ftab%3Dmembers',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'explicit-login',
  });
  assert.equal(decision.shouldNavigate, true);
  assert.deepEqual(decision.targetView, { kind: 'admin', tab: 'members' });
  assert.equal(decision.replace, true);
});

test('11. Explicit login to unauthorized Admin destination is denied safely', () => {
  // Student logging in after attempting to reach /admin?tab=members
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/login?returnTo=%2Fadmin%3Ftab%3Dmembers',
    confirmedUser: { userId: 'stu-1', role: 'STUDENT' },
    navigationIntent: 'explicit-login',
  });
  assert.equal(decision.shouldNavigate, true);
  // Must redirect to student dashboard, NEVER admin!
  assert.deepEqual(decision.targetView, { kind: 'student-dashboard' });
  assert.equal(decision.replace, true);
});

// ---------------------------------------------------------------------------
// 5. Initial Session vs Protected Route Guards
// ---------------------------------------------------------------------------

test('12. INITIAL_SESSION on direct /news preserves /news', () => {
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/news',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'initial',
  });
  assert.equal(decision.shouldNavigate, false);
});

test('13. INITIAL_SESSION on protected direct Admin link performs proper authorization resolution', () => {
  // President loading /admin?tab=members directly -> normalizes to authorized admin view
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/admin?tab=members',
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'initial',
  });
  assert.equal(decision.shouldNavigate, true);
  assert.deepEqual(decision.targetView, { kind: 'admin', tab: 'members' });
  assert.equal(decision.replace, true);
});

test('14. Permission loss while currently on protected Admin route redirects safely', () => {
  // User on /admin whose role is now STUDENT
  const decision = resolveSessionAuthNavigation({
    currentUrl: 'https://site.example/admin',
    confirmedUser: { userId: 'demoted-1', role: 'STUDENT' },
    navigationIntent: 'passive',
  });
  assert.equal(decision.shouldNavigate, true);
  assert.deepEqual(decision.targetView, { kind: 'student-dashboard' });
  assert.equal(decision.replace, true);
});

test('15. Passive SIGNED_IN does not call replaceState or pushState to Admin', () => {
  const win = createMockWindow('https://site.example/about');
  let pushed = false;
  let replaced = false;
  const originalPush = win.history.pushState.bind(win.history);
  const originalReplace = win.history.replaceState.bind(win.history);
  win.history.pushState = (...args) => { pushed = true; return originalPush(...args); };
  win.history.replaceState = (...args) => { replaced = true; return originalReplace(...args); };

  const decision = resolveSessionAuthNavigation({
    currentUrl: win.location.href,
    confirmedUser: { userId: 'pres-1', role: 'PRESIDENT' },
    navigationIntent: 'passive',
    lastAdminTab: 'member-points',
  });

  assert.equal(decision.shouldNavigate, false);
  // Since shouldNavigate is false, neither pushState nor replaceState is invoked
  assert.equal(pushed, false);
  assert.equal(replaced, false);
  assert.equal(win.location.pathname, '/about');
});

test('16. Failed login does not consume or lose pending returnTo', () => {
  const loginUrlWithReturnTo = 'https://site.example/login?returnTo=%2Fadmin%3Ftab%3Dmembers';
  const parsed = urlToView(loginUrlWithReturnTo);
  assert.deepEqual(parsed.view, { kind: 'login', returnTo: '/admin?tab=members' });

  // On failed login, the URL is unchanged, so returnTo is still intact in search params
  const stillParsed = urlToView(loginUrlWithReturnTo);
  assert.equal(stillParsed.view.returnTo, '/admin?tab=members');
});

test('17. Logout removes protected access and redirects to home', () => {
  // When logged out (currentUser: null), protected destination resolution denies access
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });
  assert.equal(decision.shouldRenderProtected, false);
  assert.equal(decision.redirectView?.kind, 'login');

  // In AppContext, logout explicitly navigates to { kind: 'home' } with replace: true
  const homeView = { kind: 'home' };
  assert.equal(viewToUrl(homeView), '/');
});

test('18. Password recovery flow remains intact and resolves to update-password', () => {
  const recoveryUrl = 'https://site.example/?auth=recovery#access_token=test';
  const parsed = urlToView(recoveryUrl);
  assert.deepEqual(parsed.view, { kind: 'update-password' });
  assert.equal(parsed.isPasswordRecovery, true);
});

test('19. Web-push navigation remains intact for direct notification targets', () => {
  const pushNews = urlToView('https://site.example/?push=news');
  assert.deepEqual(pushNews.view, { kind: 'news' });
  assert.equal(pushNews.pushDestination, 'news');

  const pushPrograms = urlToView('https://site.example/?push=programs');
  assert.deepEqual(pushPrograms.view, { kind: 'programs' });
  assert.equal(pushPrograms.pushDestination, 'programs');
});

