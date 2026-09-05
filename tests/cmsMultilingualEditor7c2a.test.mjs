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
