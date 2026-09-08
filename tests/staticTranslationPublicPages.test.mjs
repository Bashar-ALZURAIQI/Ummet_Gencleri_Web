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

test('1. Public static dictionary keys exist in AR/TR/EN with proper glossary', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    'common.all',
    'common.viewAll',
    'common.readMore',
    'common.viewDetails',
    'common.close',
    'common.edit',
    'common.delete',
    'home.upcomingProgramsTitle',
    'home.latestNewsTitle',
    'programs.upcomingTab',
    'programs.pastTab',
    'programs.noEvents',
    'recognition.title',
    'news.title',
    'gallery.title',
    'guide.title',
    'faq.title',
    'contact.title',
    'contact.fullName',
    'contact.sendButton',
    'board.specializedCommittees',
    'committee.visionAndGoals',
    'committee.responsibilities',
  ];

  for (const dict of [ar, tr, en]) {
    const keys = new Set(getObjectKeysRecursively(dict));
    for (const key of requiredKeys) {
      assert.ok(keys.has(key), `Dictionary missing key: ${key}`);
    }
  }

  // Institutional glossary
  assert.equal(tr.roles.unionPresident, 'Birlik Başkanı');
  assert.equal(en.roles.unionPresident, 'Union President');
  assert.equal(tr.roles.vicePresident, 'Başkan Yardımcısı');
  assert.equal(en.roles.vicePresident, 'Vice President');
  assert.equal(tr.roles.student, 'Öğrenci');
  assert.equal(en.roles.student, 'Student');
  assert.equal(tr.roles.member, 'Üye');
  assert.equal(en.roles.member, 'Member');
});

test('2. Recursive key parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = getObjectKeysRecursively(ar).sort();
  const trKeys = getObjectKeysRecursively(tr).sort();
  const enKeys = getObjectKeysRecursively(en).sort();

  assert.deepEqual(trKeys, arKeys, 'TR dictionary keys must match AR exactly');
  assert.deepEqual(enKeys, arKeys, 'EN dictionary keys must match AR exactly');
});

test('3. HomePage static UI uses translations', async () => {
  const home = await read('src/pages/HomePage.tsx');

  assert.match(home, /useTranslation/);
  assert.match(home, /t\(['"]common\.viewAll['"]\)/);
  assert.match(home, /t\(['"]common\.readMore['"]\)/);
  assert.match(home, /t\(['"]common\.close['"]\)/);
  assert.match(home, /t\(['"]home\.upcomingProgramsTitle['"]\)/);
  assert.match(home, /t\(['"]home\.latestNewsTitle['"]\)/);
  assert.match(home, /t\(['"]home\.viewFullBoard['"]\)/);
  assert.doesNotMatch(home, />\s*أحدث البرامج القادمة\s*</);
  assert.doesNotMatch(home, />\s*آخر أخبار الاتحاد\s*</);
  assert.doesNotMatch(home, />\s*عرض الهيكل التنفيذي بالكامل\s*</);
});

test('4. AboutPage keeps CMS content dynamic', async () => {
  const about = await read('src/pages/AboutPage.tsx');

  // Vision, story, mission, goals are dynamic CMS fields
  assert.match(about, /a\.story\.title/);
  assert.match(about, /a\.mission\.title/);
  assert.match(about, /a\.goals\.title/);
  assert.match(about, /a\.header\.title/);
  assert.match(about, /EditableField/);
});

test('5. ProgramsPage static controls use translations', async () => {
  const programs = await read('src/pages/ProgramsPage.tsx');

  assert.match(programs, /useTranslation/);
  assert.match(programs, /t\(['"]programs\.upcomingTab['"]\)/);
  assert.match(programs, /t\(['"]programs\.pastTab['"]\)/);
  assert.match(programs, /t\(['"]programs\.addNewEvent['"]\)/);
  assert.match(programs, /t\(['"]programs\.noEvents['"]\)/);
  assert.doesNotMatch(programs, />\s*البرامج القادمة\s*</);
  assert.doesNotMatch(programs, />\s*البرامج السابقة\s*</);
});

test('6. MediaGallery static controls use translations', async () => {
  const gallery = await read('src/pages/MediaGallery.tsx');

  assert.match(gallery, /useTranslation/);
  assert.match(gallery, /t\(['"]gallery\.badge['"]\)/);
  assert.match(gallery, /t\(['"]gallery\.title['"]\)/);
  assert.match(gallery, /t\(['"]gallery\.filter['"]\)/);
  assert.match(gallery, /t\(['"]gallery\.addNewAlbum['"]\)/);
  assert.doesNotMatch(gallery, />\s*معرض الصور والذاكرة\s*</);
  assert.doesNotMatch(gallery, />\s*لحظات من تاريخ الاتحاد\s*</);
});

test('7. NewsPage static controls use translations', async () => {
  const news = await read('src/pages/NewsPage.tsx');

  assert.match(news, /useTranslation/);
  assert.match(news, /t\(['"]news\.badge['"]\)/);
  assert.match(news, /t\(['"]news\.title['"]\)/);
  assert.match(news, /t\(['"]common\.readMore['"]\)/);
  assert.match(news, /t\(['"]common\.close['"]\)/);
  assert.doesNotMatch(news, />\s*المركز الإخباري\s*</);
  assert.doesNotMatch(news, />\s*آخر أخبار الاتحاد\s*</);
});

test('8. StudentGuide static controls use translations', async () => {
  const guide = await read('src/pages/StudentGuide.tsx');

  assert.match(guide, /useTranslation/);
  assert.match(guide, /t\(['"]guide\.badge['"]\)/);
  assert.match(guide, /t\(['"]guide\.title['"]\)/);
  assert.match(guide, /t\(['"]guide\.quickInfo['"]\)/);
  assert.match(guide, /t\(['"]guide\.importantContacts['"]\)/);
  assert.doesNotMatch(guide, />\s*دليلك الشامل للحياة في أرضروم\s*</);
  assert.doesNotMatch(guide, />\s*جهات الاتصال المهمة\s*</);
});

test('9. FAQ static controls use translations', async () => {
  const faq = await read('src/pages/FAQPage.tsx');

  assert.match(faq, /useTranslation/);
  assert.match(faq, /t\(['"]faq\.badge['"]\)/);
  assert.match(faq, /t\(['"]faq\.title['"]\)/);
  assert.doesNotMatch(faq, />\s*إجابات لأكثر أسئلتكم تكرارًا\s*</);
});

test('10. Contact form static labels/messages use translations', async () => {
  const contact = await read('src/pages/ContactPage.tsx');

  assert.match(contact, /useTranslation/);
  assert.match(contact, /t\(['"]contact\.title['"]\)/);
  assert.match(contact, /t\(['"]contact\.fullName['"]\)/);
  assert.match(contact, /t\(['"]contact\.sendButton['"]\)/);
  assert.match(contact, /t\(['"]contact\.sendMessage['"]\)/);
  assert.match(contact, /t\(['"]contact\.openInGoogleMaps['"]\)/);
  assert.doesNotMatch(contact, />\s*أرسل لنا رسالة\s*</);
  assert.doesNotMatch(contact, />\s*فتح في خرائط Google\s*</);
});

test('11. BoardPage static presentation labels use translations', async () => {
  const board = await read('src/pages/BoardPage.tsx');

  assert.match(board, /useTranslation/);
  assert.match(board, /t\(['"]board\.badge['"]\)/);
  assert.match(board, /t\(['"]board\.specializedCommittees['"]\)/);
  assert.match(board, /t\(['"]common\.viewDetails['"]\)/);
  assert.doesNotMatch(board, />\s*الهيكل التنظيمي\s*</);
  assert.doesNotMatch(board, />\s*اللجان المتخصصة\s*</);
  assert.doesNotMatch(board, />\s*عرض التفاصيل\s*</);
});

test('12. CommitteePage static presentation/navigation labels use translations', async () => {
  const committee = await read('src/pages/CommitteePage.tsx');

  assert.match(committee, /useTranslation/);
  assert.match(committee, /t\(['"]committee\.visionAndGoals['"]\)/);
  assert.match(committee, /t\(['"]committee\.responsibilities['"]\)/);
  assert.match(committee, /t\(['"]navigation\.executiveBoard['"]\)/);
  assert.doesNotMatch(committee, />\s*رؤية وأهداف اللجنة\s*</);
  assert.doesNotMatch(committee, />\s*المهام والمسؤوليات\s*</);
});

test('13 to 20. Dynamic CMS and User Data remain untouched and dynamic', async () => {
  const [home, programs, news, gallery, contact, board, committee] = await Promise.all([
    read('src/pages/HomePage.tsx'),
    read('src/pages/ProgramsPage.tsx'),
    read('src/pages/NewsPage.tsx'),
    read('src/pages/MediaGallery.tsx'),
    read('src/pages/ContactPage.tsx'),
    read('src/pages/BoardPage.tsx'),
    read('src/pages/CommitteePage.tsx'),
  ]);

  // Dynamic CMS fields
  assert.match(home, /sc\.hero\.title/);
  assert.match(programs, /programsContent\.title/);
  assert.match(news, /n\.title/);
  assert.match(gallery, /album\.title/);
  assert.match(board, /c\.head\?\.name/);
  assert.match(committee, /committee\.responsibilities/);

  // User generated data in contact form
  assert.match(contact, /form\.name/);
  assert.match(contact, /form\.email/);
  assert.match(contact, /form\.subject/);
  assert.match(contact, /form\.body/);
});

test('21 & 22. No URL prefixes or machine translation API calls added', async () => {
  const app = await read('src/App.tsx');
  const ar = await read('src/i18n/locales/ar.ts');

  assert.doesNotMatch(app, /\/(ar|tr|en)\//);
  assert.doesNotMatch(ar, /https:\/\/api\.cognitive/);
});

test('23. Existing LanguageSwitcher remains present in Navbar', async () => {
  const navbar = await read('src/components/Navbar.tsx');
  assert.match(navbar, /<LanguageSwitcher\s+variant="desktop"\s*\/>/);
  assert.match(navbar, /<LanguageSwitcher\s+variant="mobile"/);
});

test('24. Brand presentation resolves correctly across AR, TR, and EN', async () => {
  const { AUTHORITATIVE_BRAND_NAMES, resolvePublicBrandName } = await import('../src/domain/publicBrand.ts');
  const cmsMock = { name: 'اتحاد شباب الأمة', nameTr: 'Ümmet Gençleri Birliği' };

  // 1. AR brand presentation
  assert.equal(AUTHORITATIVE_BRAND_NAMES.ar, 'اتحاد شباب الأمة');
  assert.equal(resolvePublicBrandName('ar', cmsMock), 'اتحاد شباب الأمة');

  // 2. TR brand presentation
  assert.equal(AUTHORITATIVE_BRAND_NAMES.tr, 'Ümmet Gençleri Birliği');
  assert.equal(resolvePublicBrandName('tr', cmsMock), 'Ümmet Gençleri Birliği');

  // 3. EN brand presentation
  assert.equal(AUTHORITATIVE_BRAND_NAMES.en, 'Ummah Youth Union');
  assert.equal(resolvePublicBrandName('en', cmsMock), 'Ummah Youth Union');
});

test('25. Home CTA resolves exactly according to active language without mixing languages', async () => {
  const { default: i18n } = await import('../src/i18n/config.ts');
  const { resolvePublicBrandName } = await import('../src/domain/publicBrand.ts');
  const cmsMock = { name: 'اتحاد شباب الأمة', nameTr: 'Ümmet Gençleri Birliği' };

  // AR CTA
  await i18n.changeLanguage('ar');
  const arBrand = resolvePublicBrandName('ar', cmsMock);
  const arCta = i18n.t('home.joinFamily', { brand: arBrand });
  assert.equal(arCta, 'انضم إلى عائلة اتحاد شباب الأمة');

  // 4. TR CTA
  await i18n.changeLanguage('tr');
  const trBrand = resolvePublicBrandName('tr', cmsMock);
  const trCta = i18n.t('home.joinFamily', { brand: trBrand });
  assert.equal(trCta, 'Ümmet Gençleri Birliği Ailesine Katılın');
  assert.doesNotMatch(trCta, /اتحاد شباب الأمة/);
  assert.doesNotMatch(trCta, /Ailemize Katılın/);
  assert.doesNotMatch(trCta, /Join Our Community/);

  // 5. EN CTA
  await i18n.changeLanguage('en');
  const enBrand = resolvePublicBrandName('en', cmsMock);
  const enCta = i18n.t('home.joinFamily', { brand: enBrand });
  assert.equal(enCta, 'Join the Ummah Youth Union Family');
  assert.doesNotMatch(enCta, /اتحاد شباب الأمة/);
  assert.doesNotMatch(enCta, /Join Our Community/);

  // Reset back to AR
  await i18n.changeLanguage('ar');
});

test('26. Turkish and English UI dictionaries do not contain raw Arabic brand in translated sentences', async () => {
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const checkNoRawArabicBrand = (obj, path = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${k}` : k;
      if (typeof v === 'string') {
        assert.doesNotMatch(v, /اتحاد شباب الأمة/, `Path ${currentPath} contains raw Arabic brand in non-Arabic dictionary`);
      } else if (v && typeof v === 'object') {
        checkNoRawArabicBrand(v, currentPath);
      }
    }
  };

  // 6. TR does not contain Arabic brand
  checkNoRawArabicBrand(tr, 'tr');
  // 7. EN does not contain Arabic brand
  checkNoRawArabicBrand(en, 'en');
});

test('27. Navbar, Footer, and HomePage use resolvePublicBrandName and preserve CMS brand fields', async () => {
  const home = await read('src/pages/HomePage.tsx');
  const navbar = await read('src/components/Navbar.tsx');
  const footer = await read('src/components/Footer.tsx');

  // Uses resolvePublicBrandName
  assert.match(home, /resolvePublicBrandName/);
  assert.match(navbar, /resolvePublicBrandName/);
  assert.match(footer, /resolvePublicBrandName/);

  // 8. Existing CMS brand.name and brand.nameTr remain untouched
  assert.match(home, /sc\.brand/);
  assert.match(navbar, /siteContent\.brand\.name/);
  assert.match(navbar, /siteContent\.brand\.nameTr/);
  assert.match(footer, /sc\.brand\.name/);
  assert.match(footer, /sc\.brand\.nameTr/);
});

test('28. No Supabase write occurs during brand presentation', async () => {
  const locale = await read('src/domain/locale.ts');
  // 9. No supabase writes in brand resolution
  assert.doesNotMatch(locale, /supabase/i);
  assert.doesNotMatch(locale, /\.from\(['"]/);
});

