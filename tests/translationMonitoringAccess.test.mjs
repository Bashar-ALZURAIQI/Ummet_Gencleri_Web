import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_TABS,
  isValidAdminTab,
  resolveEffectiveAdminTab,
} from '../src/domain/appNavigation.ts';
import { resolveCmsEditDestination } from '../src/domain/translationNavigation.ts';
import ar from '../src/i18n/locales/ar.ts';
import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

/**
 * Mirror of AdminDashboard visibleTabs visibility condition for translation-monitoring:
 * currentUser?.role === 'PRESIDENT' || currentUser?.role === 'MEDIA_HEAD'
 */
function isTranslationMonitoringTabVisible(role) {
  return role === 'PRESIDENT' || role === 'MEDIA_HEAD';
}

test('1. translation-monitoring is included in ADMIN_TABS registry', () => {
  assert.ok(ADMIN_TABS.includes('translation-monitoring'));
  assert.equal(isValidAdminTab('translation-monitoring'), true);
});

test('2. translation-monitoring is visible to PRESIDENT and MEDIA_HEAD', () => {
  assert.equal(isTranslationMonitoringTabVisible('PRESIDENT'), true);
  assert.equal(isTranslationMonitoringTabVisible('MEDIA_HEAD'), true);
});

test('3. translation-monitoring is strictly HIDDEN from all other roles', () => {
  const unauthorizedRoles = [
    'SUPER_ADMIN',
    'GENERAL_SECRETARY',
    'FINANCE_HEAD',
    'SUPERVISORY_HEAD',
    'STUDENT_AFFAIRS_HEAD',
    'SCOUTS_HEAD',
    'SPORTS_HEAD',
    'CULTURE_HEAD',
    'MEMBER',
    'VOLUNTEER',
    undefined,
    null,
    '',
  ];

  for (const role of unauthorizedRoles) {
    assert.equal(
      isTranslationMonitoringTabVisible(role),
      false,
      `Role ${role} must not have access to translation-monitoring tab`,
    );
  }
});

test('4. resolveEffectiveAdminTab permits translation-monitoring for authorized roles', () => {
  const presidentTabs = ['stats', 'board', 'translation-monitoring', 'profile'];
  const effectiveTab = resolveEffectiveAdminTab({
    requestedTab: 'translation-monitoring',
    userId: 'pres-123',
    permittedTabs: presidentTabs,
  });
  assert.equal(effectiveTab, 'translation-monitoring');
});

test('5. resolveEffectiveAdminTab redirects unauthorized user away from translation-monitoring', () => {
  const memberTabs = ['stats', 'profile'];
  const effectiveTab = resolveEffectiveAdminTab({
    requestedTab: 'translation-monitoring',
    userId: 'member-456',
    permittedTabs: memberTabs,
  });
  assert.notEqual(effectiveTab, 'translation-monitoring');
  assert.equal(effectiveTab, 'stats');
});

test('6. i18n dictionaries include translation-monitoring tab label', () => {
  assert.equal(ar.admin.tabs.translationMonitoring, 'مراقبة الترجمة');
  assert.equal(tr.admin.tabs.translationMonitoring, 'Çeviri Takibi');
  assert.equal(en.admin.tabs.translationMonitoring, 'Translation Monitoring');
});

test('7. i18n dictionaries contain complete translationMonitoring namespace', () => {
  const locales = [ar, tr, en];
  for (const loc of locales) {
    assert.ok(loc.admin.translationMonitoring, 'admin.translationMonitoring namespace must exist');
    assert.ok(loc.admin.translationMonitoring.title, 'title must exist');
    assert.ok(loc.admin.translationMonitoring.fresh, 'fresh label must exist');
    assert.ok(loc.admin.translationMonitoring.missing, 'missing label must exist');
    assert.ok(loc.admin.translationMonitoring.stale, 'stale label must exist');
    assert.ok(loc.admin.translationMonitoring.draft, 'draft label must exist');
    assert.ok(loc.admin.translationMonitoring.goToEdit, 'goToEdit action label must exist');
  }
});

test('8. resolveCmsEditDestination maps all 15 CMS targets to valid AppViews', () => {
  const targets = [
    { target: 'site', expected: { kind: 'home' } },
    { target: 'about', expected: { kind: 'about' } },
    { target: 'programsContent', expected: { kind: 'programs' } },
    { target: 'events', expected: { kind: 'admin', tab: 'events' } },
    { target: 'galleryAlbums', expected: { kind: 'admin', tab: 'gallery' } },
    { target: 'galleryCategories', expected: { kind: 'admin', tab: 'gallery' } },
    { target: 'news', expected: { kind: 'admin', tab: 'news' } },
    { target: 'plans', expected: { kind: 'admin', tab: 'plans' } },
    { target: 'reports', expected: { kind: 'admin', tab: 'plans' } },
    { target: 'committees', expected: { kind: 'admin', tab: 'board' } },
    {
      target: 'committees',
      entityId: 'media',
      expected: { kind: 'committee', committeeId: 'media' },
    },
    { target: 'guideSections', expected: { kind: 'guide' } },
    { target: 'guideQuickInfo', expected: { kind: 'guide' } },
    { target: 'faqCategories', expected: { kind: 'faq' } },
    { target: 'contactCards', expected: { kind: 'contact' } },
    { target: 'contactMap', expected: { kind: 'contact' } },
  ];

  for (const { target, entityId, expected } of targets) {
    const dest = resolveCmsEditDestination(target, undefined, entityId);
    assert.deepEqual(
      dest,
      expected,
      `Destination for target ${target} should match expected view`,
    );
  }
});
