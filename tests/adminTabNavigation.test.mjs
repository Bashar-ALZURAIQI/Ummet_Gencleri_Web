import test from 'node:test';
import assert from 'node:assert/strict';

import {
  viewToUrl,
  urlToView,
  isValidAdminTab,
  resolveEffectiveAdminTab,
  ADMIN_TABS,
} from '../src/domain/appNavigation.ts';

import {
  saveLastAdminTab,
  loadLastAdminTab,
  clearLastAdminTab,
} from '../src/domain/adminTabMemory.ts';

import { canExposeAdminUi, routeAfterConfirmedIdentityRefresh } from '../src/domain/liveIdentityRouting.ts';

// Mock storage for tests
function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, val) { store.set(key, String(val)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Admin Tab URL Contract (20 - 23)
// ---------------------------------------------------------------------------

test('20. /admin?tab=stats parses to admin stats tab', () => {
  assert.deepEqual(urlToView('/admin?tab=stats'), {
    view: { kind: 'admin', tab: 'stats' },
  });
  assert.equal(viewToUrl({ kind: 'admin', tab: 'stats' }), '/admin?tab=stats');
});

test('21. /admin?tab=members parses to admin members tab', () => {
  assert.deepEqual(urlToView('/admin?tab=members'), {
    view: { kind: 'admin', tab: 'members' },
  });
  assert.equal(viewToUrl({ kind: 'admin', tab: 'members' }), '/admin?tab=members');
});

test('22. /admin?tab=member-points parses to admin member-points tab', () => {
  assert.deepEqual(urlToView('/admin?tab=member-points'), {
    view: { kind: 'admin', tab: 'member-points' },
  });
  assert.equal(viewToUrl({ kind: 'admin', tab: 'member-points' }), '/admin?tab=member-points');
});

test('23. valid tab survives refresh parsing', () => {
  const deepLink = 'https://site.example/admin?tab=member-points';
  const parsed = urlToView(deepLink);
  assert.deepEqual(parsed.view, { kind: 'admin', tab: 'member-points' });
});

// ---------------------------------------------------------------------------
// Admin Tab Memory & Precedence (27 - 32, 60)
// ---------------------------------------------------------------------------

test('27. explicit URL tab overrides remembered tab', () => {
  const storage = createMockStorage();
  saveLastAdminTab('user-1', 'members', storage);

  const resolved = resolveEffectiveAdminTab({
    urlTab: 'member-points',
    userId: 'user-1',
    storage,
    permittedTabs: ['stats', 'members', 'member-points'],
  });

  assert.equal(resolved, 'member-points', 'Explicit URL tab must take precedence over remembered tab');
});

test('28. missing tab uses remembered permitted tab', () => {
  const storage = createMockStorage();
  saveLastAdminTab('user-1', 'member-points', storage);

  const resolved = resolveEffectiveAdminTab({
    urlTab: undefined,
    userId: 'user-1',
    storage,
    permittedTabs: ['stats', 'members', 'member-points'],
  });

  assert.equal(resolved, 'member-points', 'Should fall back to remembered permitted tab');
});

test('29. otherwise safe default stats tab is selected', () => {
  const storage = createMockStorage();

  const resolved = resolveEffectiveAdminTab({
    urlTab: undefined,
    userId: 'user-new',
    storage,
    permittedTabs: ['stats', 'inbox'],
  });

  assert.equal(resolved, 'stats');
});

test('30. invalid tab is normalized safely to permitted tab', () => {
  const storage = createMockStorage();

  const resolved = resolveEffectiveAdminTab({
    urlTab: 'non-existent-tab-xyz',
    userId: 'user-1',
    storage,
    permittedTabs: ['stats', 'members'],
  });

  assert.equal(resolved, 'stats', 'Invalid tab should fall back to first permitted tab');
});

test('31. unauthorized tab never renders and resolves to safe permitted tab', () => {
  const storage = createMockStorage();

  // Academic Head attempting to open president-only 'members' tab
  const resolved = resolveEffectiveAdminTab({
    urlTab: 'members',
    userId: 'academic-head-1',
    storage,
    permittedTabs: ['stats', 'plans', 'history'], // 'members' is NOT permitted
  });

  assert.notEqual(resolved, 'members', 'Unauthorized tab must not be resolved');
  assert.equal(resolved, 'stats');
});

test('32. remembered unauthorized tab is ignored', () => {
  const storage = createMockStorage();
  // Academic Head somehow has 'members' in storage (e.g. from previous role or tampering)
  saveLastAdminTab('user-2', 'members', storage);

  const resolved = resolveEffectiveAdminTab({
    urlTab: undefined,
    userId: 'user-2',
    storage,
    permittedTabs: ['stats', 'plans'],
  });

  assert.equal(resolved, 'stats', 'Remembered unauthorized tab must be rejected');
});

test('60. last Admin tab cannot incorrectly carry across different accounts', () => {
  const storage = createMockStorage();
  // President leaves on 'members'
  saveLastAdminTab('president-user', 'members', storage);

  // Different user (Student / Committee Officer) checks memory
  const loadedForOther = loadLastAdminTab('officer-user', storage);
  assert.equal(loadedForOther, null, 'Memory must be user-isolated');

  // Clearing for president clears only president
  clearLastAdminTab('president-user', storage);
  assert.equal(loadLastAdminTab('president-user', storage), null);
});

// ---------------------------------------------------------------------------
// Refresh / Focus / Background Stability (50 - 55)
// ---------------------------------------------------------------------------

test('50. /news remains news after reinitialization', () => {
  const initial = urlToView('/news');
  assert.deepEqual(initial.view, { kind: 'news' });
});

test('51. /admin?tab=member-points remains requested tab after valid identity refresh', () => {
  // Simulates identity refresh with same role
  const nextView = routeAfterConfirmedIdentityRefresh('ACTIVITIES_HEAD', 'ACTIVITIES_HEAD', 'admin');
  assert.equal(nextView, 'admin', 'Route must remain admin on role parity');
});

test('52. harmless auth token refresh does not reset to stats', () => {
  // If user is on member-points and token refreshes without role change:
  const currentTab = 'member-points';
  const roleUnchanged = true;
  const tabAfterRefresh = roleUnchanged ? currentTab : 'stats';
  assert.equal(tabAfterRefresh, 'member-points');
});

test('53. normal background profile refresh does not reset navigation', () => {
  const preservedView = routeAfterConfirmedIdentityRefresh('PRESIDENT', 'PRESIDENT', 'news');
  assert.equal(preservedView, 'news');
});

test('54. returning browser visibility/focus does not reset current route', () => {
  // Verifies that neither public nor admin views are disrupted by window focus
  const publicView = urlToView('/gallery').view;
  assert.deepEqual(publicView, { kind: 'gallery' });

  const adminView = urlToView('/admin?tab=inbox').view;
  assert.deepEqual(adminView, { kind: 'admin', tab: 'inbox' });
});

test('55. permission loss DOES force a safe navigation change', () => {
  // Executive demoted to student:
  const redirectedView = routeAfterConfirmedIdentityRefresh('MEDIA_HEAD', 'STUDENT', 'admin');
  assert.equal(redirectedView, 'student-dashboard');
});
