import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

// ============================================================================
// 1. DICTIONARY PARITY & INTEGRITY
// ============================================================================

test('1. Recursive dictionary key parity across AR, TR, and EN', async () => {
  const arMod = await import('../src/i18n/locales/ar.ts');
  const trMod = await import('../src/i18n/locales/tr.ts');
  const enMod = await import('../src/i18n/locales/en.ts');

  const ar = arMod.default;
  const tr = trMod.default;
  const en = enMod.default;

  function getLeafKeys(obj, prefix = '') {
    let keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys = keys.concat(getLeafKeys(v, p));
      } else {
        keys.push(p);
      }
    }
    return keys;
  }

  const arKeys = new Set(getLeafKeys(ar));
  const trKeys = new Set(getLeafKeys(tr));
  const enKeys = new Set(getLeafKeys(en));

  const missingInTr = [...arKeys].filter((k) => !trKeys.has(k));
  const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
  const extraInTr = [...trKeys].filter((k) => !arKeys.has(k));
  const extraInEn = [...enKeys].filter((k) => !arKeys.has(k));

  assert.deepEqual(missingInTr, [], `Keys missing in TR dictionary: ${missingInTr.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Keys missing in EN dictionary: ${missingInEn.join(', ')}`);
  assert.deepEqual(extraInTr, [], `Extra keys in TR dictionary: ${extraInTr.join(', ')}`);
  assert.deepEqual(extraInEn, [], `Extra keys in EN dictionary: ${extraInEn.join(', ')}`);
});

test('2. Zero raw Arabic characters in TR and EN dictionaries', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;

  function findArabicValues(obj, lang, pathPrefix = '') {
    const leaks = [];
    for (const [k, v] of Object.entries(obj)) {
      const currentPath = pathPrefix ? `${pathPrefix}.${k}` : k;
      if (typeof v === 'string') {
        if (/[\u0600-\u06FF]/.test(v)) {
          leaks.push({ lang, path: currentPath, value: v });
        }
      } else if (v && typeof v === 'object') {
        leaks.push(...findArabicValues(v, lang, currentPath));
      }
    }
    return leaks;
  }

  const trLeaks = findArabicValues(tr, 'tr');
  const enLeaks = findArabicValues(en, 'en');

  assert.equal(trLeaks.length, 0, `TR dictionary contains Arabic: ${JSON.stringify(trLeaks)}`);
  assert.equal(enLeaks.length, 0, `EN dictionary contains Arabic: ${JSON.stringify(enLeaks)}`);
});

// ============================================================================
// 2. GLOSSARY AUDIT
// ============================================================================

test('3. Glossary: Brand names resolve correctly and no Yürütme Kurulu', async () => {
  const { resolvePublicBrandName, AUTHORITATIVE_BRAND_NAMES } = await import('../src/domain/publicBrand.ts');
  assert.equal(AUTHORITATIVE_BRAND_NAMES.ar, 'اتحاد شباب الأمة');
  assert.equal(AUTHORITATIVE_BRAND_NAMES.tr, 'Ümmet Gençleri Birliği');
  assert.equal(AUTHORITATIVE_BRAND_NAMES.en, 'Ummah Youth Union');

  assert.equal(resolvePublicBrandName('ar'), 'اتحاد شباب الأمة');
  assert.equal(resolvePublicBrandName('tr'), 'Ümmet Gençleri Birliği');
  assert.equal(resolvePublicBrandName('en'), 'Ummah Youth Union');

  const allSrcFiles = readSrcFiles(['src']);
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(content, /Yürütme Kurulu/, `File ${f} contains forbidden glossary term 'Yürütme Kurulu'`);
  }
});

test('4. Glossary: Leadership and membership roles match glossary', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;

  assert.equal(tr.roles.unionPresident, 'Birlik Başkanı');
  assert.equal(en.roles.unionPresident, 'Union President');

  assert.equal(tr.roles.vicePresident, 'Başkan Yardımcısı');
  assert.equal(en.roles.vicePresident, 'Vice President');

  assert.equal(tr.roles.student, 'Öğrenci');
  assert.equal(en.roles.student, 'Student');

  assert.equal(tr.roles.member, 'Üye');
  assert.equal(en.roles.member, 'Member');

  assert.equal(tr.navigation.executiveBoard, 'Yönetim Kurulu');
  assert.equal(en.navigation.executiveBoard, 'Executive Board');
  assert.equal(tr.admin.tabs.board, 'Yönetim Kurulu');
  assert.equal(en.admin.tabs.board, 'Executive Board');
});

// ============================================================================
// 3. DIRECTIONALITY & URL CONTRACT
// ============================================================================

test('5. Directionality: No hardcoded dir="rtl" on common panels or toasts', () => {
  const toast = read('src/components/TransientToast.tsx');
  assert.doesNotMatch(toast, /dir=["']rtl["']/, 'TransientToast must not force hardcoded dir="rtl"');

  const memberPoints = read('src/components/MemberPointsAdminPanel.tsx');
  assert.doesNotMatch(memberPoints, /<section[^>]*dir=["']rtl["']/, 'MemberPointsAdminPanel must not force dir="rtl" on section');
  assert.doesNotMatch(memberPoints, /<form[^>]*dir=["']rtl["']/, 'MemberPointsAdminPanel must not force dir="rtl" on form');

  const taskManagement = read('src/components/TaskManagementDashboard.tsx');
  assert.doesNotMatch(taskManagement, /<section[^>]*dir=["']rtl["']/, 'TaskManagementDashboard must not force dir="rtl" on section');
});

test('6. URL Contract: No /ar, /tr, /en route prefixes or localized slugs', () => {
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /\/ar\/|\/tr\/|\/en\//);
  assert.doesNotMatch(app, /Route\s+path=["']\/(ar|tr|en)/);
});

// ============================================================================
// 4. SUSPICIOUS STATIC UI LEAKS AUDIT
// ============================================================================

test('7. TransientToast close button aria-label uses i18n', () => {
  const toast = read('src/components/TransientToast.tsx');
  assert.doesNotMatch(toast, /aria-label="إغلاق الإشعار"/);
  assert.match(toast, /aria-label=\{t\(['"]common\.closeNotice['"]/);
});

test('8. Modal close button aria-label uses i18n', () => {
  const modal = read('src/components/Modal.tsx');
  assert.doesNotMatch(modal, /aria-label="إغلاق"/);
  assert.match(modal, /aria-label=\{t\(['"]common\.close['"]/);
});

test('9. DismissibleToast title and aria-label use i18n', () => {
  const toast = read('src/components/DismissibleToast.tsx');
  assert.doesNotMatch(toast, /title="إغلاق التنبيه"/);
  assert.doesNotMatch(toast, /aria-label="إغلاق التنبيه"/);
  assert.match(toast, /t\(['"]common\.closeNotice['"]/);
});

test('10. ErrorBoundary static text uses i18n', () => {
  const errorBoundary = read('src/components/ErrorBoundary.tsx');
  assert.doesNotMatch(errorBoundary, />حدث خطأ غير متوقع في هذه الجزئية</);
  assert.doesNotMatch(errorBoundary, />إعادة المحاولة</);
  assert.match(errorBoundary, /t\(['"]common\.unexpectedError['"]/);
  assert.match(errorBoundary, /t\(['"]common\.retry['"]/);
});

test('11. SiteEditBanner aria-label and pending notice use i18n', () => {
  const banner = read('src/components/SiteEditBanner.tsx');
  assert.doesNotMatch(banner, /aria-label="إغلاق رسالة الخطأ"/);
  assert.doesNotMatch(banner, /لديك \{count\} تعديل معلق/);
  assert.match(banner, /t\(['"]admin\.sitePendingBanner\.banner/);
});

test('12. InlineEditOverlay action buttons, titles, and errors use i18n', () => {
  const overlay = read('src/components/InlineEditOverlay.tsx');
  assert.doesNotMatch(overlay, />\s*إلغاء\s*</);
  assert.doesNotMatch(overlay, />\s*حفظ التغييرات\s*</);
  assert.doesNotMatch(overlay, /setSaveError\(['"][^'"]*تعذر حفظ/);
  assert.match(overlay, /t\(['"]common\.cancel['"]/);
  assert.match(overlay, /t\(['"]common\.saveChanges['"]/);
  assert.match(overlay, /t\(['"]admin\.siteEdits\.saveFailed['"]/);
});

test('13. ExecutiveEditDraftEditor input aria-labels use i18n', () => {
  const editor = read('src/components/ExecutiveEditDraftEditor.tsx');
  assert.doesNotMatch(editor, /aria-label=\{`قيمة الإحصائية/);
  assert.doesNotMatch(editor, /aria-label=\{`اسم عضو اللجنة/);
  assert.match(editor, /t\(['"]admin\.profileEdits\.draftEditor\.statValueAria['"]/);
});

test('14. ManagedFileField format helpers, links, and buttons use i18n', () => {
  const fileField = read('src/components/ManagedFileField.tsx');
  assert.doesNotMatch(fileField, /return\s+['"]JPEG أو PNG/);
  assert.doesNotMatch(fileField, />\s*عرض الملف الحالي\s*</);
  assert.doesNotMatch(fileField, />\s*رفع الملف المختار\s*</);
  assert.doesNotMatch(fileField, />\s*إلغاء الاختيار\s*</);
  assert.match(fileField, /t\(['"]managedFiles\.viewCurrentFile['"]/);
  assert.match(fileField, /t\(['"]managedFiles\.uploadSelected['"]/);
  assert.match(fileField, /t\(['"]managedFiles\.helperLogo['"]/);
});

test('15. ProfileSettings headings, labels, and action buttons use i18n', () => {
  const profileSettings = read('src/components/ProfileSettings.tsx');
  assert.doesNotMatch(profileSettings, /> الصورة الشخصية</);
  assert.doesNotMatch(profileSettings, /> البيانات الشخصية</);
  assert.doesNotMatch(profileSettings, /> تغيير كلمة المرور</);
  assert.doesNotMatch(profileSettings, />بريد الدخول/);
  assert.doesNotMatch(profileSettings, />الاسم الكامل/);
  assert.doesNotMatch(profileSettings, />حفظ البيانات الشخصية</);
  assert.match(profileSettings, /t\(['"]profile\.personalHeading['"]/);
  assert.match(profileSettings, /t\(['"]profile\.saveButton['"]/);
});

test('16. ContactPage map edit button, modal chrome, and iframe title use i18n', () => {
  const contact = read('src/pages/ContactPage.tsx');
  assert.doesNotMatch(contact, /> تعديل الخريطة/);
  assert.doesNotMatch(contact, /title="موقع الاتحاد - جامعة أتاتورك أرضروم"/);
  assert.doesNotMatch(contact, /title="تعديل بطاقة التواصل"/);
  assert.doesNotMatch(contact, /title="تعديل خريطة الموقع"/);
  assert.match(contact, /t\(['"]contact\.editMap['"]/);
});

test('17. CommitteePage static head profile title and delete confirms use i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.doesNotMatch(committee, /title="تعديل بيانات المسؤول"/);
  assert.doesNotMatch(committee, /confirm\('حذف هذا البند؟'\)/);
  assert.doesNotMatch(committee, /confirm\('حذف هذا العضو؟'\)/);
  assert.match(committee, /t\(['"]committee\.editHeadTitle['"]/);
});

test('18. AdminDashboard Committee Vision & Goals card chrome uses i18n', () => {
  const admin = read('src/pages/AdminDashboard.tsx');
  assert.doesNotMatch(admin, /> رؤية وأهداف اللجنة</);
  assert.doesNotMatch(admin, /> حفظ الرؤية والأهداف</);
  assert.match(admin, /t\(['"]admin\.vision\.title['"]/);
});

test('19. AdminDashboard Plan committee prefix uses localized section presentation', () => {
  const admin = read('src/pages/AdminDashboard.tsx');
  assert.match(admin, /getExecutiveSectionLabel\(p\.committee,\s*t\)/);
});

// Helper to recursively collect files
function readSrcFiles(dirs) {
  const res = [];
  for (const d of dirs) {
    const full = path.join(root, d);
    if (!fs.existsSync(full)) continue;
    const entries = fs.readdirSync(full, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (ent.name !== 'node_modules' && ent.name !== '.git') {
          res.push(...readSrcFiles([path.join(d, ent.name)]));
        }
      } else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) {
        res.push(path.join(full, ent.name));
      }
    }
  }
  return res;
}
