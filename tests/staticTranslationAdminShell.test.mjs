import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const collectLeafKeys = (obj, prefix = '') => {
  const keys = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...collectLeafKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
};

test('1. Admin shell keys exist in AR/TR/EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    'admin.sidebarTitle',
    'admin.badge',
    'admin.title',
    'admin.subtitle',
    'admin.defaultAdminName',
    'admin.boardMemberDefault',
    'admin.permissionsLabel',
    'admin.committeePermissionNotice',
    'admin.fullPermissionNotice',
    'admin.tabs.stats',
    'admin.tabs.board',
    'admin.tabs.pendingEdits',
    'admin.tabs.sitePending',
    'admin.tabs.branding',
    'admin.tabs.history',
    'admin.tabs.events',
    'admin.tabs.gallery',
    'admin.tabs.news',
    'admin.tabs.members',
    'admin.tabs.applications',
    'admin.tabs.inbox',
    'admin.tabs.plans',
    'admin.tabs.suggestions',
    'admin.tabs.guideSuggestions',
    'admin.tabs.excuses',
    'admin.tabs.oversight',
    'admin.tabs.taskManagement',
    'admin.tabs.memberPoints',
    'admin.tabs.profile',
    'admin.stats.totalStudents',
    'admin.stats.activeStudents',
    'admin.stats.upcomingEvents',
    'admin.stats.pendingApplications',
    'admin.stats.growthTitle',
    'admin.stats.liveBadge',
    'admin.stats.eventDistribution',
    'admin.stats.noEventsYet',
    'admin.stats.participationByCategory',
    'admin.stats.recentSuggestionsAndMessages',
    'admin.stats.noSuggestionsOrMessages',
    'admin.stats.noSuggestions',
    'admin.stats.noNewMessages',
    'admin.stats.noTitle',
    'admin.stats.noSubject',
    'admin.stats.replyToast',
    'admin.committees.presidency',
    'admin.committees.vicePresidency',
    'admin.committees.media',
    'admin.committees.academic',
    'admin.committees.supervisory',
    'admin.committees.activities',
    'admin.committees.finance',
    'status.replied',
  ];

  for (const k of requiredKeys) {
    const getVal = (dict, keyPath) => keyPath.split('.').reduce((acc, part) => acc?.[part], dict);
    assert.ok(getVal(ar, k), `Missing AR key: ${k}`);
    assert.ok(getVal(tr, k), `Missing TR key: ${k}`);
    assert.ok(getVal(en, k), `Missing EN key: ${k}`);
  }

  // Exact glossary requirements
  assert.equal(tr.admin.tabs.board, 'Yönetim Kurulu');
  assert.equal(en.admin.tabs.board, 'Executive Board');
  assert.notEqual(tr.admin.tabs.board, 'Yürütme Kurulu');
});

test('2. Dictionary parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = collectLeafKeys(ar);
  const trKeys = collectLeafKeys(tr);
  const enKeys = collectLeafKeys(en);

  assert.deepEqual(trKeys, arKeys, 'TR keys must match AR keys exactly');
  assert.deepEqual(enKeys, arKeys, 'EN keys must match AR keys exactly');
});

test('3. Admin page title uses translation', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /t\(['"]admin\.title['"]/);
  assert.match(code, /t\(['"]admin\.subtitle['"]/);
  assert.match(code, /t\(['"]admin\.badge['"]/);
});

test('4. Admin sidebar group / title labels use translation', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /title=\{t\(['"]admin\.sidebarTitle['"]/);
});

test('5. Admin navigation items use translation', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /adminTabLabels|t\(['"]admin\.tabs\./);
  assert.match(code, /t\(['"]admin\.tabs\.stats['"]/);
  assert.match(code, /t\(['"]admin\.tabs\.board['"]/);
  assert.match(code, /t\(['"]admin\.tabs\.applications['"]/);
});

test('6. Overview card titles use translation', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]admin\.stats\.totalStudents['"]/);
  assert.match(code, /t\(['"]admin\.stats\.activeStudents['"]/);
  assert.match(code, /t\(['"]admin\.stats\.upcomingEvents['"]/);
  assert.match(code, /t\(['"]admin\.stats\.pendingApplications['"]/);
  assert.match(code, /t\(['"]admin\.stats\.growthTitle['"]/);
  assert.match(code, /t\(['"]admin\.stats\.eventDistribution['"]/);
  assert.match(code, /t\(['"]admin\.stats\.participationByCategory['"]/);
  assert.match(code, /t\(['"]admin\.stats\.recentSuggestionsAndMessages['"]/);
});

test('7. Generic status presentation labels use translation', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]status\.replied['"]/);
});

test('8. Dynamic counts remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /students\.length/);
  assert.match(code, /activeStudents/);
  assert.match(code, /upcoming/);
  assert.match(code, /pendingApps/);
});

test('9. Student/executive names remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /currentUser\?\.name/);
  assert.match(code, /s\?\.studentName/);
  assert.match(code, /m\?\.senderName/);
});

test('10. Emails remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /currentUser\?\.email/);
  assert.match(code, /senderEmail/);
});

test('11. Role keys remain unchanged internally', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /currentUser\?\.role === 'PRESIDENT'/);
  assert.match(code, /isLeadershipRole\(currentUser\.role\)/);
});

test('12. Executive revocation behavior remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /revokeExecutiveAssignment/);
  assert.match(code, /buildRevocationConfirmation/);
});

test('13. Admin authorization behavior remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /canEditSection/);
  assert.match(code, /canAccessContactInbox/);
  assert.match(code, /canManageGuideSuggestions/);
  assert.match(code, /canManageExcuses/);
  assert.match(code, /canManageOversight/);
  assert.match(code, /canManageTasks/);
  assert.match(code, /canManageMemberPoints/);
});

test('14. Existing admin section IDs remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  const expectedIds = [
    'stats', 'board', 'pending-edits', 'site-pending', 'branding', 'history',
    'events', 'gallery', 'news', 'members', 'applications', 'inbox', 'plans',
    'suggestions', 'guide-suggestions', 'excuses', 'oversight', 'task-management',
    'member-points', 'profile',
  ];

  for (const id of expectedIds) {
    assert.match(code, new RegExp(`id:\\s*'${id}'`));
  }
});

test('15. Sidebar selection logic remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /<SidebarLayout[\s\S]*?activeId=\{tab\}[\s\S]*?onSelect=\{setTab\}/);
});

test('16. RTL/LTR behavior remains intact', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');

  assert.match(layout, /dir=\{direction\}/);
  assert.match(layout, /customDirection \?\? \(i18n\.dir\(\) as 'rtl' \| 'ltr'\)/);
});

test('17. No URL locale prefixes added in AdminDashboard', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /['"]\/(ar|tr|en)\//);
});

test('18. No machine translation API added', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /google\.translate|translate\.googleapis|deepl/i);
});

test('19. No Supabase schema/database operation added in AdminDashboard', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /supabase\.from/);
  assert.doesNotMatch(code, /supabase\.rpc/);
});

test('20. Deep admin panels remain untouched for 5C3B', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /<ProfileEditsPanel/);
  assert.match(code, /<SiteEditsPanel/);
  assert.match(code, /<SiteBrandingPanel/);
  assert.match(code, /<EditsHistoryPanel/);
  assert.match(code, /<ExcuseReviewPanel/);
  assert.match(code, /<OversightEvaluationPanel/);
  assert.match(code, /<TaskManagementDashboard/);
  assert.match(code, /<MemberPointsAdminPanel/);
});
