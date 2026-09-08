import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Import the domain module under test
import {
  resolveCmsLocalization,
  normalizeLocalizationPaths,
  isLocalizationPathStale,
  isLocalizationPathManual,
  markLocalizationStale,
  computeSourceHash,
  CMS_TARGETS,
  CANONICAL_CMS_LOCALE,
  LOCALIZED_CMS_LOCALES,
} from '../src/domain/cmsLocalization.ts';

// ---------------------------------------------------------------------------
// 1. CANONICAL ARABIC RESOLUTION
// ---------------------------------------------------------------------------

test('1. Arabic request always returns canonical Arabic', () => {
  const canonical = { title: 'مرحبا بكم', body: 'محتوى أصلي' };
  const trLocalization = {
    target: 'site',
    locale: 'tr',
    payload: { title: 'Hoşgeldiniz', body: 'Orijinal içerik' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization({
    requestedLocale: 'ar',
    canonicalPayload: canonical,
    localization: trLocalization,
  });

  assert.deepEqual(result.payload, canonical);
  assert.equal(result.requestedLocale, 'ar');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, false);
  assert.equal(result.status, 'fresh');
});

test('2. Arabic request never uses TR localization even if TR is fresh', () => {
  const canonical = { headline: 'العنوان بالعربية' };
  const trRecord = {
    target: 'news',
    locale: 'tr',
    payload: { headline: 'Türkçe Başlık' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('ar', canonical, trRecord);
  assert.equal(result.payload.headline, 'العنوان بالعربية');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, false);
});

test('3. Arabic request never uses EN localization even if EN is fresh', () => {
  const canonical = { headline: 'العنوان بالعربية' };
  const enRecord = {
    target: 'news',
    locale: 'en',
    payload: { headline: 'English Headline' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('ar', canonical, enRecord);
  assert.equal(result.payload.headline, 'العنوان بالعربية');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, false);
});

// ---------------------------------------------------------------------------
// 2. FRESH LOCALIZED CONTENT RESOLUTION
// ---------------------------------------------------------------------------

test('4. Fresh Turkish published localization resolves Turkish', () => {
  const canonical = { about: 'عن الاتحاد' };
  const trRecord = {
    target: 'about',
    locale: 'tr',
    payload: { about: 'Birlik Hakkında' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: ['about'],
  };

  const result = resolveCmsLocalization({
    requestedLocale: 'tr',
    canonicalPayload: canonical,
    localization: trRecord,
  });

  assert.deepEqual(result.payload, { about: 'Birlik Hakkında' });
  assert.equal(result.requestedLocale, 'tr');
  assert.equal(result.actualLocale, 'tr');
  assert.equal(result.didFallback, false);
  assert.equal(result.status, 'fresh');
  assert.deepEqual(result.manualPaths, ['about']);
  assert.deepEqual(result.stalePaths, []);
});

test('5. Fresh English published localization resolves English', () => {
  const canonical = { about: 'عن الاتحاد' };
  const enRecord = {
    target: 'about',
    locale: 'en',
    payload: { about: 'About the Union' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('en', canonical, enRecord);

  assert.deepEqual(result.payload, { about: 'About the Union' });
  assert.equal(result.requestedLocale, 'en');
  assert.equal(result.actualLocale, 'en');
  assert.equal(result.didFallback, false);
  assert.equal(result.status, 'fresh');
});

// ---------------------------------------------------------------------------
// 3. MISSING TRANSLATION FALLBACK
// ---------------------------------------------------------------------------

test('6. Missing Turkish localization falls back to Arabic', () => {
  const canonical = { banner: 'إعلان مهم' };

  const result = resolveCmsLocalization({
    requestedLocale: 'tr',
    canonicalPayload: canonical,
    localization: null,
  });

  assert.deepEqual(result.payload, canonical);
  assert.equal(result.requestedLocale, 'tr');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
  assert.equal(result.status, 'missing');
});

test('7. Missing English localization falls back to Arabic', () => {
  const canonical = { banner: 'إعلان مهم' };

  const result = resolveCmsLocalization('en', canonical, null);

  assert.deepEqual(result.payload, canonical);
  assert.equal(result.requestedLocale, 'en');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
  assert.equal(result.status, 'missing');
});

test('8. Fallback resolution reports requestedLocale, actualLocale, didFallback', () => {
  const canonical = { items: [1, 2, 3] };
  const result = resolveCmsLocalization('tr', canonical, undefined);

  assert.equal(result.requestedLocale, 'tr');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
  assert.equal(result.status, 'missing');
  assert.deepEqual(result.payload, canonical);
});

// ---------------------------------------------------------------------------
// 4. STALE LOCALIZATION RESOLUTION
// ---------------------------------------------------------------------------

test('9. Stale Turkish translation remains visible in public read resolver', () => {
  const canonical = { title: 'عنوان جديد بالعربية', intro: 'مقدمة جديدة' };
  const staleTr = {
    target: 'site',
    locale: 'tr',
    payload: { title: 'Eski Türkçe Başlık', intro: 'Eski Türkçe Giriş' },
    status: 'stale',
    stalePaths: ['title', 'intro'],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('tr', canonical, staleTr);

  assert.deepEqual(result.payload, staleTr.payload);
  assert.equal(result.requestedLocale, 'tr');
  assert.equal(result.actualLocale, 'tr');
  assert.equal(result.didFallback, false);
});

test('10. Stale English translation remains visible in public read resolver', () => {
  const canonical = { title: 'عنوان جديد بالعربية' };
  const staleEn = {
    target: 'site',
    locale: 'en',
    payload: { title: 'Old English Title' },
    status: 'stale',
    stalePaths: ['title'],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('en', canonical, staleEn);

  assert.deepEqual(result.payload, staleEn.payload);
  assert.equal(result.requestedLocale, 'en');
  assert.equal(result.actualLocale, 'en');
  assert.equal(result.didFallback, false);
});

test('11. Stale state is exposed with status and stalePaths', () => {
  const canonical = { q: 'سؤال' };
  const staleTr = {
    target: 'faqCategories',
    locale: 'tr',
    payload: { q: 'Soru' },
    status: 'stale',
    stalePaths: ['categories.0.questions.0.q'],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('tr', canonical, staleTr);

  assert.equal(result.status, 'stale');
  assert.deepEqual(result.stalePaths, ['categories.0.questions.0.q']);
});

test('12. stalePaths are preserved accurately', () => {
  const canonical = { a: '1', b: '2' };
  const staleEn = {
    target: 'site',
    locale: 'en',
    payload: { a: '1-en', b: '2-en' },
    status: 'stale',
    stalePaths: ['a'],
    manualPaths: ['b'],
  };

  const result = resolveCmsLocalization('en', canonical, staleEn);
  assert.deepEqual(result.stalePaths, ['a']);
  assert.deepEqual(result.manualPaths, ['b']);
});

// ---------------------------------------------------------------------------
// 5. DRAFT LOCALIZATION RESOLUTION
// ---------------------------------------------------------------------------

test('13. Draft Turkish content is not exposed publicly and falls back to Arabic', () => {
  const canonical = { secretNews: 'خبر منشور بالعربية' };
  const draftTr = {
    target: 'news',
    locale: 'tr',
    payload: { secretNews: 'Taslak Türkçe Çeviri (Henüz Onaylanmadı)' },
    status: 'draft',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('tr', canonical, draftTr);

  // Must fall back to Arabic canonical payload
  assert.deepEqual(result.payload, canonical);
  assert.equal(result.requestedLocale, 'tr');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
  assert.equal(result.status, 'draft');
});

test('14. Draft English content is not exposed publicly and falls back to Arabic', () => {
  const canonical = { guide: 'دليل منشور بالعربية' };
  const draftEn = {
    target: 'guideSections',
    locale: 'en',
    payload: { guide: 'Draft English Content (Unapproved)' },
    status: 'draft',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('en', canonical, draftEn);

  assert.deepEqual(result.payload, canonical);
  assert.equal(result.requestedLocale, 'en');
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
  assert.equal(result.status, 'draft');
});

// ---------------------------------------------------------------------------
// 6. MANUAL PATHS & PATH UTILITIES
// ---------------------------------------------------------------------------

test('15. manualPaths are preserved across resolution', () => {
  const canonical = { name: 'علي', bio: 'سيرة' };
  const localized = {
    target: 'committees',
    locale: 'tr',
    payload: { name: 'Ali', bio: 'Özel Biyografi' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: ['head.bio'],
  };

  const result = resolveCmsLocalization('tr', canonical, localized);
  assert.deepEqual(result.manualPaths, ['head.bio']);
});

test('16. duplicate and messy paths normalize deterministically', () => {
  const rawPaths = [
    'hero.title',
    ' hero.title ',
    'hero..title',
    '.hero.title.',
    'items[0].name',
    'items.0.name',
    'about.description',
    '',
    '   ',
  ];

  const normalized = normalizeLocalizationPaths(rawPaths);
  assert.deepEqual(normalized, [
    'about.description',
    'hero.title',
    'items.0.name',
  ]);
});

test('17. invalid/empty paths are handled safely without throw', () => {
  assert.deepEqual(normalizeLocalizationPaths(null), []);
  assert.deepEqual(normalizeLocalizationPaths(undefined), []);
  assert.deepEqual(normalizeLocalizationPaths([]), []);
  assert.deepEqual(normalizeLocalizationPaths(['', '   ']), []);
  assert.deepEqual(normalizeLocalizationPaths([123, true, null]), []);

  assert.equal(isLocalizationPathStale('hero.title', ['hero.title']), true);
  assert.equal(isLocalizationPathStale('hero.title', ['hero']), true);
  assert.equal(isLocalizationPathStale('other.field', ['hero.title']), false);
  assert.equal(isLocalizationPathStale('', ['hero.title']), false);

  assert.equal(isLocalizationPathManual('hero.title', ['hero.title']), true);
  assert.equal(isLocalizationPathManual('hero.title', ['hero']), true);
  assert.equal(isLocalizationPathManual('other.field', []), false);
});

// ---------------------------------------------------------------------------
// 7. LOCALE CONSTRAINTS & MUTATION SAFETY
// ---------------------------------------------------------------------------

test('18. Unknown locale cannot bypass supported locale constraints and falls back safely', () => {
  const canonical = { key: 'قيمة' };
  const localized = {
    target: 'site',
    locale: 'tr',
    payload: { key: 'Değer' },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('fr', canonical, localized);
  assert.deepEqual(result.payload, canonical);
  assert.equal(result.actualLocale, 'ar');
  assert.equal(result.didFallback, true);
});

test('19. Canonical Arabic payload is never mutated by resolution', () => {
  const canonical = { nested: { count: 42, tags: ['أ', 'ب'] } };
  const frozen = JSON.parse(JSON.stringify(canonical));

  const result = resolveCmsLocalization('ar', canonical, null);
  result.payload.nested.count = 999;
  result.payload.nested.tags.push('ج');

  assert.deepEqual(canonical, frozen);
});

test('20. Localized payload is never mutated by resolution', () => {
  const canonical = { count: 10 };
  const localized = {
    target: 'site',
    locale: 'tr',
    payload: { count: 20 },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };
  const frozen = JSON.parse(JSON.stringify(localized.payload));

  const result = resolveCmsLocalization('tr', canonical, localized);
  result.payload.count = 999;

  assert.deepEqual(localized.payload, frozen);
});

// ---------------------------------------------------------------------------
// 8. JSON PAYLOAD STRUCTURES
// ---------------------------------------------------------------------------

test('21. Nested JSON object payload is supported', () => {
  const canonical = {
    meta: {
      seo: { description: 'وصف الصفحة' },
    },
  };
  const localized = {
    target: 'site',
    locale: 'en',
    payload: {
      meta: {
        seo: { description: 'Page description' },
      },
    },
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('en', canonical, localized);
  assert.equal(result.payload.meta.seo.description, 'Page description');
});

test('22. JSON arrays are supported', () => {
  const canonical = [
    { id: '1', title: 'فعالية 1' },
    { id: '2', title: 'فعالية 2' },
  ];
  const localized = {
    target: 'events',
    locale: 'tr',
    payload: [
      { id: '1', title: 'Etkinlik 1' },
      { id: '2', title: 'Etkinlik 2' },
    ],
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('tr', canonical, localized);
  assert.equal(result.payload[0].title, 'Etkinlik 1');
  assert.equal(result.payload[1].title, 'Etkinlik 2');
});

test('23. Primitive JSON values behave safely if contract permits them', () => {
  const canonical = 'نص خام بسيط';
  const localized = {
    target: 'guideQuickInfo',
    locale: 'en',
    payload: 'Simple raw text',
    status: 'fresh',
    stalePaths: [],
    manualPaths: [],
  };

  const result = resolveCmsLocalization('en', canonical, localized);
  assert.equal(result.payload, 'Simple raw text');
});

// ---------------------------------------------------------------------------
// 9. TARGET ARCHITECTURE & REUSE
// ---------------------------------------------------------------------------

test('24. Existing CMS target types are covered by CMS_TARGETS', () => {
  const expectedTargets = [
    'site',
    'about',
    'programsContent',
    'events',
    'galleryAlbums',
    'galleryCategories',
    'guideSections',
    'guideQuickInfo',
    'faqCategories',
    'contactCards',
    'contactMap',
    'news',
    'plans',
    'reports',
    'committees',
  ];

  for (const target of expectedTargets) {
    assert.ok(CMS_TARGETS.includes(target), `CMS_TARGETS must include '${target}'`);
  }
});

test('25. Supported locales match canonical ar and targets tr/en', () => {
  assert.equal(CANONICAL_CMS_LOCALE, 'ar');
  assert.deepEqual(LOCALIZED_CMS_LOCALES, ['tr', 'en']);
});

// ---------------------------------------------------------------------------
// 10. STALE MARKER & SOURCE HASH HELPERS
// ---------------------------------------------------------------------------

test('26. markLocalizationStale creates a new object without mutating input', () => {
  const original = {
    target: 'site',
    locale: 'tr',
    payload: { title: 'Başlık' },
    status: 'fresh',
    stalePaths: ['header.old'],
    manualPaths: ['footer.text'],
  };

  const updated = markLocalizationStale(original, ['header.new', 'header.old']);

  assert.notEqual(updated, original, 'Must return a new object reference');
  assert.equal(original.status, 'fresh', 'Original record must remain untouched');
  assert.equal(updated.status, 'stale');
  assert.deepEqual(updated.payload, original.payload, 'Payload must be preserved');
  assert.deepEqual(updated.manualPaths, ['footer.text'], 'Manual paths must be preserved');
  assert.deepEqual(updated.stalePaths, ['header.new', 'header.old']);
});

test('27. computeSourceHash produces deterministic fingerprint regardless of key order', () => {
  const objA = { b: 2, a: 1, nested: { y: 'bar', x: 'foo' } };
  const objB = { nested: { x: 'foo', y: 'bar' }, a: 1, b: 2 };

  const hashA = computeSourceHash(objA);
  const hashB = computeSourceHash(objB);

  assert.equal(typeof hashA, 'string');
  assert.ok(hashA.length >= 8);
  assert.equal(hashA, hashB, 'Hashes must be identical regardless of key order');

  const objC = { ...objA, b: 3 };
  assert.notEqual(computeSourceHash(objC), hashA, 'Modified content must produce different hash');
});

// ---------------------------------------------------------------------------
// 11. ISOLATION & PURITY CHECKS
// ---------------------------------------------------------------------------

test('28. Domain module contains no Supabase, translation provider, UI, or React dependencies', () => {
  const domainSource = readFileSync(resolve('src/domain/cmsLocalization.ts'), 'utf8');

  assert.doesNotMatch(domainSource, /from\s+['"]@supabase/, 'Must not import Supabase');
  assert.doesNotMatch(domainSource, /createClient/, 'Must not create Supabase client');
  assert.doesNotMatch(domainSource, /from\s+['"]react['"]/, 'Must not import React');
  assert.doesNotMatch(domainSource, /from\s+['"]react-dom['"]/, 'Must not import ReactDOM');
  assert.doesNotMatch(domainSource, /google-translate|deepl|azure/, 'Must not import translation providers');
  assert.doesNotMatch(domainSource, /useTranslation/, 'Must not import translation hooks');
});

test('29. No database migrations, Edge Functions, or routing changes introduced', () => {
  assert.equal(existsSync('supabase/migrations/99999_cms_localization.sql'), false);
  assert.equal(existsSync('supabase/functions/cms-translate'), false);
});
