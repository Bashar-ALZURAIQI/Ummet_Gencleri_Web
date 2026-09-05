import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTranslatableLocationValue,
  deriveFieldLocalizationState,
  recordManualPath,
} from '../src/domain/cmsLocalizationEditor.ts';

import ar from '../src/i18n/locales/ar.ts';
import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

// ---------------------------------------------------------------------------
// 1. Location Value Safety Tests
// ---------------------------------------------------------------------------

test('1. Human-language location returns translatable eligibility (true)', () => {
  assert.equal(isTranslatableLocationValue('قاعة المؤتمرات - جامعة أتاتورك'), true);
  assert.equal(isTranslatableLocationValue('Main Conference Hall, Floor 2'), true);
  assert.equal(isTranslatableLocationValue('Atatürk Kültür Merkezi'), true);
  assert.equal(isTranslatableLocationValue('مركز الشباب - مبنى أ'), true);
});

test('2. Human text with periods/punctuation is not misclassified as a URL', () => {
  assert.equal(isTranslatableLocationValue('قاعة د. أحمد زويل'), true);
  assert.equal(isTranslatableLocationValue('Building A.2, Room 101'), true);
  assert.equal(isTranslatableLocationValue('Atatürk Cad. No: 45'), true);
});

test('3. HTTPS and HTTP URLs return non-translatable (false)', () => {
  assert.equal(isTranslatableLocationValue('https://maps.google.com/?q=41.0,28.9'), false);
  assert.equal(isTranslatableLocationValue('https://goo.gl/maps/xyz123'), false);
  assert.equal(isTranslatableLocationValue('http://maps.apple.com/?ll=41.0,28.9'), false);
  assert.equal(isTranslatableLocationValue('http://example.com/location'), false);
});

test('4. www links and custom map schemes return non-translatable (false)', () => {
  assert.equal(isTranslatableLocationValue('www.google.com/maps'), false);
  assert.equal(isTranslatableLocationValue('geo:41.0082,28.9784'), false);
  assert.equal(isTranslatableLocationValue('maps:q=istanbul'), false);
  assert.equal(isTranslatableLocationValue('ftp://files.example.com/map.pdf'), false);
});

test('5. mailto and tel URIs return non-translatable (false)', () => {
  assert.equal(isTranslatableLocationValue('mailto:info@ummetgencleri.org'), false);
  assert.equal(isTranslatableLocationValue('tel:+905551234567'), false);
});

test('6. Geographic coordinate pairs return non-translatable (false)', () => {
  assert.equal(isTranslatableLocationValue('41.0082, 28.9784'), false);
  assert.equal(isTranslatableLocationValue('-41.2, 28.9'), false);
  assert.equal(isTranslatableLocationValue('41.0082,28.9784'), false);
});

test('7. Empty strings, whitespace, and non-string types return non-translatable (false)', () => {
  assert.equal(isTranslatableLocationValue(''), false);
  assert.equal(isTranslatableLocationValue('   \t\n  '), false);
  assert.equal(isTranslatableLocationValue(null), false);
  assert.equal(isTranslatableLocationValue(undefined), false);
  assert.equal(isTranslatableLocationValue(12345), false);
  assert.equal(isTranslatableLocationValue({}), false);
  assert.equal(isTranslatableLocationValue([]), false);
});

// ---------------------------------------------------------------------------
// 2. Field Localization State Derivation Tests
// ---------------------------------------------------------------------------

test('8. Missing localization record derives status="missing", isStale=false, isManual=false', () => {
  const stateNull = deriveFieldLocalizationState('title', null);
  assert.deepEqual(stateNull, {
    status: 'missing',
    isStale: false,
    isManual: false,
    value: '',
  });

  const stateUndefined = deriveFieldLocalizationState('description', undefined);
  assert.deepEqual(stateUndefined, {
    status: 'missing',
    isStale: false,
    isManual: false,
    value: '',
  });

  const stateRecordMissing = deriveFieldLocalizationState('title', {
    target: 'events',
    locale: 'tr',
    payload: {},
    status: 'missing',
  });
  assert.deepEqual(stateRecordMissing, {
    status: 'missing',
    isStale: false,
    isManual: false,
    value: '',
  });
});

test('9. Draft localization record derives status="draft", isStale=false', () => {
  const record = {
    target: 'events',
    locale: 'tr',
    payload: { title: 'Taslak Etkinlik Başlığı' },
    status: 'draft',
    manualPaths: ['title'],
  };

  const state = deriveFieldLocalizationState('title', record);
  assert.deepEqual(state, {
    status: 'draft',
    isStale: false,
    isManual: true,
    value: 'Taslak Etkinlik Başlığı',
  });
});

test('10. Fresh published localization record derives status="fresh", isStale=false', () => {
  const record = {
    target: 'site',
    locale: 'en',
    payload: {
      hero: {
        title: 'Fresh English Title',
      },
    },
    status: 'fresh',
  };

  const state = deriveFieldLocalizationState('hero.title', record);
  assert.deepEqual(state, {
    status: 'fresh',
    isStale: false,
    isManual: false,
    value: 'Fresh English Title',
  });
});

test('11. Stale localization record derives isStale=true for affected paths', () => {
  const record = {
    target: 'site',
    locale: 'tr',
    payload: {
      hero: {
        title: 'Eski Başlık',
        description: 'Eski Açıklama',
      },
    },
    status: 'stale',
    stalePaths: ['hero.title'],
  };

  const titleState = deriveFieldLocalizationState('hero.title', record);
  assert.equal(titleState.status, 'stale');
  assert.equal(titleState.isStale, true);
  assert.equal(titleState.value, 'Eski Başlık');

  // Ancestor stale path makes descendants stale
  const ancestorRecord = {
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Başlık' } },
    status: 'stale',
    stalePaths: ['hero'],
  };
  const descState = deriveFieldLocalizationState('hero.title', ancestorRecord);
  assert.equal(descState.isStale, true);
});

test('12. Direct string payload is extracted properly for single-field targets', () => {
  const record = {
    target: 'site',
    locale: 'tr',
    payload: 'Tek Satırlık Doğrudan Değer',
    status: 'fresh',
  };

  const state = deriveFieldLocalizationState('hero.title', record);
  assert.equal(state.value, 'Tek Satırlık Doğrudan Değer');
});

// ---------------------------------------------------------------------------
// 3. Manual Path Tracking Tests
// ---------------------------------------------------------------------------

test('13. recordManualPath appends edited path to manualPaths array', () => {
  const initial = ['title'];
  const updated = recordManualPath(initial, 'description');

  assert.deepEqual(updated, ['description', 'title']);
});

test('14. recordManualPath deduplicates repeated edits to same path', () => {
  const initial = ['title'];
  const updated = recordManualPath(initial, 'title');

  assert.deepEqual(updated, ['title']);
});

test('15. recordManualPath normalizes bracket syntax and whitespace', () => {
  const initial = ['items[0].heading'];
  const updated = recordManualPath(initial, '  items[1].heading  ');

  assert.deepEqual(updated, ['items.0.heading', 'items.1.heading']);
});

test('16. recordManualPath does not mutate the original input array (pure)', () => {
  const initial = Object.freeze(['title']);
  const updated = recordManualPath(initial, 'location');

  assert.deepEqual(initial, ['title']);
  assert.deepEqual(updated, ['location', 'title']);
});

test('17. recordManualPath handles undefined and empty inputs safely', () => {
  assert.deepEqual(recordManualPath(undefined, 'title'), ['title']);
  assert.deepEqual(recordManualPath(null, 'title'), ['title']);
  assert.deepEqual(recordManualPath(['title'], '   '), ['title']);
});

// ---------------------------------------------------------------------------
// 4. I18n Dictionary Parity Tests
// ---------------------------------------------------------------------------

test('18. ar, tr, and en locale files have matching cmsLocalization dictionary keys', () => {
  assert.ok(ar.cmsLocalization, 'ar.cmsLocalization must be defined');
  assert.ok(tr.cmsLocalization, 'tr.cmsLocalization must be defined');
  assert.ok(en.cmsLocalization, 'en.cmsLocalization must be defined');

  // Verify exact key parity for status keys
  assert.deepEqual(
    Object.keys(ar.cmsLocalization.status).sort(),
    ['draft', 'fresh', 'missing', 'stale'],
  );
  assert.deepEqual(
    Object.keys(tr.cmsLocalization.status).sort(),
    ['draft', 'fresh', 'missing', 'stale'],
  );
  assert.deepEqual(
    Object.keys(en.cmsLocalization.status).sort(),
    ['draft', 'fresh', 'missing', 'stale'],
  );

  // Verify top-level cmsLocalization keys
  const expectedCmsKeys = [
    'canonicalSource',
    'continueEditing',
    'discardChanges',
    'manualEditBadge',
    'needsUpdateNotice',
    'publishChanges',
    'saveDraft',
    'saveFailed',
    'saving',
    'status',
    'translations',
    'unsavedChangesWarning',
  ].sort();

  assert.deepEqual(Object.keys(ar.cmsLocalization).sort(), expectedCmsKeys);
  assert.deepEqual(Object.keys(tr.cmsLocalization).sort(), expectedCmsKeys);
  assert.deepEqual(Object.keys(en.cmsLocalization).sort(), expectedCmsKeys);
});

// ---------------------------------------------------------------------------
// 5. Component 1: TranslationStatusBadge Tests
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';

const readBadgeSource = () =>
  readFile(
    new URL('../src/components/cmsLocalization/TranslationStatusBadge.tsx', import.meta.url),
    'utf8',
  );

const readEditorSource = () =>
  readFile(
    new URL('../src/components/cmsLocalization/LocalizedFieldEditor.tsx', import.meta.url),
    'utf8',
  );

test('19. TranslationStatusBadge component exists and exports TranslationStatusBadge and Props', async () => {
  const source = await readBadgeSource();
  assert.match(source, /export\s+interface\s+TranslationStatusBadgeProps/);
  assert.match(source, /status:\s*LocalizationStatus/);
  assert.match(source, /size\?:\s*['"]sm['"]\s*\|\s*['"]md['"]/);
  assert.match(source, /className\?:\s*string/);
  assert.match(source, /export\s+function\s+TranslationStatusBadge/);
});

test('20. TranslationStatusBadge uses react-i18next and accesses cmsLocalization.status keys', async () => {
  const source = await readBadgeSource();
  assert.match(source, /useTranslation/);
  assert.match(source, /cmsLocalization\.status/);
  // Verify it does NOT hardcode raw English text
  assert.doesNotMatch(source, />\s*Fresh\s*</);
  assert.doesNotMatch(source, />\s*Stale\s*</);
  assert.doesNotMatch(source, />\s*Draft\s*</);
  assert.doesNotMatch(source, />\s*Missing\s*</);
});

test('21. TranslationStatusBadge applies correct semantic color styling for all 4 statuses', async () => {
  const source = await readBadgeSource();
  // fresh -> emerald / green styling
  assert.match(source, /fresh[\s\S]*?emerald/);
  // stale -> amber / yellow warning styling
  assert.match(source, /stale[\s\S]*?amber/);
  // draft -> sky / blue informational styling
  assert.match(source, /draft[\s\S]*?sky/);
  // missing -> gray / slate neutral styling
  assert.match(source, /missing[\s\S]*?(gray|slate)/);
});

test('22. TranslationStatusBadge supports sm and md sizes with custom className preservation', async () => {
  const source = await readBadgeSource();
  assert.match(source, /size\s*===\s*['"]sm['"]/);
  assert.match(source, /text-xs/);
  assert.match(source, /text-sm/);
  assert.match(source, /\$\{className/);
});

// ---------------------------------------------------------------------------
// 6. Component 2: LocalizedFieldEditor Tests
// ---------------------------------------------------------------------------

test('23. LocalizedFieldEditor component exists and exports LocalizedFieldEditor and Props', async () => {
  const source = await readEditorSource();
  assert.match(source, /export\s+interface\s+LocalizedFieldEditorProps/);
  assert.match(source, /target:\s*CmsTarget\s*\|\s*string/);
  assert.match(source, /locale:\s*LocalizedCmsLocale\s*\|\s*CanonicalCmsLocale/);
  assert.match(source, /path:\s*string/);
  assert.match(source, /label:\s*string/);
  assert.match(source, /value:\s*string/);
  assert.match(source, /kind\?:\s*CmsFieldKind/);
  assert.match(source, /isStale\?:\s*boolean/);
  assert.match(source, /isManual\?:\s*boolean/);
  assert.match(source, /disabled\?:\s*boolean/);
  assert.match(source, /placeholder\?:\s*string/);
  assert.match(source, /onChange:\s*\(newValue:\s*string\)\s*=>\s*void/);
  assert.match(source, /export\s+function\s+LocalizedFieldEditor/);
});

test('24. LocalizedFieldEditor enforces content-level directionality (AR rtl, TR/EN ltr)', async () => {
  const source = await readEditorSource();
  assert.match(source, /locale\s*===\s*['"]ar['"]\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]/);
  assert.match(source, /dir=\{dir\}/);
});

test('25. LocalizedFieldEditor switches between textarea and text input based on kind', async () => {
  const source = await readEditorSource();
  // Description and richText use textarea
  assert.match(source, /kind\s*===\s*['"]description['"]\s*\|\|\s*kind\s*===\s*['"]richText['"]/);
  assert.match(source, /<textarea/);
  assert.match(source, /<input/);
  assert.match(source, /type=["']text["']/);
});

test('26. LocalizedFieldEditor is controlled and propagates onChange with string value', async () => {
  const source = await readEditorSource();
  assert.match(source, /value=\{value/);
  assert.match(source, /onChange=\{\(e\)\s*=>\s*onChange\(e\.target\.value\)\}/);
  assert.match(source, /disabled=\{disabled/);
  assert.match(source, /placeholder=\{placeholder/);
});

test('27. LocalizedFieldEditor associates label with input/textarea via deterministic id', async () => {
  const source = await readEditorSource();
  assert.match(source, /htmlFor=\{/);
  assert.match(source, /id=\{/);
  assert.match(source, /<label/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('28. LocalizedFieldEditor renders stale warning border and needs-update notice when isStale is true', async () => {
  const source = await readEditorSource();
  assert.match(source, /isStale/);
  assert.match(source, /amber/);
  assert.match(source, /cmsLocalization\.needsUpdateNotice/);
});

test('29. LocalizedFieldEditor renders manual edit indicator badge when isManual is true', async () => {
  const source = await readEditorSource();
  assert.match(source, /isManual/);
  assert.match(source, /cmsLocalization\.manualEditBadge/);
});

test('30. New components contain zero Supabase imports', async () => {
  const [badgeSource, editorSource] = await Promise.all([readBadgeSource(), readEditorSource()]);
  assert.doesNotMatch(badgeSource, /@supabase/);
  assert.doesNotMatch(badgeSource, /from\s+['"].*supabase.*['"]/);
  assert.doesNotMatch(editorSource, /@supabase/);
  assert.doesNotMatch(editorSource, /from\s+['"].*supabase.*['"]/);
});
