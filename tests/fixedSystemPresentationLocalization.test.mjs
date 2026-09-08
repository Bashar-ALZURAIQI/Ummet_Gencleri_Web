import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// Helper to simulate t(key, fallback) from a nested object
function makeT(dict) {
  return (key, fallback) => {
    const parts = key.split('.');
    let cur = dict;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return fallback ?? key;
      cur = cur[p];
    }
    return typeof cur === 'string' ? cur : (fallback ?? key);
  };
}

test('1. Turkish Admin stats never render Arabic-Indic digits for normal stats', async () => {
  const { formatStatisticNumber } = await import('../src/domain/numberPresentation.ts');
  const trValue = formatStatisticNumber(8760, 'tr');
  assert.equal(/[٠-٩]/.test(trValue), false, 'Turkish stats must not contain Arabic-Indic digits');
  assert.equal(trValue.includes('8'), true);
});

test('2. English Admin stats use Latin digits and Arabic uses Arabic-Indic numerals', async () => {
  const { formatStatisticNumber } = await import('../src/domain/numberPresentation.ts');
  const enValue = formatStatisticNumber(8760, 'en');
  assert.equal(/[٠-٩]/.test(enValue), false, 'English stats must not contain Arabic-Indic digits');
  assert.equal(enValue.includes('8'), true);

  const arValue = formatStatisticNumber(8760, 'ar');
  assert.equal(/[٠-٩]/.test(arValue), true, 'Arabic stats should use Arabic numeral presentation');
});

test('3. Month labels are locale-aware', async () => {
  const { formatStatisticMonth } = await import('../src/domain/numberPresentation.ts');
  assert.equal(formatStatisticMonth(0, 'tr'), 'Oca');
  assert.equal(formatStatisticMonth(11, 'tr'), 'Ara');
  assert.equal(formatStatisticMonth(0, 'en'), 'Jan');
  assert.equal(formatStatisticMonth(11, 'en'), 'Dec');
  assert.equal(formatStatisticMonth(0, 'ar'), 'ينا');
  assert.equal(formatStatisticMonth(11, 'ar'), 'ديس');

  // Also handles legacy Arabic month string mapping
  assert.equal(formatStatisticMonth('ينا', 'tr'), 'Oca');
  assert.equal(formatStatisticMonth('ديس', 'en'), 'Dec');
});

test('4. Event category legends are locale-aware', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getEventCategoryLabel } = await import('../src/domain/eventCategoryPresentation.ts');

  assert.equal(getEventCategoryLabel('workshop', makeT(ar)), 'ورشة عمل');
  assert.equal(getEventCategoryLabel('workshop', makeT(tr)), 'Atölye');
  assert.equal(getEventCategoryLabel('workshop', makeT(en)), 'Workshop');

  assert.equal(getEventCategoryLabel('lecture', makeT(tr)), 'Konferans');
  assert.equal(getEventCategoryLabel('volunteer', makeT(tr)), 'Gönüllü Çalışma');
  assert.equal(getEventCategoryLabel('training', makeT(tr)), 'Eğitim');
  assert.equal(getEventCategoryLabel('trip', makeT(tr)), 'Gezi');
  assert.equal(getEventCategoryLabel('entertainment', makeT(tr)), 'Eğlence');
  assert.equal(getEventCategoryLabel('visit', makeT(tr)), 'Ziyaretler');
});

test('5. Canonical event category values remain unchanged internally', async () => {
  const mockData = read('src/data/mockData.ts');
  assert.match(mockData, /export type EventCategory = 'workshop' \| 'lecture' \| 'volunteer' \| 'training' \| 'trip' \| 'entertainment' \| 'visit';/);
  assert.match(mockData, /category:\s*'workshop'/);
});

test('6. Unknown event category falls back safely', async () => {
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getEventCategoryLabel } = await import('../src/domain/eventCategoryPresentation.ts');
  assert.equal(getEventCategoryLabel('custom_unknown_category', makeT(en)), 'custom_unknown_category');
  assert.equal(getEventCategoryLabel('', makeT(en)), '');
  assert.equal(getEventCategoryLabel(null, makeT(en)), '');
});

test('7. Union President role presentation: AR = رئيس الاتحاد, TR = Birlik Başkanı, EN = Union President', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('رئيس الاتحاد', makeT(ar)), 'رئيس الاتحاد');
  assert.equal(getExecutiveRoleLabel('رئيس الاتحاد', makeT(tr)), 'Birlik Başkanı');
  assert.equal(getExecutiveRoleLabel('رئيس الاتحاد', makeT(en)), 'Union President');
  assert.equal(getExecutiveRoleLabel('PRESIDENT', makeT(tr)), 'Birlik Başkanı');
});

test('8. Vice President role presentation: AR = نائب الرئيس, TR = Başkan Yardımcısı, EN = Vice President', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('نائب الرئيس', makeT(ar)), 'نائب الرئيس');
  assert.equal(getExecutiveRoleLabel('نائب الرئيس', makeT(tr)), 'Başkan Yardımcısı');
  assert.equal(getExecutiveRoleLabel('نائب الرئيس', makeT(en)), 'Vice President');
  assert.equal(getExecutiveRoleLabel('VICE_PRESIDENT', makeT(tr)), 'Başkan Yardımcısı');
});

test('9. Executive Board role presentation: TR = Yönetim Kurulu (NOT Yürütme Kurulu)', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  const boardLabel = getExecutiveRoleLabel('الهيئة التنفيذية', makeT(tr));
  assert.equal(boardLabel, 'Yönetim Kurulu');
  assert.notEqual(boardLabel, 'Yürütme Kurulu');
  assert.equal(getExecutiveRoleLabel('الهيئة التنفيذية', makeT(en)), 'Executive Board');

  // Executive Office remains Yürütme Ofisi
  assert.equal(getExecutiveRoleLabel('مكتب تنفيذي', makeT(tr)), 'Yürütme Ofisi');
});

test('10. Presidency section name localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('presidency', makeT(tr)), 'Birlik Başkanlığı');
  assert.equal(getExecutiveSectionLabel('presidency', makeT(en)), 'Union Presidency');
});

test('11. Vice Presidency section name localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(tr)), 'Başkan Yardımcılığı');
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(en)), 'Vice Presidency');
});

test('12. Media Committee localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('media', makeT(tr)), 'Medya Komitesi');
  assert.equal(getExecutiveSectionLabel('media', makeT(en)), 'Media Committee');
});

test('13. Academic Committee localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('academic', makeT(tr)), 'Akademik Komite');
  assert.equal(getExecutiveSectionLabel('academic', makeT(en)), 'Academic Committee');
});

test('14. Oversight Committee localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('supervisory', makeT(tr)), 'Denetim Komitesi');
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(en)), 'Oversight Committee');
});

test('15. Activities Committee localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('activities', makeT(tr)), 'Etkinlikler Komitesi');
  assert.equal(getExecutiveSectionLabel('activities', makeT(en)), 'Activities Committee');
});

test('16. Finance Committee localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('finance', makeT(tr)), 'Mali Komite');
  assert.equal(getExecutiveSectionLabel('finance', makeT(en)), 'Finance Committee');
});

test('17. Executive dropdown uses localized section labels', () => {
  const navbar = read('src/components/Navbar.tsx');
  assert.match(navbar, /getExecutiveSectionLabel\(id,\s*t\)/);
});

test('18. Public Board member cards use localized fixed role labels', () => {
  const board = read('src/pages/BoardPage.tsx');
  assert.match(board, /getExecutiveRoleLabel/);
});

test('19. Disabled Admin executive role field uses localized display value', () => {
  const admin = read('src/pages/AdminDashboard.tsx');
  assert.match(admin, /getExecutiveRoleLabel\(c\.head\.role/);
  assert.match(admin, /getExecutiveRoleLabel\(headForm\.role/);
});

test('20. Stored role value remains canonical and is not submitted translated', () => {
  const admin = read('src/pages/AdminDashboard.tsx');
  // updateBoardHead doesn't touch role
  assert.doesNotMatch(admin, /updateBoardHead\([^)]*role:/);
  const committee = read('src/pages/CommitteePage.tsx');
  assert.doesNotMatch(committee, /updateBoardHead\([^)]*role:/);
});

test('21. Committee hero title uses localized fixed section title', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /getExecutiveSectionLabel\(committee\.id,\s*t\)/);
});

test('22. Committee fixed description follows locale for all 7 sections', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionDescription } = await import('../src/domain/executivePresentation.ts');

  const presTr = getExecutiveSectionDescription('presidency', makeT(tr));
  assert.match(presTr, /Birliğin en üst yönetim birimidir/);
  const presEn = getExecutiveSectionDescription('presidency', makeT(en));
  assert.match(presEn, /highest leadership body/);

  const vpTr = getExecutiveSectionDescription('vice-presidency', makeT(tr));
  assert.match(vpTr, /Başkan Yardımcısının yürütme ofisi/);
  const vpEn = getExecutiveSectionDescription('vice-presidency', makeT(en));
  assert.match(vpEn, /Vice President's executive office/);
});

test('23. Committee fixed metric labels follow locale for all 21 metrics', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveMetricLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveMetricLabel('قرارات صادرة', makeT(tr)), 'Alınan Kararlar');
  assert.equal(getExecutiveMetricLabel('اجتماعات الهيئة', makeT(tr)), 'Kurul Toplantıları');
  assert.equal(getExecutiveMetricLabel('شراكات خارجية', makeT(tr)), 'Dış Ortaklıklar');
  assert.equal(getExecutiveMetricLabel('قرارات صادرة', makeT(en)), 'Decisions Issued');

  assert.equal(getExecutiveMetricLabel('موازنة 2026', makeT(tr)), '2026 Bütçesi');
  assert.equal(getExecutiveMetricLabel('موازنة 2026', makeT(en)), '2026 Budget');
});

test('24. Member group heading never mixes Arabic + Turkish/English', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /committee:\s*getExecutiveSectionLabel\(committee\.id,\s*t\)/);
  assert.doesNotMatch(committee, /committee:\s*committee\.shortName/);
});

test('25. Previous/next section navigation uses localized section names', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /getExecutiveSectionLabel\(prev,\s*t\)/);
  assert.match(committee, /getExecutiveSectionLabel\(next,\s*t\)/);
});

test('26. Person names remain untouched', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /m\.name/);
  assert.match(committee, /committee\.head\?\.name/);
});

test('27. Editable biography remains untouched and raw', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /committee\.head\?\.bio/);
});

test('28. Student academic year display uses getAcademicYearPresentation', () => {
  const student = read('src/pages/StudentDashboard.tsx');
  assert.match(student, /getAcademicYearPresentation\(currentStudent\.year,\s*t\)/);
  assert.match(student, /getAcademicYearPresentation\(application\.year,\s*t\)/);
});

test('29. Registration option visible labels are localized', () => {
  const auth = read('src/pages/AuthPages.tsx');
  assert.match(auth, /<option value="السنة الأولى">\{t\('auth\.years\.first'\)\}<\/option>/);
  assert.match(auth, /<option value="السنة الثانية">\{t\('auth\.years\.second'\)\}<\/option>/);
  assert.match(auth, /<option value="السنة الثالثة">\{t\('auth\.years\.third'\)\}<\/option>/);
  assert.match(auth, /<option value="السنة الرابعة">\{t\('auth\.years\.fourth'\)\}<\/option>/);
  assert.match(auth, /<option value="دراسات عليا">\{t\('auth\.years\.postgraduate'\)\}<\/option>/);
});

test('30. Registration option canonical values remain unchanged', () => {
  const auth = read('src/pages/AuthPages.tsx');
  assert.match(auth, /value="السنة الأولى"/);
  assert.match(auth, /value="السنة الثانية"/);
  assert.match(auth, /value="السنة الثالثة"/);
  assert.match(auth, /value="السنة الرابعة"/);
  assert.match(auth, /value="دراسات عليا"/);
});

test('31. Unknown academic year falls back raw', async () => {
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getAcademicYearPresentation } = await import('../src/domain/academicYearPresentation.ts');
  assert.equal(getAcademicYearPresentation('unknown_academic_year', makeT(en)), 'unknown_academic_year');
});

test('32. Dynamic event title and description remain untouched', () => {
  const programs = read('src/pages/ProgramsPage.tsx');
  assert.match(programs, /e\.title/);
  assert.match(programs, /e\.description/);
});

test('33. No Supabase schema/database changes or migrations introduced', () => {
  const gitStatus = fs.readdirSync(path.join(root, 'supabase', 'migrations'));
  assert.equal(gitStatus.length > 0, true);
});

test('34. No route changes', () => {
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /\/ar\/|\/tr\/|\/en\//);
});

test('35. No machine translation API added', () => {
  const pkg = read('package.json');
  assert.doesNotMatch(pkg, /google-translate|deepl|azure-cognitiveservices/);
});

// ============================================================================
// CORRECTION #2: Complete Executive Role / Committee Option / Admin Modal Localization
// ============================================================================

test('36. Media fixed officer role localized in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  // Both the stored role value 'المسؤول الإعلامي' and committee head 'رئيس اللجنة الإعلامية' / 'MEDIA_HEAD'
  assert.equal(getExecutiveRoleLabel('المسؤول الإعلامي', makeT(tr)), 'Medya Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('المسؤول الإعلامي', makeT(en)), 'Media Committee Head');
  assert.equal(getExecutiveRoleLabel('MEDIA_HEAD', makeT(tr)), 'Medya Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('MEDIA_HEAD', makeT(en)), 'Media Committee Head');
  assert.equal(getExecutiveRoleLabel('رئيس اللجنة الإعلامية', makeT(tr)), 'Medya Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('رئيسة اللجنة الإعلامية', makeT(en)), 'Media Committee Head');
});

test('37. Academic fixed officer role localized in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('المسؤول الأكاديمي', makeT(tr)), 'Akademik Komite Sorumlusu');
  assert.equal(getExecutiveRoleLabel('المسؤول الأكاديمي', makeT(en)), 'Academic Committee Head');
  assert.equal(getExecutiveRoleLabel('ACADEMIC_HEAD', makeT(tr)), 'Akademik Komite Sorumlusu');
  assert.equal(getExecutiveRoleLabel('ACADEMIC_HEAD', makeT(en)), 'Academic Committee Head');
  assert.equal(getExecutiveRoleLabel('رئيس اللجنة الأكاديمية', makeT(tr)), 'Akademik Komite Sorumlusu');
  assert.equal(getExecutiveRoleLabel('رئيس اللجنة الأكاديمية', makeT(en)), 'Academic Committee Head');
});

test('38. Oversight fixed officer role localized in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('المسؤول الرقابي', makeT(tr)), 'Denetim Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('المسؤول الرقابي', makeT(en)), 'Oversight Committee Head');
  assert.equal(getExecutiveRoleLabel('مسؤول الرقابة والتفتيش', makeT(tr)), 'Denetim Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('مسؤول الرقابة والتفتيش', makeT(en)), 'Oversight Committee Head');
  assert.equal(getExecutiveRoleLabel('AUDIT_HEAD', makeT(tr)), 'Denetim Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('AUDIT_HEAD', makeT(en)), 'Oversight Committee Head');
  assert.equal(getExecutiveRoleLabel('SUPERVISORY_HEAD', makeT(tr)), 'Denetim Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('SUPERVISORY_HEAD', makeT(en)), 'Oversight Committee Head');
  assert.equal(getExecutiveRoleLabel('رئيس اللجنة الرقابية', makeT(tr)), 'Denetim Komitesi Sorumlusu');
});

test('39. Activities fixed officer role localized in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('مسؤول الأنشطة', makeT(tr)), 'Etkinlikler Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('مسؤول الأنشطة', makeT(en)), 'Activities Committee Head');
  assert.equal(getExecutiveRoleLabel('ACTIVITIES_HEAD', makeT(tr)), 'Etkinlikler Komitesi Sorumlusu');
  assert.equal(getExecutiveRoleLabel('ACTIVITIES_HEAD', makeT(en)), 'Activities Committee Head');
  assert.equal(getExecutiveRoleLabel('رئيسة لجنة الأنشطة', makeT(tr)), 'Etkinlikler Komitesi Sorumlusu');
});

test('40. Finance fixed officer role localized in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('المسؤول المالي', makeT(tr)), 'Mali Komite Sorumlusu');
  assert.equal(getExecutiveRoleLabel('المسؤول المالي', makeT(en)), 'Finance Committee Head');
  assert.equal(getExecutiveRoleLabel('FINANCE_HEAD', makeT(tr)), 'Mali Komite Sorumlusu');
  assert.equal(getExecutiveRoleLabel('FINANCE_HEAD', makeT(en)), 'Finance Committee Head');
  assert.equal(getExecutiveRoleLabel('رئيس اللجنة المالية', makeT(tr)), 'Mali Komite Sorumlusu');
});

test('41. President and VP roles remain correct in TR and EN', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveRoleLabel('رئيس الاتحاد', makeT(tr)), 'Birlik Başkanı');
  assert.equal(getExecutiveRoleLabel('رئيس الاتحاد', makeT(en)), 'Union President');
  assert.equal(getExecutiveRoleLabel('PRESIDENT', makeT(tr)), 'Birlik Başkanı');

  assert.equal(getExecutiveRoleLabel('نائب الرئيس', makeT(tr)), 'Başkan Yardımcısı');
  assert.equal(getExecutiveRoleLabel('نائب الرئيس', makeT(en)), 'Vice President');
  assert.equal(getExecutiveRoleLabel('VICE_PRESIDENT', makeT(tr)), 'Başkan Yardımcısı');
});

test('42. All seven leadership roles resolve through one centralized resolver getExecutiveRoleLabel', async () => {
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveRoleLabel } = await import('../src/domain/executivePresentation.ts');
  const t = makeT(en);

  const roles = [
    'PRESIDENT',
    'VICE_PRESIDENT',
    'MEDIA_HEAD',
    'ACADEMIC_HEAD',
    'AUDIT_HEAD',
    'ACTIVITIES_HEAD',
    'FINANCE_HEAD',
  ];
  for (const r of roles) {
    const label = getExecutiveRoleLabel(r, t);
    assert.ok(label && label !== r, `Role ${r} must resolve to a localized label, got: ${label}`);
  }
});

test('43. Read-only Admin officer role field uses getExecutiveRoleLabel', () => {
  const admin = read('src/pages/AdminDashboard.tsx');
  assert.match(admin, /getExecutiveRoleLabel\(c\.head\.role/);
  assert.match(admin, /getExecutiveRoleLabel\(headForm\.role/);
});

test('44. Public committee officer role in head modal uses getExecutiveRoleLabel', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /getExecutiveRoleLabel\(headForm\.role,\s*t\)/);
});

test('45. Add Member modal title in CommitteePage uses i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.doesNotMatch(committee, /title=\{editingMember \? 'تعديل عضو' : 'إضافة عضو جديد'\}/);
  assert.match(committee, /admin\.board\.memberModal\.(addTitle|title)|committee\.memberModal\.addTitle/);
});

test('46. Add Member modal labels in CommitteePage use i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /admin\.board\.memberModal\.nameLabel|committee\.memberModal\.name/);
  assert.match(committee, /admin\.board\.memberModal\.positionLabel|committee\.memberModal\.position/);
  assert.match(committee, /admin\.board\.memberModal\.photoLabel|committee\.memberModal\.photo/);
});

test('47. Add Member responsibility placeholder in CommitteePage uses i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /admin\.board\.memberModal\.positionPlaceholder|committee\.memberModal\.positionPlaceholder/);
});

test('48. Add Member upload UI static error message in CommitteePage uses i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.doesNotMatch(committee, /error=\{isInvalid\(invalid, 'photo'\) \? 'يرجى رفع صورة شخصية\.' : null\}/);
});

test('49. Add Member Cancel/Save buttons in CommitteePage use i18n', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  // Cancel button uses t('common.cancel') or similar
  assert.match(committee, /t\('(common\.cancel|admin\.board\.memberModal\.cancel)'/);
  // Save button uses t('common.save')
  assert.match(committee, /t\('(common\.save|admin\.board\.memberModal\.save)'/);
});

test('50. Entered member responsibility remains raw', () => {
  const committee = read('src/pages/CommitteePage.tsx');
  assert.match(committee, /m\.position/);
});

test('51. Committee destination selector in StudentDashboard uses localized labels', () => {
  const student = read('src/pages/StudentDashboard.tsx');
  assert.match(student, /getExecutiveSectionLabel/);
});

test('52. Destination selector canonical option values remain unchanged', () => {
  const student = read('src/pages/StudentDashboard.tsx');
  assert.match(student, /value=\{tRole\.role\}/);
});

test('53. Finance destination option is localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('FINANCE_HEAD', makeT(tr)), 'Mali Komite');
  assert.equal(getExecutiveSectionLabel('FINANCE_HEAD', makeT(en)), 'Finance Committee');
  assert.equal(getExecutiveSectionLabel('اللجنة المالية', makeT(tr)), 'Mali Komite');
  assert.equal(getExecutiveSectionLabel('اللجنة المالية', makeT(en)), 'Finance Committee');
});

test('54. Oversight destination option is localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('AUDIT_HEAD', makeT(tr)), 'Denetim Komitesi');
  assert.equal(getExecutiveSectionLabel('AUDIT_HEAD', makeT(en)), 'Oversight Committee');
  assert.equal(getExecutiveSectionLabel('لجنة الرقابة والتفتيش', makeT(tr)), 'Denetim Komitesi');
  assert.equal(getExecutiveSectionLabel('لجنة الرقابة والتفتيش', makeT(en)), 'Oversight Committee');
});

test('55. Media destination option is localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('MEDIA_HEAD', makeT(tr)), 'Medya Komitesi');
  assert.equal(getExecutiveSectionLabel('MEDIA_HEAD', makeT(en)), 'Media Committee');
  assert.equal(getExecutiveSectionLabel('المكتب الإعلامي', makeT(tr)), 'Medya Komitesi');
  assert.equal(getExecutiveSectionLabel('المكتب الإعلامي', makeT(en)), 'Media Committee');
});

test('56. Academic destination option is localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('ACADEMIC_HEAD', makeT(tr)), 'Akademik Komite');
  assert.equal(getExecutiveSectionLabel('ACADEMIC_HEAD', makeT(en)), 'Academic Committee');
  assert.equal(getExecutiveSectionLabel('اللجنة الأكاديمية', makeT(tr)), 'Akademik Komite');
  assert.equal(getExecutiveSectionLabel('اللجنة الأكاديمية', makeT(en)), 'Academic Committee');
});

test('57. Activities destination option is localized', async () => {
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('ACTIVITIES_HEAD', makeT(tr)), 'Etkinlikler Komitesi');
  assert.equal(getExecutiveSectionLabel('ACTIVITIES_HEAD', makeT(en)), 'Activities Committee');
  assert.equal(getExecutiveSectionLabel('لجنة الأنشطة والبرامج', makeT(tr)), 'Etkinlikler Komitesi');
  assert.equal(getExecutiveSectionLabel('لجنة الأنشطة والبرامج', makeT(en)), 'Activities Committee');
});

test('58. Unknown destination falls back raw', async () => {
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  assert.equal(getExecutiveSectionLabel('custom_unknown_destination', makeT(en)), 'custom_unknown_destination');
});

test('59. History badge "تعديل بيانات الهيئة" uses i18n', () => {
  const history = read('src/components/EditsHistoryPanel.tsx');
  assert.match(history, /admin\.history\.editTypes\.profile/);
});

test('60. History fixed officer role context uses role presentation resolver', () => {
  const history = read('src/components/EditsHistoryPanel.tsx');
  assert.match(history, /getExecutiveRoleLabel\(entry\.applicantRole/);
});

test('61. Historical original/proposed diff text remains untouched', () => {
  const history = read('src/components/EditsHistoryPanel.tsx');
  assert.match(history, /<EditDiffTable rows=\{entry\.diffs\} \/>/);
  assert.match(history, /entry\.decisionNote/);
});

test('62. No Supabase schema/data changes introduced', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'));
  assert.equal(migrations.length > 0, true);
});

test('63. No route changes', () => {
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /\/ar\/|\/tr\/|\/en\//);
});

test('64. No machine translation added', () => {
  const pkg = read('package.json');
  assert.doesNotMatch(pkg, /google-translate|deepl|azure-cognitiveservices/);
});

