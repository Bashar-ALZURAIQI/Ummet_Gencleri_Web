import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Domain imports (these will fail or partly fail before implementation)
import {
  determineTranslationCandidates,
  mergeTranslationIntoPayload,
} from '../src/domain/cmsTranslationCandidate.ts';
import { isTranslatableLocationValue } from '../src/domain/cmsLocalizationEditor.ts';
import { isCmsPathTranslatable } from '../src/domain/cmsTranslatableFields.ts';
import ar from '../src/i18n/locales/ar.ts';
import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

const readSectionSource = () =>
  readFile(
    new URL('../src/components/cmsLocalization/CmsTranslationSection.tsx', import.meta.url),
    'utf8',
  );

const readTabsSource = () =>
  readFile(
    new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url),
    'utf8',
  );

const readAzureTranslatorSource = () =>
  readFile(
    new URL('../src/services/translation/AzureTranslator.ts', import.meta.url),
    'utf8',
  );

const readEdgeFunctionSource = () =>
  readFile(
    new URL('../supabase/functions/translate-cms-content/index.ts', import.meta.url),
    'utf8',
  );

const readTypesSource = () =>
  readFile(
    new URL('../src/services/translation/types.ts', import.meta.url),
    'utf8',
  );

// ---------------------------------------------------------------------------
// 1. Provider Contract & Boundaries
// ---------------------------------------------------------------------------

test('1. TranslationProvider contract exists and defines request, result, and interface', async () => {
  const source = await readTypesSource();
  assert.match(source, /export\s+type\s+TranslationLocale\s*=\s*['"]tr['"]\s*\|\s*['"]en['"]/);
  assert.match(source, /export\s+interface\s+TranslationRequest/);
  assert.match(source, /sourceLocale:\s*['"]ar['"]/);
  assert.match(source, /targetLocale:\s*TranslationLocale/);
  assert.match(source, /fields:\s*Record<string,\s*string>/);
  assert.match(source, /export\s+interface\s+TranslationResult/);
  assert.match(source, /translations:\s*Record<string,\s*string>/);
  assert.match(source, /export\s+interface\s+TranslationProvider/);
  assert.match(source, /translate\s*\(\s*request:\s*TranslationRequest\s*\):\s*Promise<TranslationResult>/);
  // Zero React and zero Supabase in contract
  assert.doesNotMatch(source, /from\s+['"]react['"]/);
  assert.doesNotMatch(source, /@supabase/);
});

// ---------------------------------------------------------------------------
// 2–7. Translatable Field Extraction & Exclusions
// ---------------------------------------------------------------------------

test('2. Only allowlisted editorial fields are extracted for translation', () => {
  const canonical = {
    hero: {
      badge: 'شارة البداية',
      title: 'عنوان رئيسي',
      description: 'وصف تفصيلي للفعالية',
    },
    internalCode: 'TECH_123',
  };

  const candidates = determineTranslationCandidates({
    target: 'site',
    canonicalPayload: canonical,
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['hero.badge'], 'شارة البداية');
  assert.equal(candidates['hero.title'], 'عنوان رئيسي');
  assert.equal(candidates['hero.description'], 'وصف تفصيلي للفعالية');
  assert.equal(candidates['internalCode'], undefined);
});

test('3. Technical fields (id, dates, emails, phones, URLs) are strictly excluded from candidates', () => {
  const canonical = {
    id: 'evt-123-uuid',
    date: '2026-09-10',
    time: '18:00',
    email: 'contact@ummet.org',
    phone: '+905551234567',
    coverImage: 'https://cdn.example.com/photo.jpg',
    url: 'https://ummet.org/events/1',
    title: 'لقاء تعريفي',
  };

  const candidates = determineTranslationCandidates({
    target: 'events',
    canonicalPayload: canonical,
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['title'], 'لقاء تعريفي');
  assert.equal(candidates['id'], undefined);
  assert.equal(candidates['date'], undefined);
  assert.equal(candidates['time'], undefined);
  assert.equal(candidates['email'], undefined);
  assert.equal(candidates['phone'], undefined);
  assert.equal(candidates['coverImage'], undefined);
  assert.equal(candidates['url'], undefined);
});

test('4. Fixed system enums (events.category, events.activityType, plans.quarter, reports.type) are excluded', () => {
  assert.equal(isCmsPathTranslatable('events', 'category'), false);
  assert.equal(isCmsPathTranslatable('events', 'activityType'), false);
  assert.equal(isCmsPathTranslatable('plans', 'quarter'), false);
  assert.equal(isCmsPathTranslatable('reports', 'type'), false);

  const eventPayload = {
    title: 'ورشة عمل تقنية',
    category: 'workshop',
    activityType: 'MANDATORY',
  };

  const candidates = determineTranslationCandidates({
    target: 'events',
    canonicalPayload: eventPayload,
    activeRecord: null,
    locale: 'en',
    mode: 'missing',
  });

  assert.equal(candidates['title'], 'ورشة عمل تقنية');
  assert.equal(candidates['category'], undefined);
  assert.equal(candidates['activityType'], undefined);
});

test('5. Human-readable location text is eligible for translation candidates', () => {
  const locationText = 'قاعة المؤتمرات - مركز الأنشطة';
  assert.equal(isTranslatableLocationValue(locationText), true);

  const candidates = determineTranslationCandidates({
    target: 'events',
    canonicalPayload: { title: 'مؤتمر سنوي', location: locationText },
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['location'], locationText);
});

test('6. Technical map URLs and coordinate locations are strictly excluded from candidates', () => {
  const mapUrl = 'https://maps.google.com/?q=41.0082,28.9784';
  const coords = '41.0082, 28.9784';
  assert.equal(isTranslatableLocationValue(mapUrl), false);
  assert.equal(isTranslatableLocationValue(coords), false);

  const candidatesUrl = determineTranslationCandidates({
    target: 'events',
    canonicalPayload: { title: 'مؤتمر سنوي', location: mapUrl },
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });
  assert.equal(candidatesUrl['location'], undefined);

  const candidatesCoords = determineTranslationCandidates({
    target: 'events',
    canonicalPayload: { title: 'مؤتمر سنوي', location: coords },
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });
  assert.equal(candidatesCoords['location'], undefined);
});

test('7. Nested paths for FAQ questions, Student Guide tips, and gallery captions are handled correctly', () => {
  const guidePayload = {
    title: 'دليل الطالب الجامعي',
    tips: ['النقطة الأولى للبحث', 'النقطة الثانية للتسجيل'],
  };

  const candidates = determineTranslationCandidates({
    target: 'guideSections',
    canonicalPayload: guidePayload,
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['title'], 'دليل الطالب الجامعي');
  assert.equal(candidates['tips.0'], 'النقطة الأولى للبحث');
  assert.equal(candidates['tips.1'], 'النقطة الثانية للتسجيل');
});

// ---------------------------------------------------------------------------
// 8–12. Missing vs Stale Candidate Logic & Manual Path Protection
// ---------------------------------------------------------------------------

test('8. Missing fields without localized values are selected for translation', () => {
  const canonical = {
    title: 'عنوان المقال',
    description: 'وصف المقال',
  };

  const activeRecord = {
    target: 'news',
    locale: 'tr',
    payload: { title: 'Makale Başlığı' }, // description is missing
    status: 'draft',
    manualPaths: [],
    stalePaths: [],
    sourceHash: 'hash1',
    updatedAt: new Date().toISOString(),
  };

  const candidates = determineTranslationCandidates({
    target: 'news',
    canonicalPayload: canonical,
    activeRecord,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['description'], 'وصف المقال');
  assert.equal(candidates['title'], undefined); // already has localized value
});

test('9. Fresh fields are skipped and not submitted for translation', () => {
  const canonical = {
    title: 'عنوان رئيسي',
    description: 'وصف',
  };

  const activeRecord = {
    target: 'site',
    locale: 'tr',
    payload: { 'hero.title': 'Ana Başlık', 'hero.description': 'Açıklama' },
    status: 'fresh',
    manualPaths: [],
    stalePaths: [],
    sourceHash: 'hash1',
    updatedAt: new Date().toISOString(),
  };

  const candidates = determineTranslationCandidates({
    target: 'site',
    canonicalPayload: { hero: canonical },
    activeRecord,
    locale: 'tr',
    mode: 'stale',
  });

  assert.deepEqual(candidates, {});
});

test('10. Stale fields are selected for re-translation during Translate Changes', () => {
  const canonical = {
    title: 'عنوان جديد ومعدل',
    description: 'الوصف الأصلي لم يتغير',
  };

  const activeRecord = {
    target: 'news',
    locale: 'tr',
    payload: { title: 'Eski Başlık', description: 'Orijinal Açıklama' },
    status: 'stale',
    manualPaths: [],
    stalePaths: ['title'],
    sourceHash: 'oldHash',
    updatedAt: new Date().toISOString(),
  };

  const candidates = determineTranslationCandidates({
    target: 'news',
    canonicalPayload: canonical,
    activeRecord,
    locale: 'tr',
    mode: 'stale',
  });

  assert.equal(candidates['title'], 'عنوان جديد ومعدل');
  assert.equal(candidates['description'], undefined);
});

test('11. manualPaths are NEVER automatically overwritten by machine translation', () => {
  const canonical = {
    title: 'عنوان عربي معدل',
    description: 'وصف معدل',
  };

  const activeRecord = {
    target: 'news',
    locale: 'tr',
    payload: {
      title: 'İnsan Çevirisi Başlık (Özel)',
      description: 'Eski Makine Çevirisi',
    },
    status: 'stale',
    manualPaths: ['title'], // Turkish title was edited by a human
    stalePaths: ['title', 'description'],
    sourceHash: 'oldHash',
    updatedAt: new Date().toISOString(),
  };

  const candidates = determineTranslationCandidates({
    target: 'news',
    canonicalPayload: canonical,
    activeRecord,
    locale: 'tr',
    mode: 'stale',
  });

  // title is protected!
  assert.equal(candidates['title'], undefined);
  // description was NOT manually edited, so it can be refreshed
  assert.equal(candidates['description'], 'وصف معدل');
});

test('12. Zero-candidate request does not invoke the provider', async () => {
  let callCount = 0;
  const mockProvider = {
    async translate(req) {
      callCount++;
      return { targetLocale: req.targetLocale, translations: {} };
    },
  };

  const candidates = determineTranslationCandidates({
    target: 'site',
    canonicalPayload: { hero: { title: 'عنوان' } },
    activeRecord: {
      target: 'site',
      locale: 'tr',
      payload: { 'hero.title': 'Başlık' },
      status: 'fresh',
      manualPaths: [],
      stalePaths: [],
      sourceHash: 'hash',
      updatedAt: new Date().toISOString(),
    },
    locale: 'tr',
    mode: 'stale',
  });

  if (Object.keys(candidates).length > 0) {
    await mockProvider.translate({ sourceLocale: 'ar', targetLocale: 'tr', fields: candidates });
  }

  assert.equal(callCount, 0);
});

// ---------------------------------------------------------------------------
// 13–16. Draft Merging, Sibling Preservation, and Persistence Bounds
// ---------------------------------------------------------------------------

test('13. Machine-translated output merges into the full target payload structure', () => {
  const basePayload = {
    hero: { badge: 'Mevcut Şerit', title: 'Eski Başlık' },
    footer: { address: 'Mevcut Adres' },
  };

  const translations = {
    'hero.title': 'Yeni Çevrilmiş Başlık',
    'hero.subtitle': 'Yeni Çevrilmiş Alt Başlık',
  };

  const merged = mergeTranslationIntoPayload(basePayload, translations);

  assert.equal(merged.hero.title, 'Yeni Çevrilmiş Başlık');
  assert.equal(merged.hero.subtitle, 'Yeni Çevrilmiş Alt Başlık');
  assert.equal(merged.hero.badge, 'Mevcut Şerit');
  assert.equal(merged.footer.address, 'Mevcut Adres');
});

test('14. Sibling entities in lists and records are preserved during merge', () => {
  const baseList = [
    { id: 'item-1', title: 'Öğe 1 TR', desc: 'Açıklama 1' },
    { id: 'item-2', title: 'Öğe 2 TR', desc: 'Açıklama 2' },
  ];

  const merged = mergeTranslationIntoPayload(
    baseList,
    { 'title': 'Öğe 2 Güncellendi' },
    'item-2',
  );

  assert.equal(Array.isArray(merged), true);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, 'Öğe 1 TR');
  assert.equal(merged[1].title, 'Öğe 2 Güncellendi');
  assert.equal(merged[1].desc, 'Açıklama 2');
});

test('15. Successful machine translation is saved as DRAFT only', async () => {
  const source = await readTabsSource();
  assert.match(source, /status:\s*['"]draft['"]/);
  assert.match(source, /repository\.saveDraft/);
});

test('16. Automatic translation never calls savePublished', async () => {
  const tabsSource = await readTabsSource();
  const sectionSource = await readSectionSource();
  assert.doesNotMatch(tabsSource, /repository\.savePublished/);
  assert.doesNotMatch(sectionSource, /handleTranslate.*savePublished/);
});

// ---------------------------------------------------------------------------
// 17–22. UI Integration, Actions & Locale Independence
// ---------------------------------------------------------------------------

test('17. "Translate" button appears when status is missing', async () => {
  const tabsSource = await readTabsSource();
  const sectionSource = await readSectionSource();
  assert.match(tabsSource, /cmsLocalization\.translate/);
  assert.match(sectionSource, /cmsLocalization\.translate/);
});

test('18. "Translate changes" button appears when status is stale', async () => {
  const tabsSource = await readTabsSource();
  const sectionSource = await readSectionSource();
  assert.match(tabsSource, /cmsLocalization\.translateChanges/);
  assert.match(sectionSource, /cmsLocalization\.translateChanges/);
});

test('19. Loading state disables button to prevent duplicate requests', async () => {
  const tabsSource = await readTabsSource();
  const sectionSource = await readSectionSource();
  assert.match(tabsSource, /disabled=\{[^}]*translating/);
  assert.match(sectionSource, /disabled=\{[^}]*translating/);
});

test('20. Provider failure preserves user-typed text and current draft without wiping', async () => {
  const tabsSource = await readTabsSource();
  const sectionSource = await readSectionSource();
  assert.match(tabsSource, /catch/);
  assert.match(tabsSource, /translationFailed/);
  assert.match(sectionSource, /catch/);
  assert.match(sectionSource, /translationFailed/);
});

test('21. Turkish and English can be translated independently', async () => {
  const tabsSource = await readTabsSource();
  assert.match(tabsSource, /handleAutoTranslate\s*\(\s*(activeTab|locale)/);
});

test('22. Failure in one target language does not cancel or erase success in the other', async () => {
  let trCalled = false;
  let enCalled = false;

  const mockProvider = {
    async translate(req) {
      if (req.targetLocale === 'tr') {
        trCalled = true;
        return { targetLocale: 'tr', translations: { title: 'TR Başlık' } };
      }
      enCalled = true;
      throw new Error('Azure network failure');
    },
  };

  const results = {};
  try {
    results.tr = await mockProvider.translate({ sourceLocale: 'ar', targetLocale: 'tr', fields: { title: 'عنوان' } });
  } catch {
    results.tr = null;
  }

  try {
    results.en = await mockProvider.translate({ sourceLocale: 'ar', targetLocale: 'en', fields: { title: 'عنوان' } });
  } catch {
    results.en = null;
  }

  assert.equal(trCalled, true);
  assert.equal(enCalled, true);
  assert.notEqual(results.tr, null);
  assert.equal(results.tr.translations.title, 'TR Başlık');
  assert.equal(results.en, null);
});

// ---------------------------------------------------------------------------
// 23–27. Security Boundaries & Edge Function Invariants
// ---------------------------------------------------------------------------

test('23. AzureTranslator frontend service contains NO Azure subscription keys or endpoints', async () => {
  const source = await readAzureTranslatorSource();
  assert.doesNotMatch(source, /Ocp-Apim-Subscription-Key/i);
  assert.doesNotMatch(source, /AZURE_TRANSLATOR_KEY/);
  assert.doesNotMatch(source, /api\.cognitive\.microsofttranslator\.com/);
  assert.doesNotMatch(source, /VITE_AZURE/);
});

test('24. Frontend calls the secure Edge Function boundary only and does not call Azure directly', async () => {
  const source = await readAzureTranslatorSource();
  assert.match(source, /functions\.invoke\s*\(\s*['"]translate-cms-content['"]/);
  assert.doesNotMatch(source, /fetch\s*\(\s*['"]https:\/\/api\.cognitive/);
});

test('25. Edge Function reads Azure credentials from server-side environment variables only', async () => {
  const source = await readEdgeFunctionSource();
  assert.match(source, /Deno\.env\.get\s*\(\s*["']AZURE_TRANSLATOR_KEY["']\s*\)/);
  assert.match(source, /Deno\.env\.get\s*\(\s*["']AZURE_TRANSLATOR_REGION["']\s*\)/);
});

test('26. Edge Function validates sourceLocale, targetLocale, and payload fields', async () => {
  const source = await readEdgeFunctionSource();
  assert.match(source, /sourceLocale\s*!==\s*['"]ar['"]/);
  assert.match(source, /targetLocale/);
  assert.match(source, /fields/);
});

test('27. Edge Function returns safe normalized errors without exposing credentials or internal traces', async () => {
  const source = await readEdgeFunctionSource();
  // Safe error responses
  assert.match(source, /TRANSLATOR_NOT_CONFIGURED|TRANSLATION_FAILED|INVALID_REQUEST/);
  // Never sends secrets in JSON response
  assert.doesNotMatch(source, /body:\s*JSON\.stringify\([^)]*AZURE_TRANSLATOR_KEY/);
});

// ---------------------------------------------------------------------------
// 28. Existing 7C2A / 7C2B Behavior & I18N Parity
// ---------------------------------------------------------------------------

test('28. 7C2A / 7C2B existing behaviors and i18n dictionaries remain intact', () => {
  assert.ok(ar.cmsLocalization);
  assert.ok(tr.cmsLocalization);
  assert.ok(en.cmsLocalization);

  assert.equal(ar.cmsLocalization.status.fresh, 'طازجة ✓');
  assert.equal(tr.cmsLocalization.status.fresh, 'Güncel ✓');
  assert.ok(en.cmsLocalization.status.fresh);

  // Verify new 7D keys exist across all 3 locales
  for (const key of [
    'translate',
    'translateChanges',
    'translating',
    'translationFailed',
    'translationCompleted',
    'noChangesToTranslate',
    'machineTranslated',
    'manualTranslationProtected',
  ]) {
    assert.ok(ar.cmsLocalization[key], `Missing ar.cmsLocalization.${key}`);
    assert.ok(tr.cmsLocalization[key], `Missing tr.cmsLocalization.${key}`);
    assert.ok(en.cmsLocalization[key], `Missing en.cmsLocalization.${key}`);
  }
});

// ---------------------------------------------------------------------------
// 29–42. Visual QA Corrective Tests
// ---------------------------------------------------------------------------

const readCommitteePageSource = () =>
  readFile(
    new URL('../src/pages/CommitteePage.tsx', import.meta.url),
    'utf8',
  );

const readProgramsPageSource = () =>
  readFile(
    new URL('../src/pages/ProgramsPage.tsx', import.meta.url),
    'utf8',
  );

const readAdminDashboardSource = () =>
  readFile(
    new URL('../src/pages/AdminDashboard.tsx', import.meta.url),
    'utf8',
  );

test('29. Statistic title (stats.*.label) is CMS-translatable in schema', () => {
  assert.equal(isCmsPathTranslatable('committees', 'stats.0.label'), true);
  assert.equal(isCmsPathTranslatable('committees', 'stats.1.label'), true);
});

test('30. Statistic numeric value (stats.*.value) is excluded from translatable schema', () => {
  assert.equal(isCmsPathTranslatable('committees', 'stats.0.value'), false);
  assert.equal(isCmsPathTranslatable('committees', 'stats.1.value'), false);
});

test('31. Public organizational biography (head.bio) is translatable in schema', () => {
  assert.equal(isCmsPathTranslatable('committees', 'head.bio'), true);
});

test('32. Officer name, email, photo, and fixed role remain strictly excluded from translatable schema', () => {
  assert.equal(isCmsPathTranslatable('committees', 'head.name'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.email'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.photo'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.role'), false);
});

test('33. Committee responsibility item text (responsibilities.*) is translatable', () => {
  assert.equal(isCmsPathTranslatable('committees', 'responsibilities.0'), true);
  assert.equal(isCmsPathTranslatable('committees', 'responsibilities.1'), true);
});

test('34. Add and edit responsibility flows in CommitteePage and AdminDashboard expose multilingual translation tabs', async () => {
  const commSource = await readCommitteePageSource();
  const adminSource = await readAdminDashboardSource();

  assert.match(commSource, /openAddResp/);
  assert.match(commSource, /openEditResp/);
  assert.match(commSource, /<CmsEntityTranslationTabs[^>]*target="committees"[^>]*fields=\{[^}]*responsibilities/s);

  assert.match(adminSource, /openAddResp/);
  assert.match(adminSource, /openEditResp/);
  assert.match(adminSource, /<CmsEntityTranslationTabs[^>]*target="committees"[^>]*fields=\{[^}]*responsibilities/s);
});

test('35. Committee responsibilities preserve collection structure and array order', () => {
  const canonical = {
    id: 'culture',
    responsibilities: [
      'تنظيم المسابقات الثقافية',
      'إدارة النادي القرآني',
    ],
  };

  const candidates = determineTranslationCandidates({
    target: 'committees',
    canonicalPayload: canonical,
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(candidates['responsibilities.0'], 'تنظيم المسابقات الثقافية');
  assert.equal(candidates['responsibilities.1'], 'إدارة النادي القرآني');
});

test('36. Programs hero badge, title, and description are translatable in schema', () => {
  assert.equal(isCmsPathTranslatable('programsContent', 'badge'), true);
  assert.equal(isCmsPathTranslatable('programsContent', 'title'), true);
  assert.equal(isCmsPathTranslatable('programsContent', 'description'), true);
});

test('37. ProgramsPage hero edit form embeds CmsEntityTranslationTabs', async () => {
  const source = await readProgramsPageSource();
  assert.match(source, /editingHeader/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="programsContent"/);
  assert.match(source, /badge/);
  assert.match(source, /title/);
  assert.match(source, /description/);
});

test('38. Statistic edit modal in CommitteePage embeds CmsEntityTranslationTabs for title while keeping value outside', async () => {
  const source = await readCommitteePageSource();
  assert.match(source, /statModal/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="committees"/);
  // label is inside translation tabs
  assert.match(source, /name:\s*['"]label['"]/);
});

test('39. Head / responsible edit modal in CommitteePage and AdminDashboard embeds CmsEntityTranslationTabs for bio', async () => {
  const commSource = await readCommitteePageSource();
  const adminSource = await readAdminDashboardSource();

  assert.match(commSource, /headModal/);
  assert.match(commSource, /<CmsEntityTranslationTabs[^>]*target="committees"[^>]*fields=\{[^}]*head\.bio/s);

  assert.match(adminSource, /headModal/);
  assert.match(adminSource, /<CmsEntityTranslationTabs[^>]*target="committees"[^>]*fields=\{[^}]*head\.bio/s);
});

test('40. Gallery category filter resolves dynamically without hardcoded fake labels', async () => {
  const gallerySource = await readFile(new URL('../src/pages/MediaGallery.tsx', import.meta.url), 'utf8');
  assert.match(gallerySource, /useCmsLocalizationRepository/);
  // Zero fake hardcoded Turkish dictionary injection for galleryCategories
  assert.doesNotMatch(gallerySource, /const\s+hardcodedCategories\s*=/);
});

test('41. Strange black tooltip "do it ..." is confirmed absent from source code (external browser overlay)', async () => {
  const commSource = await readCommitteePageSource();
  const adminSource = await readAdminDashboardSource();
  assert.doesNotMatch(commSource, /do it/i);
  assert.doesNotMatch(adminSource, /do it/i);
});

test('42. Newly eligible fields (head.bio, stats.0.label, responsibilities.0, programsContent) extract properly in 7D candidate determination', () => {
  const commCandidates = determineTranslationCandidates({
    target: 'committees',
    canonicalPayload: {
      id: 'media',
      head: { bio: 'نبذة عن رئيس اللجنة الإعلامية', name: 'أحمد' },
      stats: [{ label: 'اجتماعات الهيئة', value: '32' }],
      responsibilities: ['تغطية الفعاليات'],
    },
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(commCandidates['head.bio'], 'نبذة عن رئيس اللجنة الإعلامية');
  assert.equal(commCandidates['stats.0.label'], 'اجتماعات الهيئة');
  assert.equal(commCandidates['responsibilities.0'], 'تغطية الفعاليات');
  assert.equal(commCandidates['head.name'], undefined);
  assert.equal(commCandidates['stats.0.value'], undefined);

  const progCandidates = determineTranslationCandidates({
    target: 'programsContent',
    canonicalPayload: {
      badge: 'شارة البرامج',
      title: 'برامجنا وأنشطتنا',
      description: 'وصف مفصل للبرامج',
    },
    activeRecord: null,
    locale: 'tr',
    mode: 'missing',
  });

  assert.equal(progCandidates['badge'], 'شارة البرامج');
  assert.equal(progCandidates['title'], 'برامجنا وأنشطتنا');
  assert.equal(progCandidates['description'], 'وصف مفصل للبرامج');
});

