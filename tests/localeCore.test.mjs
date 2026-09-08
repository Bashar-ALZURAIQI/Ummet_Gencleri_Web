import test from 'node:test';
import assert from 'node:assert/strict';

const {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALE_CONFIG,
  isSupportedLocale,
  resolveInitialLocale,
  persistLocalePreference,
  readPersistedLocalePreference,
  getLocaleDirection,
  applyDocumentLocale,
} = await import('../src/domain/locale.ts');

function createMockStorage(initialData = {}, options = {}) {
  const store = { ...initialData };
  return {
    getItem(key) {
      if (options.throwOnGet) {
        throw new Error('Storage getItem failed');
      }
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      if (options.throwOnSet) {
        throw new Error('Storage setItem failed');
      }
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },
    _raw: store,
  };
}

function createMockDocument(initialLang = '', initialDir = '') {
  return {
    documentElement: {
      lang: initialLang,
      dir: initialDir,
      setAttribute(name, value) {
        if (name === 'lang') this.lang = value;
        if (name === 'dir') this.dir = value;
      },
    },
  };
}

test('constants and metadata configuration', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['ar', 'tr', 'en']);
  assert.equal(DEFAULT_LOCALE, 'ar');
  assert.equal(LOCALE_STORAGE_KEY, 'ummet_locale');

  assert.equal(LOCALE_CONFIG.ar.direction, 'rtl');
  assert.equal(LOCALE_CONFIG.tr.direction, 'ltr');
  assert.equal(LOCALE_CONFIG.en.direction, 'ltr');
});

test('isSupportedLocale validation and rejection of invalid values', () => {
  // supported values
  assert.equal(isSupportedLocale('ar'), true);
  assert.equal(isSupportedLocale('tr'), true);
  assert.equal(isSupportedLocale('en'), true);

  // unsupported/invalid values
  assert.equal(isSupportedLocale('fr'), false);
  assert.equal(isSupportedLocale('de'), false);
  assert.equal(isSupportedLocale(''), false);
  assert.equal(isSupportedLocale(null), false);
  assert.equal(isSupportedLocale(undefined), false);
  assert.equal(isSupportedLocale(123), false);
  assert.equal(isSupportedLocale({}), false);
  assert.equal(isSupportedLocale(['ar']), false);
});

test('resolveInitialLocale: 1. saved ar wins', () => {
  assert.equal(resolveInitialLocale('ar', ['tr-TR', 'en-US']), 'ar');
});

test('resolveInitialLocale: 2. saved tr wins', () => {
  assert.equal(resolveInitialLocale('tr', ['en-US', 'ar-SA']), 'tr');
});

test('resolveInitialLocale: 3. saved en wins', () => {
  assert.equal(resolveInitialLocale('en', ['ar-SA', 'tr-TR']), 'en');
});

test('resolveInitialLocale: 4. invalid saved locale falls through to browser', () => {
  // invalid saved 'fr' falls through to 'tr'
  assert.equal(resolveInitialLocale('fr', ['tr-TR']), 'tr');

  // invalid saved 'garbage' falls through to 'en'
  assert.equal(resolveInitialLocale('garbage', ['en-US']), 'en');

  // null or empty saved falls through to browser
  assert.equal(resolveInitialLocale(null, ['tr-TR']), 'tr');
  assert.equal(resolveInitialLocale('', ['en-US']), 'en');
});

test('resolveInitialLocale: 5. browser ar-SA resolves to ar', () => {
  assert.equal(resolveInitialLocale(null, ['ar-SA']), 'ar');
});

test('resolveInitialLocale: 6. browser tr-TR resolves to tr', () => {
  assert.equal(resolveInitialLocale(null, ['tr-TR']), 'tr');
});

test('resolveInitialLocale: 7. browser en-US resolves to en', () => {
  assert.equal(resolveInitialLocale(null, ['en-US']), 'en');
  assert.equal(resolveInitialLocale(null, ['en-GB']), 'en');
});

test('resolveInitialLocale: 8. first supported browser language wins', () => {
  // unsupported 'fr-FR' skipped, 'tr-TR' wins
  assert.equal(resolveInitialLocale(null, ['fr-FR', 'tr-TR', 'en-US']), 'tr');

  // multiple unsupported skipped until first supported
  assert.equal(resolveInitialLocale(null, ['de-DE', 'es-ES', 'en-GB']), 'en');
});

test('resolveInitialLocale: 9. unsupported/empty browser languages -> ar fallback', () => {
  // unsupported list
  assert.equal(resolveInitialLocale(null, ['fr-FR', 'de-DE', 'zh-CN']), 'ar');

  // empty array
  assert.equal(resolveInitialLocale(null, []), 'ar');

  // array with non-string values
  assert.equal(resolveInitialLocale(null, [null, undefined, 123]), 'ar');
});

test('persistLocalePreference: 12. stores under ummet_locale', () => {
  const storage = createMockStorage();

  persistLocalePreference('tr', storage);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'tr');

  persistLocalePreference('en', storage);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'en');

  persistLocalePreference('ar', storage);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'ar');
});

test('persistLocalePreference: ignores invalid locale without overwriting or throwing', () => {
  const storage = createMockStorage();
  persistLocalePreference('tr', storage);

  persistLocalePreference('fr', storage);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'tr');

  persistLocalePreference(null, storage);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'tr');
});

test('readPersistedLocalePreference: 13. returns valid stored locale', () => {
  const storage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'tr' });
  assert.equal(readPersistedLocalePreference(storage), 'tr');

  const arStorage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'ar' });
  assert.equal(readPersistedLocalePreference(arStorage), 'ar');

  const enStorage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'en' });
  assert.equal(readPersistedLocalePreference(enStorage), 'en');
});

test('readPersistedLocalePreference: 14. invalid stored value returns null', () => {
  const emptyStorage = createMockStorage();
  assert.equal(readPersistedLocalePreference(emptyStorage), null);

  const invalidStorage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'unsupported' });
  assert.equal(readPersistedLocalePreference(invalidStorage), null);

  const garbageStorage = createMockStorage({ [LOCALE_STORAGE_KEY]: '123' });
  assert.equal(readPersistedLocalePreference(garbageStorage), null);
});

test('storage resilience: 15. storage read failure does not throw', () => {
  const failingStorage = createMockStorage({}, { throwOnGet: true });

  let result;
  assert.doesNotThrow(() => {
    result = readPersistedLocalePreference(failingStorage);
  });
  assert.equal(result, null);
});

test('storage resilience: 16. storage write failure does not crash', () => {
  const failingStorage = createMockStorage({}, { throwOnSet: true });

  assert.doesNotThrow(() => {
    persistLocalePreference('tr', failingStorage);
  });
});

test('getLocaleDirection: 17. ar -> rtl, tr -> ltr, en -> ltr', () => {
  assert.equal(getLocaleDirection('ar'), 'rtl');
  assert.equal(getLocaleDirection('tr'), 'ltr');
  assert.equal(getLocaleDirection('en'), 'ltr');
});

test('applyDocumentLocale: 18. sets html lang and html dir', () => {
  const doc = createMockDocument();

  applyDocumentLocale('ar', doc);
  assert.equal(doc.documentElement.lang, 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');

  applyDocumentLocale('tr', doc);
  assert.equal(doc.documentElement.lang, 'tr');
  assert.equal(doc.documentElement.dir, 'ltr');

  applyDocumentLocale('en', doc);
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.documentElement.dir, 'ltr');
});

test('applyDocumentLocale: handles missing or incomplete document gracefully', () => {
  assert.doesNotThrow(() => {
    applyDocumentLocale('ar', null);
  });
  assert.doesNotThrow(() => {
    applyDocumentLocale('tr', {});
  });
});
