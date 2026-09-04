import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

const getObjectKeysRecursively = (obj, prefix = '') => {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getObjectKeysRecursively(value, fullPath);
    }
    return [fullPath];
  });
};

test('1. AR/TR/EN dictionaries expose required shell keys', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    'navigation.home',
    'navigation.about',
    'navigation.programs',
    'navigation.gallery',
    'navigation.news',
    'navigation.guide',
    'navigation.faq',
    'navigation.contact',
    'navigation.executiveBoard',
    'navigation.executiveBoardOverview',
    'auth.login',
    'auth.logout',
    'auth.checkingSession',
    'dashboard.studentPortal',
    'admin.adminDashboard',
    'roles.unionPresident',
    'roles.vicePresident',
    'roles.member',
    'roles.student',
    'footer.quickLinks',
    'footer.contactUs',
    'footer.newsletter',
    'footer.newsletterSubtitle',
    'footer.emailLabel',
    'footer.subscribeButton',
    'footer.subscribeSuccess',
  ];

  for (const dict of [ar, tr, en]) {
    const keys = new Set(getObjectKeysRecursively(dict));
    for (const key of requiredKeys) {
      assert.ok(keys.has(key), `Dictionary missing required key: ${key}`);
    }
  }

  // Institutional glossary check
  assert.equal(tr.roles.unionPresident, 'Birlik Başkanı');
  assert.equal(en.roles.unionPresident, 'Union President');
  assert.equal(tr.roles.vicePresident, 'Başkan Yardımcısı');
  assert.equal(en.roles.vicePresident, 'Vice President');
  assert.equal(tr.dashboard.studentPortal, 'Öğrenci Portalı');
  assert.equal(en.dashboard.studentPortal, 'Student Portal');
  assert.equal(tr.admin.adminDashboard, 'Yönetim Paneli');
  assert.equal(en.admin.adminDashboard, 'Admin Dashboard');
  assert.equal(tr.navigation.executiveBoard, 'Yönetim Kurulu');
  assert.equal(en.navigation.executiveBoard, 'Executive Board');
});

test('2. Navbar static nav labels use t(...) rather than raw Arabic', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /useTranslation/);
  // Nav items should use translation keys rather than raw Arabic strings
  assert.match(navbar, /t\(['"]navigation\.home['"]\)/);
  assert.match(navbar, /t\(['"]navigation\.about['"]\)/);
  assert.match(navbar, /t\(['"]navigation\.programs['"]\)/);
  assert.match(navbar, /t\(['"]navigation\.contact['"]\)/);
  assert.doesNotMatch(navbar, /label:\s*['"]الرئيسية['"]/);
  assert.doesNotMatch(navbar, /label:\s*['"]عن الاتحاد['"]/);
});

test('3. Navbar role labels use translations', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /t\(['"]roles\.unionPresident['"]\)/);
  assert.match(navbar, /t\(['"]roles\.vicePresident['"]\)/);
  assert.match(navbar, /t\(['"]roles\.member['"]\)/);
  assert.doesNotMatch(navbar, /return\s*['"]رئيس الاتحاد['"]/);
  assert.doesNotMatch(navbar, /return\s*['"]نائب الرئيس['"]/);
  assert.doesNotMatch(navbar, /return\s*['"]عضو['"]/);
});

test('4. Login/logout labels use translations', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /t\(['"]auth\.login['"]\)/);
  assert.match(navbar, /t\(['"]auth\.logout['"]\)/);
  assert.doesNotMatch(navbar, />\s*دخول\s*</);
  assert.doesNotMatch(navbar, />\s*تسجيل الخروج\s*</);
});

test('5. Student Portal/Admin Dashboard labels use translations in Navbar', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /t\(['"]dashboard\.studentPortal['"]\)/);
  assert.match(navbar, /t\(['"]admin\.adminDashboard['"]\)/);
  assert.doesNotMatch(navbar, />\s*بوابة الطالب\s*</);
  assert.doesNotMatch(navbar, />\s*لوحة الإدارة\s*</);
});

test('6. Executive Board static labels use translations in Navbar', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /t\(['"]navigation\.executiveBoard['"]\)/);
  assert.match(navbar, /t\(['"]navigation\.executiveBoardOverview['"]\)/);
  assert.doesNotMatch(navbar, />\s*الهيئة التنفيذية\s*</);
  assert.doesNotMatch(navbar, />\s*نظرة عامة على الهيئة\s*</);
});

test('7. User identity values remain untouched/dynamic in Navbar', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /currentUser\.name/);
  assert.match(navbar, /currentUser\.photo/);
  assert.match(navbar, /currentUser\.avatarPath/);
  assert.match(navbar, /UserAvatar/);
});

test('8. Brand CMS values remain sourced from siteContent, not dictionaries', async () => {
  const navbar = await read('src/components/Navbar.tsx');
  const footer = await read('src/components/Footer.tsx');

  assert.match(navbar, /siteContent\.brand\.name/);
  assert.match(navbar, /siteContent\.brand\.nameTr/);
  assert.match(footer, /sc\.brand\.name/);
  assert.match(footer, /sc\.brand\.nameTr/);
});

test('9. Footer static labels use translations', async () => {
  const footer = await read('src/components/Footer.tsx');

  assert.match(footer, /useTranslation/);
  assert.match(footer, /t\(['"]footer\.quickLinks['"]\)/);
  assert.match(footer, /t\(['"]footer\.contactUs['"]\)/);
  assert.match(footer, /t\(['"]footer\.newsletter['"]\)/);
  assert.match(footer, /t\(['"]footer\.subscribeButton['"]\)/);
  assert.doesNotMatch(footer, />\s*روابط سريعة\s*</);
  assert.doesNotMatch(footer, />\s*تواصل معنا\s*</);
  assert.doesNotMatch(footer, />\s*النشرة البريدية\s*</);
  assert.doesNotMatch(footer, />\s*اشترك\s*</);
});

test('10. Footer dynamic CMS values remain dynamic where applicable', async () => {
  const footer = await read('src/components/Footer.tsx');

  assert.match(footer, /sc\.footer\.address/);
  assert.match(footer, /sc\.footer\.email/);
  assert.match(footer, /sc\.footer\.phone/);
  assert.match(footer, /sc\.footer\.copyright/);
  assert.match(footer, /sc\.footer\.social/);
});

test('11. App global loading/session message uses translation', async () => {
  const app = await read('src/App.tsx');

  assert.match(app, /useTranslation/);
  assert.match(app, /t\(['"]auth\.checkingSession['"]\)/);
  assert.doesNotMatch(app, /جارٍ التحقق من جلسة الحساب\.\.\./);
});

test('12. LanguageSwitcher remains present and functional in Navbar', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  assert.match(navbar, /<LanguageSwitcher\s+variant="desktop"\s*\/>/);
  assert.match(navbar, /<LanguageSwitcher\s+variant="mobile"/);
});

test('13. Existing view navigation behavior is unchanged', async () => {
  const navbar = await read('src/components/Navbar.tsx');
  const app = await read('src/App.tsx');

  assert.match(navbar, /go\(\{\s*kind:\s*['"]home['"]\s*\}\)/);
  assert.match(navbar, /go\(\{\s*kind:\s*['"]board['"]\s*\}\)/);
  assert.match(app, /view\.kind === ['"]home['"]/);
  assert.match(app, /view\.kind === ['"]admin['"]/);
});

test('14. No URL locale prefixes introduced', async () => {
  const app = await read('src/App.tsx');

  assert.doesNotMatch(app, /\/(ar|tr|en)\//);
});

test('15. Dictionary key parity remains valid', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = getObjectKeysRecursively(ar).sort();
  const trKeys = getObjectKeysRecursively(tr).sort();
  const enKeys = getObjectKeysRecursively(en).sort();

  assert.deepEqual(trKeys, arKeys, 'TR dictionary keys must exactly match AR dictionary keys');
  assert.deepEqual(enKeys, arKeys, 'EN dictionary keys must exactly match AR dictionary keys');
});
