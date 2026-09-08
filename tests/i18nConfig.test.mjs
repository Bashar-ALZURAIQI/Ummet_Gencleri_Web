import test from 'node:test';
import assert from 'node:assert/strict';

const {
  i18n,
  createI18nInstance,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} = await import('../src/i18n/config.ts');

const { default: ar } = await import('../src/i18n/locales/ar.ts');
const { default: tr } = await import('../src/i18n/locales/tr.ts');
const { default: en } = await import('../src/i18n/locales/en.ts');
const { LOCALE_STORAGE_KEY } = await import('../src/domain/locale.ts');

function createMockStorage(initialData = {}) {
  const store = { ...initialData };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
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

function getObjectKeyPaths(obj, prefix = '') {
  let paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      paths = paths.concat(getObjectKeyPaths(value, fullPath));
    } else {
      paths.push(fullPath);
    }
  }
  return paths.sort();
}

test('1 & 2: resource dictionaries are available and expose identical namespace/key structure', () => {
  assert.ok(ar, 'ar locale must be exported');
  assert.ok(tr, 'tr locale must be exported');
  assert.ok(en, 'en locale must be exported');

  const requiredNamespaces = ['common', 'navigation', 'auth', 'dashboard', 'admin', 'cms', 'errors'];
  for (const ns of requiredNamespaces) {
    assert.ok(ar[ns], `ar must have namespace ${ns}`);
    assert.ok(tr[ns], `tr must have namespace ${ns}`);
    assert.ok(en[ns], `en must have namespace ${ns}`);
  }

  const arPaths = getObjectKeyPaths(ar);
  const trPaths = getObjectKeyPaths(tr);
  const enPaths = getObjectKeyPaths(en);

  assert.deepEqual(trPaths, arPaths, 'tr keys must exactly match ar keys');
  assert.deepEqual(enPaths, arPaths, 'en keys must exactly match ar keys');
});

test('3 & 4: fallback and supported languages configuration', () => {
  const instance = createI18nInstance();
  assert.equal(instance.options.fallbackLng?.[0] || instance.options.fallbackLng, 'ar');
  assert.deepEqual(instance.options.supportedLngs?.filter((l) => l !== 'cimode'), ['ar', 'tr', 'en']);
});

test('5: valid saved locale wins on initialization', () => {
  const storage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'tr' });
  const doc = createMockDocument();
  const instance = createI18nInstance({
    storage,
    document: doc,
    navLanguages: ['en-US'],
  });

  assert.equal(instance.language, 'tr');
  assert.equal(doc.documentElement.lang, 'tr');
  assert.equal(doc.documentElement.dir, 'ltr');
});

test('6: browser locale is used if there is no saved preference', () => {
  const storage = createMockStorage();
  const doc = createMockDocument();
  const instance = createI18nInstance({
    storage,
    document: doc,
    navLanguages: ['en-US', 'tr-TR'],
  });

  assert.equal(instance.language, 'en');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.documentElement.dir, 'ltr');
});

test('7: unsupported browser locale falls back to Arabic', () => {
  const storage = createMockStorage();
  const doc = createMockDocument();
  const instance = createI18nInstance({
    storage,
    document: doc,
    navLanguages: ['fr-FR', 'de-DE'],
  });

  assert.equal(instance.language, 'ar');
  assert.equal(doc.documentElement.lang, 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');
});

test('8, 9, 10: t() returns correct translation for ar, tr, and en', async () => {
  const instance = createI18nInstance();

  await instance.changeLanguage('ar');
  assert.equal(instance.t('common.save'), 'حفظ');
  assert.equal(instance.t('common.cancel'), 'إلغاء');
  assert.equal(instance.t('navigation.home'), 'الرئيسية');

  await instance.changeLanguage('tr');
  assert.equal(instance.t('common.save'), 'Kaydet');
  assert.equal(instance.t('common.cancel'), 'İptal');
  assert.equal(instance.t('navigation.home'), 'Ana Sayfa');

  await instance.changeLanguage('en');
  assert.equal(instance.t('common.save'), 'Save');
  assert.equal(instance.t('common.cancel'), 'Cancel');
  assert.equal(instance.t('navigation.home'), 'Home');
});

test('11, 12, 13: changing language updates document lang and dir', async () => {
  const doc = createMockDocument();
  const instance = createI18nInstance({ document: doc });

  await instance.changeLanguage('ar');
  assert.equal(doc.documentElement.lang, 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');

  await instance.changeLanguage('tr');
  assert.equal(doc.documentElement.lang, 'tr');
  assert.equal(doc.documentElement.dir, 'ltr');

  await instance.changeLanguage('en');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.documentElement.dir, 'ltr');
});

test('14: i18n initialization itself does NOT persist a manual preference', () => {
  const storage = createMockStorage();
  createI18nInstance({
    storage,
    navLanguages: ['tr-TR'],
  });

  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), null, 'Automatic detection must not be persisted');
});

test('15: unsupported locale requests cannot establish an unsupported active locale', async () => {
  const instance = createI18nInstance();
  await instance.changeLanguage('ar');

  // Attempting to change to unsupported 'fr' should not set language to 'fr'
  await instance.changeLanguage('fr');
  assert.notEqual(instance.language, 'fr');
  assert.ok(['ar', 'tr', 'en'].includes(instance.language));
});
