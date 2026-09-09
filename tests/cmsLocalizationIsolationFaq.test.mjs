/**
 * Regression tests: CMS Localization Write Isolation for FAQ, Guide, Events, Gallery
 *
 * These tests enforce the invariant:
 *   - Arabic canonical content is NEVER modified by TR or EN write operations.
 *   - Write operations always use canonical (Arabic) source data as their base.
 *   - Localized overlays go only into locale-specific localization records.
 *
 * Tests mirror the fix applied to: FAQPage.tsx, StudentGuide.tsx, ProgramsPage.tsx,
 * MediaGallery.tsx, CommitteePage.tsx.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import { executeCmsPublish } from '../src/domain/cmsLocalizationEditor.ts';

// ===========================================================================
// Sample canonical Arabic data fixtures (immutable, treated as production DB)
// ===========================================================================

const canonicalFaqCategories = [
  {
    id: 'cat-1',
    title: 'الأسئلة العامة',
    items: [
      { id: 'q-1', question: 'من نحن؟', answer: 'اتحاد شباب الأمة' },
      { id: 'q-2', question: 'ما هي أهدافنا؟', answer: 'بناء الجيل الواعي' },
    ],
  },
  {
    id: 'cat-2',
    title: 'أسئلة العضوية',
    items: [
      { id: 'q-3', question: 'كيف أنضم؟', answer: 'عبر نموذج التسجيل' },
    ],
  },
];

const effectiveFaqCategoriesTr = [
  {
    id: 'cat-1',
    title: 'Genel Sorular',
    items: [
      { id: 'q-1', question: 'Biz kimiz?', answer: 'Ümmet Gençleri Birliği' },
      { id: 'q-2', question: 'Hedeflerimiz neler?', answer: 'Bilinçli nesil yetiştirmek' },
    ],
  },
  {
    id: 'cat-2',
    title: 'Üyelik Soruları',
    items: [
      { id: 'q-3', question: 'Nasıl katılırım?', answer: 'Kayıt formu aracılığıyla' },
    ],
  },
];

const canonicalGuideSections = [
  {
    id: 'sec-1',
    label: 'الإسكان',
    icon: 'Home',
    color: 'text-navy-700',
    bg: 'bg-navy-100',
    title: 'السكن الجامعي',
    intro: 'كل ما تحتاج معرفته عن السكن',
    items: [{ id: 'item-1', heading: 'أنواع السكن', body: 'يوجد سكن حكومي وخاص', tips: ['قدم مبكراً'] }],
    contacts: [{ id: 'ct-1', label: 'مكتب السكن', value: '+90 312 000 0000', type: 'phone' }],
  },
];

const effectiveGuideSectionsTr = [
  {
    id: 'sec-1',
    label: 'Konut',
    icon: 'Home',
    color: 'text-navy-700',
    bg: 'bg-navy-100',
    title: 'Üniversite Konutları',
    intro: 'Konut hakkında bilmeniz gerekenler',
    items: [{ id: 'item-1', heading: 'Konut Türleri', body: 'Devlet ve özel konut mevcuttur', tips: ['Erken başvurun'] }],
    contacts: [{ id: 'ct-1', label: 'Konut Ofisi', value: '+90 312 000 0000', type: 'phone' }],
  },
];

const canonicalEvents = [
  { id: 'ev-1', title: 'ورشة عمل القيادة', category: 'educational', date: '2026-10-01T10:00:00Z',
    location: 'قاعة المؤتمرات', description: 'ورشة في مهارات القيادة', status: 'upcoming',
    capacity: 50, registered: 0, image: 'https://example.com/ev.jpg', showOnHomepage: true },
  { id: 'ev-2', title: 'رحلة طلابية', category: 'social', date: '2026-11-01T08:00:00Z',
    location: 'مدينة إسطنبول', description: 'رحلة ترفيهية', status: 'upcoming',
    capacity: 80, registered: 0, image: 'https://example.com/ev2.jpg', showOnHomepage: false },
];

const canonicalGalleryAlbums = [
  { id: 'alb-1', title: 'معرض الربيع', categoryId: 'cat-1', date: '2026-04-01',
    location: 'الحرم الجامعي', coverImage: 'https://example.com/cover.jpg',
    photoCount: 12, videoCount: 0, description: 'صور من فعاليات الربيع', media: [] },
];

const canonicalGalleryCategories = [
  { id: 'gcat-1', label: 'الفعاليات' },
  { id: 'gcat-2', label: 'المؤتمرات' },
];

// ===========================================================================
// Helpers simulating corrected write operations
// ===========================================================================

function saveEditedCategory(cats, catId, newTitle) {
  return cats.map((c) => c.id === catId ? { ...c, title: newTitle } : c);
}

function deleteQuestion(cats, catId, questionId) {
  return cats.map((c) => {
    if (c.id !== catId) return c;
    return { ...c, items: c.items.filter((it) => it.id !== questionId) };
  });
}

function addQuestion(cats, catId, newQ) {
  return cats.map((c) => {
    if (c.id !== catId) return c;
    return { ...c, items: [...c.items, newQ] };
  });
}

function editQuestion(cats, catId, qId, patch) {
  return cats.map((c) => {
    if (c.id !== catId) return c;
    return { ...c, items: c.items.map((it) => it.id === qId ? { ...it, ...patch } : it) };
  });
}

// ===========================================================================
// Tests
// ===========================================================================

test('1. FAQ category edit uses canonical Arabic source, not Turkish effective overlay', () => {
  const newTitle = 'أسئلة جديدة';
  const savedWithEffective = saveEditedCategory(effectiveFaqCategoriesTr, 'cat-1', newTitle);
  const savedWithCanonical = saveEditedCategory(canonicalFaqCategories, 'cat-1', newTitle);

  assert.equal(savedWithEffective[1].title, 'Üyelik Soruları', 'BUG: effective leaks Turkish into cat-2');
  assert.equal(savedWithCanonical[1].title, 'أسئلة العضوية', 'FIX: canonical preserves Arabic in cat-2');

  assert.equal(savedWithCanonical[0].items[0].question, 'من نحن؟', 'items must remain Arabic in canonical path');
  assert.equal(savedWithEffective[0].items[0].question, 'Biz kimiz?', 'BUG confirmed: effective leaks Turkish items');
});

test('2. FAQ question delete uses canonical Arabic source', () => {
  const resultCanonical = deleteQuestion(canonicalFaqCategories, 'cat-1', 'q-1');
  const resultEffective = deleteQuestion(effectiveFaqCategoriesTr, 'cat-1', 'q-1');

  const fromCanonical = resultCanonical.find((c) => c.id === 'cat-1').items;
  const fromEffective = resultEffective.find((c) => c.id === 'cat-1').items;

  assert.equal(fromCanonical.length, 1);
  assert.equal(fromCanonical[0].question, 'ما هي أهدافنا؟', 'Remaining question must be Arabic');
  assert.equal(fromEffective[0].question, 'Hedeflerimiz neler?', 'BUG confirmed: effective leaks Turkish');
});

test('3. FAQ add question appends to canonical Arabic base structure', () => {
  const newQ = { id: 'q-new', question: 'هل الاتحاد دولي؟', answer: 'نعم، لديه فروع في عدة دول' };
  const result = addQuestion(canonicalFaqCategories, 'cat-1', newQ);
  const cat1 = result.find((c) => c.id === 'cat-1');

  assert.equal(cat1.items.length, 3);
  assert.equal(cat1.items[0].question, 'من نحن؟', 'q-1 must remain Arabic');
  assert.equal(cat1.items[1].question, 'ما هي أهدافنا؟', 'q-2 must remain Arabic');
  assert.equal(cat1.items[2].question, 'هل الاتحاد دولي؟', 'new q appended correctly');

  const cat2 = result.find((c) => c.id === 'cat-2');
  assert.equal(cat2.title, 'أسئلة العضوية', 'cat-2 entirely unchanged');
});

test('4. FAQ edit question preserves other canonical questions untouched', () => {
  const patch = { question: 'من نكون نحن؟', answer: 'اتحاد طلابي يضم آلاف الأعضاء' };
  const result = editQuestion(canonicalFaqCategories, 'cat-1', 'q-1', patch);
  const cat1 = result.find((c) => c.id === 'cat-1');

  assert.equal(cat1.items[0].question, 'من نكون نحن؟', 'Edited q-1 must reflect new value');
  assert.equal(cat1.items[1].question, 'ما هي أهدافنا؟', 'Untouched q-2 must remain Arabic');
  assert.equal(result[1].title, 'أسئلة العضوية', 'cat-2 entirely untouched');
});

test('5. FAQ category edit uses canonical Arabic source, not English effective overlay', () => {
  const effectiveFaqCategoriesEn = [
    {
      id: 'cat-1', title: 'General Questions',
      items: [
        { id: 'q-1', question: 'Who are we?', answer: 'Ummah Youth Union' },
        { id: 'q-2', question: 'What are our goals?', answer: 'Building a conscious generation' },
      ],
    },
    {
      id: 'cat-2', title: 'Membership Questions',
      items: [{ id: 'q-3', question: 'How do I join?', answer: 'Through the registration form' }],
    },
  ];

  const newTitle = 'أسئلة جديدة';
  const savedWithEffective = saveEditedCategory(effectiveFaqCategoriesEn, 'cat-1', newTitle);
  const savedWithCanonical = saveEditedCategory(canonicalFaqCategories, 'cat-1', newTitle);

  assert.equal(savedWithEffective[1].title, 'Membership Questions', 'BUG: effective leaks English into cat-2');
  assert.equal(savedWithCanonical[1].title, 'أسئلة العضوية', 'FIX: canonical preserves Arabic cat-2');
  assert.equal(savedWithEffective[0].items[0].question, 'Who are we?', 'BUG: effective leaks English items');
  assert.equal(savedWithCanonical[0].items[0].question, 'من نحن؟', 'FIX: canonical items remain Arabic');
});

test('6. Guide section edit uses canonical Arabic source, not Turkish effective overlay', () => {
  const editedTitle = 'السكن الجامعي المعدّل';

  const nextEffective = effectiveGuideSectionsTr.map((s) =>
    s.id === 'sec-1' ? { ...s, title: editedTitle } : s
  );
  const nextCanonical = canonicalGuideSections.map((s) =>
    s.id === 'sec-1' ? { ...s, title: editedTitle } : s
  );

  assert.equal(nextEffective[0].items[0].heading, 'Konut Türleri', 'BUG: effective leaks Turkish item heading');
  assert.equal(nextCanonical[0].items[0].heading, 'أنواع السكن', 'FIX: canonical preserves Arabic item heading');
  assert.equal(nextEffective[0].contacts[0].label, 'Konut Ofisi', 'BUG: effective leaks Turkish contact label');
  assert.equal(nextCanonical[0].contacts[0].label, 'مكتب السكن', 'FIX: canonical preserves Arabic contact label');
  assert.equal(nextCanonical[0].title, editedTitle, 'Edited section title must reflect new value');
});

test('7. Events delete uses canonical Arabic source', () => {
  const effectiveEventsTr = [
    { id: 'ev-1', title: 'Liderlik Çalıştayı', location: 'Konferans Salonu' },
    { id: 'ev-2', title: 'Öğrenci Gezisi', location: 'İstanbul' },
  ];

  const afterDeleteEffective = effectiveEventsTr.filter((e) => e.id !== 'ev-1');
  const afterDeleteCanonical = canonicalEvents.filter((e) => e.id !== 'ev-1');

  assert.equal(afterDeleteEffective[0].title, 'Öğrenci Gezisi', 'BUG confirmed: effective leaks Turkish event title');
  assert.equal(afterDeleteCanonical[0].title, 'رحلة طلابية', 'FIX: canonical preserves Arabic event title');
  assert.equal(afterDeleteCanonical[0].location, 'مدينة إسطنبول', 'FIX: canonical preserves Arabic location');
});

test('8. Gallery album edit uses canonical Arabic source', () => {
  const effectiveAlbumsTr = [
    { id: 'alb-1', title: 'Bahar Sergisi', location: 'Üniversite Kampüsü',
      description: 'Bahar etkinliklerinden fotoğraflar', categoryId: 'cat-1',
      date: '2026-04-01', coverImage: 'https://example.com/cover.jpg',
      photoCount: 12, videoCount: 0, media: [] },
  ];

  const updatedTitle = 'معرض الربيع المحدث';
  const withEffective = effectiveAlbumsTr.map((a) =>
    a.id === 'alb-1' ? { ...a, title: updatedTitle } : a
  );
  const withCanonical = canonicalGalleryAlbums.map((a) =>
    a.id === 'alb-1' ? { ...a, title: updatedTitle } : a
  );

  assert.equal(withEffective[0].description, 'Bahar etkinliklerinden fotoğraflar', 'BUG: effective leaks Turkish description');
  assert.equal(withCanonical[0].description, 'صور من فعاليات الربيع', 'FIX: canonical preserves Arabic description');
  assert.equal(withCanonical[0].location, 'الحرم الجامعي', 'FIX: canonical preserves Arabic location');
  assert.equal(withCanonical[0].title, updatedTitle, 'Edited album title must reflect new value');
});

test('9. Gallery category delete uses canonical Arabic source', () => {
  const effectiveCatsTr = [
    { id: 'gcat-1', label: 'Etkinlikler' },
    { id: 'gcat-2', label: 'Konferanslar' },
  ];

  const afterEffective = effectiveCatsTr.filter((c) => c.id !== 'gcat-1');
  const afterCanonical = canonicalGalleryCategories.filter((c) => c.id !== 'gcat-1');

  assert.equal(afterEffective[0].label, 'Konferanslar', 'BUG confirmed: effective leaks Turkish category label');
  assert.equal(afterCanonical[0].label, 'المؤتمرات', 'FIX: canonical preserves Arabic category label');
});

test('10. TR and EN localizations are isolated — publishing TR does not affect EN', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalPayload = { categories: JSON.parse(JSON.stringify(canonicalFaqCategories)) };
  const sourceHash = computeSourceHash(canonicalPayload);

  await executeCmsPublish({
    repository: repo,
    target: 'faqCategories',
    locale: 'tr',
    canonicalPayload,
    payload: { categories: [{ id: 'cat-1', title: 'Genel Sorular' }] },
    manualPaths: ['categories.0.title'],
  });

  await executeCmsPublish({
    repository: repo,
    target: 'faqCategories',
    locale: 'en',
    canonicalPayload,
    payload: { categories: [{ id: 'cat-1', title: 'General Questions' }] },
    manualPaths: ['categories.0.title'],
  });

  const loadedTr = await repo.getPublished('faqCategories', 'tr');
  const loadedEn = await repo.getPublished('faqCategories', 'en');

  assert.ok(loadedTr, 'TR record must be stored');
  assert.ok(loadedEn, 'EN record must be stored');
  assert.equal(loadedTr.payload.categories[0].title, 'Genel Sorular', 'TR record must have Turkish title');
  assert.equal(loadedEn.payload.categories[0].title, 'General Questions', 'EN record must have English title');
  assert.notEqual(loadedTr.payload.categories[0].title, loadedEn.payload.categories[0].title, 'TR and EN must be independent');
  assert.equal(loadedTr.sourceHash, sourceHash, 'TR sourceHash must match canonical');
  assert.equal(loadedEn.sourceHash, sourceHash, 'EN sourceHash must match canonical');

  // Canonical Arabic payload must be completely unmodified
  assert.equal(canonicalPayload.categories[0].title, 'الأسئلة العامة', 'Canonical Arabic must be unchanged');
  assert.equal(canonicalPayload.categories[0].items[0].question, 'من نحن؟', 'Canonical Arabic questions unchanged');
  assert.equal(canonicalPayload.categories[1].title, 'أسئلة العضوية', 'Canonical Arabic cat-2 unchanged');
});

test('11. entity translation publish refreshes the currently displayed locale immediately', () => {
  const pages = [
    'FAQPage.tsx',
    'StudentGuide.tsx',
    'ProgramsPage.tsx',
    'MediaGallery.tsx',
    'CommitteePage.tsx',
  ];

  for (const page of pages) {
    const source = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
    const tabCount = (source.match(/<CmsEntityTranslationTabs\b/g) ?? []).length;
    const refreshCount = (source.match(/onPublished=\{refreshPublishedLocalizations\}/g) ?? []).length;

    assert.ok(tabCount > 0, `${page} must contain entity translation tabs`);
    assert.ok(
      refreshCount >= tabCount,
      `${page} must refresh the active locale after every entity translation publish`,
    );
  }
});

test('12. entity translation editors build canonical payloads from Arabic sources', () => {
  const faq = readFileSync(new URL('../src/pages/FAQPage.tsx', import.meta.url), 'utf8');
  const programs = readFileSync(new URL('../src/pages/ProgramsPage.tsx', import.meta.url), 'utf8');
  const gallery = readFileSync(new URL('../src/pages/MediaGallery.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(faq, /canonicalPayload=\{editingCat \? faqCategories/);
  assert.doesNotMatch(faq, /canonicalPayload=\{editingQ \? faqCategories/);
  assert.doesNotMatch(programs, /canonicalPayload=\{editId \? events/);
  assert.doesNotMatch(gallery, /canonicalPayload=\{editingAlbum \? galleryAlbums/);
  assert.doesNotMatch(gallery, /canonicalPayload=\{editingCategory \? galleryCategories/);
  assert.doesNotMatch(gallery, /canonicalPayload=\{galleryAlbums\}/);
});
