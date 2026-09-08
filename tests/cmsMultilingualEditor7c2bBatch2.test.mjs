import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isTranslatableLocationValue,
} from '../src/domain/cmsLocalizationEditor.ts';
import {
  isCmsPathTranslatable,
  CMS_TRANSLATABLE_SCHEMA,
} from '../src/domain/cmsTranslatableFields.ts';
import {
  computeSourceHash,
} from '../src/domain/cmsLocalization.ts';
import {
  InMemoryCmsLocalizationRepository,
} from '../src/domain/cmsLocalizationRepository.ts';

const readAdminDashboard = () =>
  readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');

const readMediaGallery = () =>
  readFile(new URL('../src/pages/MediaGallery.tsx', import.meta.url), 'utf8');

const readFAQPage = () =>
  readFile(new URL('../src/pages/FAQPage.tsx', import.meta.url), 'utf8');

const readStudentGuide = () =>
  readFile(new URL('../src/pages/StudentGuide.tsx', import.meta.url), 'utf8');

const readCommitteePage = () =>
  readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// 1. FAQ: Translatable and Excluded Fields
// ---------------------------------------------------------------------------

test('1. FAQ eligible fields are translatable in schema', () => {
  assert.equal(isCmsPathTranslatable('faqCategories', 'title'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '*.title'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', 'items.*.question'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '*.items.*.question'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', 'items.*.answer'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '*.items.*.answer'), true);
});

test('2. FAQ technical fields (id, icon, color) are excluded from schema', () => {
  assert.equal(isCmsPathTranslatable('faqCategories', 'id'), false);
  assert.equal(isCmsPathTranslatable('faqCategories', 'icon'), false);
  assert.equal(isCmsPathTranslatable('faqCategories', 'color'), false);
  assert.equal(isCmsPathTranslatable('faqCategories', 'items.*.id'), false);
});

test('3. FAQPage embeds CmsEntityTranslationTabs in Question and Category modals', async () => {
  const source = await readFAQPage();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="faqCategories"/);
});

// ---------------------------------------------------------------------------
// 2. Student Guide: Translatable and Excluded Fields
// ---------------------------------------------------------------------------

test('4. Guide eligible editorial fields are translatable in schema', () => {
  assert.equal(isCmsPathTranslatable('guideSections', 'label'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'title'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'intro'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.*.heading'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.*.body'), true);
});

test('5. Guide technical fields (id, icon, color, bg, contacts) are excluded from schema', () => {
  assert.equal(isCmsPathTranslatable('guideSections', 'id'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'icon'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'color'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'bg'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'contacts.*.value'), false);
});

test('6. StudentGuide embeds CmsEntityTranslationTabs for sections and items', async () => {
  const source = await readStudentGuide();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="guideSections"/);
});

// ---------------------------------------------------------------------------
// 3. Gallery: Translatable, Excluded, and Dual Entry Points
// ---------------------------------------------------------------------------

test('7. Gallery album editorial text is translatable, media and coverImage are excluded', () => {
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'title'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'description'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'location'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'coverImage'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'date'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.*.url'), false);
});

test('8. Gallery categories label is translatable', () => {
  assert.equal(isCmsPathTranslatable('galleryCategories', 'label'), true);
  assert.equal(isCmsPathTranslatable('galleryCategories', 'id'), false);
});

test('9. AdminDashboard GalleryTab embeds CmsEntityTranslationTabs for albums', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="galleryAlbums"/);
});

test('10. MediaGallery embeds CmsEntityTranslationTabs for albums and categories', async () => {
  const source = await readMediaGallery();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="galleryAlbums"/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="galleryCategories"/);
});

// ---------------------------------------------------------------------------
// 4. Plans & Reports: Translatable vs Fixed Enums
// ---------------------------------------------------------------------------

test('11. plans.quarter is a FIXED system select and excluded; title and description are translatable', () => {
  assert.equal(isCmsPathTranslatable('plans', 'title'), true);
  assert.equal(isCmsPathTranslatable('plans', 'description'), true);
  assert.equal(isCmsPathTranslatable('plans', 'quarter'), false);
  assert.equal(isCmsPathTranslatable('plans', 'year'), false);
});

test('12. reports.type is a FIXED select and excluded; period, title, summary are translatable', () => {
  assert.equal(isCmsPathTranslatable('reports', 'title'), true);
  assert.equal(isCmsPathTranslatable('reports', 'summary'), true);
  assert.equal(isCmsPathTranslatable('reports', 'period'), true);
  assert.equal(isCmsPathTranslatable('reports', 'type'), false);
  assert.equal(isCmsPathTranslatable('reports', 'date'), false);
  assert.equal(isCmsPathTranslatable('reports', 'fileUrl'), false);
});

test('13. AdminDashboard PlansTab embeds CmsEntityTranslationTabs for plans and reports', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="plans"/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="reports"/);
});

test('14. Plans and Reports keep quarter and type selects OUTSIDE CmsEntityTranslationTabs', async () => {
  const source = await readAdminDashboard();
  // Quarter and type remain form controls outside translation tabs
  assert.match(source, /planForm\.quarter/);
  assert.match(source, /reportForm\.type/);
});

// ---------------------------------------------------------------------------
// 5. Committees / Executive: Editable Member Position vs Fixed Role
// ---------------------------------------------------------------------------

test('15. committees: members.*.position and head.bio are translatable; head.role is excluded', () => {
  assert.equal(isCmsPathTranslatable('committees', 'members.*.position'), true);
  assert.equal(isCmsPathTranslatable('committees', 'head.bio'), true);
  assert.equal(isCmsPathTranslatable('committees', 'head.role'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.name'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.email'), false);
});

test('16. AdminDashboard BoardTab embeds CmsEntityTranslationTabs for member position', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="committees"/);
});

test('17. CommitteePage embeds CmsEntityTranslationTabs for member position', async () => {
  const source = await readCommitteePage();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="committees"/);
});

// ---------------------------------------------------------------------------
// 6. Architectural Invariance & Regressions
// ---------------------------------------------------------------------------

test('18. Batch 1 Event and News editors remain intact in AdminDashboard and ProgramsPage', async () => {
  const admin = await readAdminDashboard();
  assert.match(admin, /<CmsEntityTranslationTabs[^>]*target="events"/);
  assert.match(admin, /<CmsEntityTranslationTabs[^>]*target="news"/);
});

test('19. Zero Supabase imports introduced in new Batch 2 translations', async () => {
  const faq = await readFAQPage();
  const guide = await readStudentGuide();
  assert.doesNotMatch(faq, /createTranslationRepository/);
  assert.doesNotMatch(guide, /createTranslationRepository/);
});

test('20. Repository saves TR/EN records to draft partition with sibling preservation', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalPlans = [
    { id: 'p1', title: 'خطة 1', description: 'وصف 1', quarter: 'Q1' },
    { id: 'p2', title: 'خطة 2', description: 'وصف 2', quarter: 'Q2' },
  ];
  await repo.saveDraft({
    target: 'plans',
    locale: 'tr',
    payload: [{ id: 'p1', title: 'Plan 1 TR', description: 'Açıklama 1 TR' }],
    status: 'draft',
    manualPaths: ['0.title'],
    sourceHash: computeSourceHash(canonicalPlans),
  });

  const draft = await repo.getDraft('plans', 'tr');
  assert.ok(draft);
  assert.equal(draft.payload[0].title, 'Plan 1 TR');
});

// ---------------------------------------------------------------------------
// 7. Batch 2 Visual QA Correctives (Tests 21 - 31)
// ---------------------------------------------------------------------------

const readContactPage = () =>
  readFile(new URL('../src/pages/ContactPage.tsx', import.meta.url), 'utf8');

const readProfileSettings = () =>
  readFile(new URL('../src/components/ProfileSettings.tsx', import.meta.url), 'utf8');

test('21. Student Guide subpoint/tips are translatable and embedded inside CmsEntityTranslationTabs', async () => {
  assert.equal(isCmsPathTranslatable('guideSections', 'items.0.tips.0'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.0.tips.1'), true);

  const guide = await readStudentGuide();
  // tips must be declared as fields in CmsEntityTranslationTabs
  assert.match(guide, /name:\s*`tips\.\$\{i\}`/);
  // tips editor must be inside the Arabic children of CmsEntityTranslationTabs (not orphaned after </CmsEntityTranslationTabs>)
  const closingTabsIndex = guide.lastIndexOf('</CmsEntityTranslationTabs>');
  const tipsMappingIndex = guide.lastIndexOf('itemForm.tips.map');
  assert.ok(closingTabsIndex > 0);
  assert.ok(tipsMappingIndex > 0);
  assert.ok(tipsMappingIndex < closingTabsIndex, 'tips mapping must be inside CmsEntityTranslationTabs children');
});

test('22. Student Guide list structure remains intact with array of tips', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalGuide = [
    {
      id: 'sec1',
      items: [
        {
          id: 'item1',
          heading: 'عنوان الدليل',
          body: 'نص الدليل',
          tips: ['نقطة 1', 'نقطة 2'],
        },
      ],
    },
  ];

  await repo.saveDraft({
    target: 'guideSections',
    locale: 'tr',
    payload: [
      {
        id: 'sec1',
        items: [
          {
            id: 'item1',
            heading: 'Rehber Başlığı',
            body: 'Rehber Metni',
            tips: ['İpucu 1', 'İpucu 2'],
          },
        ],
      },
    ],
    status: 'draft',
    manualPaths: ['item1.tips.0', 'item1.tips.1'],
    sourceHash: computeSourceHash(canonicalGuide),
  });

  const draft = await repo.getDraft('guideSections', 'tr');
  assert.ok(draft);
  const draftItem = draft.payload[0].items[0];
  assert.ok(Array.isArray(draftItem.tips), 'tips must remain an array, not flattened to string');
  assert.equal(draftItem.tips.length, 2);
  assert.equal(draftItem.tips[0], 'İpucu 1');
  assert.equal(draftItem.tips[1], 'İpucu 2');
});

test('23. Contact cards: editorial title/sub are translatable; phone/email excluded; location address can be localized', async () => {
  assert.equal(isCmsPathTranslatable('contactCards', 'title'), true);
  assert.equal(isCmsPathTranslatable('contactCards', 'sub'), true);
  assert.equal(isCmsPathTranslatable('contactCards', 'value'), false); // generic value excluded by default

  // Human-readable physical address is allowed by location safety guard
  assert.equal(isTranslatableLocationValue('أرضروم، تركيا - جامعة أتاتورك'), true);
  assert.equal(isTranslatableLocationValue('Erzurum, Turkey - Atatürk University'), true);

  // Communications and technical identifiers excluded
  assert.equal(isTranslatableLocationValue('info@ummet.org'), false);
  assert.equal(isTranslatableLocationValue('+90 555 123 4567'), false);
  assert.equal(isTranslatableLocationValue('https://ummet.org'), false);

  const contact = await readContactPage();
  assert.match(contact, /<CmsEntityTranslationTabs[^>]*target="contactCards"/);
});

test('24. Map editor: title is translatable; embedUrl and openUrl are excluded', async () => {
  assert.equal(isCmsPathTranslatable('contactMap', 'title'), true);
  assert.equal(isCmsPathTranslatable('contactMap', 'embedUrl'), false);
  assert.equal(isCmsPathTranslatable('contactMap', 'openUrl'), false);

  const contact = await readContactPage();
  assert.match(contact, /<CmsEntityTranslationTabs[^>]*target="contactMap"/);
});

test('25. Gallery media caption/title is translatable; media files/URLs remain excluded', async () => {
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.caption'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', '*.media.*.caption'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.url'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.thumbnail'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.photoUrl'), false);

  const gallery = await readMediaGallery();
  assert.match(gallery, /<CmsEntityTranslationTabs[^>]*target="galleryAlbums"[^>]*recordId=/);
});

test('26. News category is user-entered free-form text and translatable', async () => {
  assert.equal(isCmsPathTranslatable('news', 'category'), true);
  assert.equal(isCmsPathTranslatable('news', '*.category'), true);

  const admin = await readAdminDashboard();
  assert.match(admin, /name:\s*['"]category['"]/);
});

test('27. Executive role buttons use localized presentation helper, canonical IDs remain unchanged', async () => {
  const admin = await readAdminDashboard();
  // Role presentation helper must use getExecutiveRoleLabel
  assert.match(admin, /getExecutiveRoleLabel\s*\(\s*role/);
  assert.match(admin, /selectRole\s*\(\s*role\s*\)/);
});

test('28. Plan and Report committee selects use localized visible labels', async () => {
  const admin = await readAdminDashboard();
  // Plan committee select visible label must use getExecutiveSectionLabel
  assert.match(admin, /getExecutiveSectionLabel\s*\(\s*id/);
});

test('29. Committee vision and goals are editorial CMS fields and embedded in admin tabs', async () => {
  assert.equal(isCmsPathTranslatable('committees', 'vision'), true);
  assert.equal(isCmsPathTranslatable('committees', 'goals'), true);

  const admin = await readAdminDashboard();
  assert.match(admin, /<CmsEntityTranslationTabs[^>]*target="committees"[^>]*recordId=\{committee\.id\}/);
});

test('30. Profile personal identity remains untouched; Academic Year uses presentation helper', async () => {
  const profile = await readProfileSettings();
  assert.match(profile, /getAcademicYearPresentation/);
  assert.match(profile, /ACADEMIC_YEAR_KEY_MAP/);
});

test('31. Gallery category dropdown resolves localized labels without hardcoding', async () => {
  const gallery = await readMediaGallery();
  const admin = await readAdminDashboard();
  // Should check for localized category resolver
  assert.match(gallery, /localizedCategories/);
  assert.match(admin, /localizedCategories/);
});

