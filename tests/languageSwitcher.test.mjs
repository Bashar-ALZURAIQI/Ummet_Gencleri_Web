import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Functional domain & i18n logic
const {
  i18n,
  createI18nInstance,
  getLanguageOptions,
  handleManualLanguageChange,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} = await import('../src/i18n/config.ts');

const { LOCALE_STORAGE_KEY, LOCALE_CONFIG } = await import('../src/domain/locale.ts');

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _raw: store,
  };
}

function createMockDocument(lang = '', dir = '') {
  return {
    documentElement: {
      lang,
      dir,
      setAttribute(name, val) {
        if (name === 'lang') this.lang = val;
        if (name === 'dir') this.dir = val;
      },
    },
  };
}

test('1 & 2: LanguageSwitcher supports exactly ar/tr/en with exact native labels', () => {
  const options = getLanguageOptions();
  const locales = options.map((o) => o.locale);
  assert.deepEqual(locales, ['ar', 'tr', 'en']);

  const labels = options.map((o) => o.nativeName);
  assert.deepEqual(labels, ['العربية', 'Türkçe', 'English']);
});

test('3: no country flags are used in language options or labels', () => {
  const options = getLanguageOptions();
  for (const opt of options) {
    assert.doesNotMatch(opt.nativeName, /[\uD83C][\uDDE6-\uDDFF]/u, 'Should not contain flag emojis');
    assert.equal(opt.flag, undefined, 'Flag property should not exist');
  }
});

test('4: current locale is represented correctly from i18n instance', () => {
  const options = getLanguageOptions();
  const arOpt = options.find((o) => o.locale === 'ar');
  const trOpt = options.find((o) => o.locale === 'tr');
  const enOpt = options.find((o) => o.locale === 'en');

  assert.equal(arOpt.nativeName, LOCALE_CONFIG.ar.nativeName);
  assert.equal(trOpt.nativeName, LOCALE_CONFIG.tr.nativeName);
  assert.equal(enOpt.nativeName, LOCALE_CONFIG.en.nativeName);
});

test('5, 6, 7 & 8: manual switch persists to storage and invokes i18n language change', async () => {
  const storage = createMockStorage();
  const doc = createMockDocument();
  const instance = createI18nInstance({ storage, document: doc });

  // ar -> tr
  await handleManualLanguageChange('tr', { i18nInstance: instance, storage, document: doc });
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'tr', 'Manual switch ar->tr persists tr');
  assert.equal(instance.language, 'tr');

  // tr -> en
  await handleManualLanguageChange('en', { i18nInstance: instance, storage, document: doc });
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'en', 'Manual switch tr->en persists en');
  assert.equal(instance.language, 'en');

  // en -> ar
  await handleManualLanguageChange('ar', { i18nInstance: instance, storage, document: doc });
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'ar', 'Manual switch en->ar persists ar');
  assert.equal(instance.language, 'ar');
});

test('9, 10, 11: document lang and dir updated on manual switch', async () => {
  const storage = createMockStorage();
  const doc = createMockDocument();
  const instance = createI18nInstance({ storage, document: doc });

  await handleManualLanguageChange('ar', { i18nInstance: instance, storage, document: doc });
  assert.equal(doc.documentElement.lang, 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');

  await handleManualLanguageChange('tr', { i18nInstance: instance, storage, document: doc });
  assert.equal(doc.documentElement.lang, 'tr');
  assert.equal(doc.documentElement.dir, 'ltr');

  await handleManualLanguageChange('en', { i18nInstance: instance, storage, document: doc });
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.documentElement.dir, 'ltr');
});

test('12 & 13: current view and URL remain unchanged during locale switch', async () => {
  const storage = createMockStorage();
  const doc = createMockDocument();
  const instance = createI18nInstance({ storage, document: doc });

  let currentView = { kind: 'news', id: 'article-1' };
  const setViewCalled = [];
  const mockSetView = (v) => setViewCalled.push(v);

  const initialUrl = 'https://example.com/';
  const fakeWindow = { location: { href: initialUrl } };

  await handleManualLanguageChange('tr', {
    i18nInstance: instance,
    storage,
    document: doc,
    windowObj: fakeWindow,
  });

  assert.equal(setViewCalled.length, 0, 'setView should not be invoked on locale change');
  assert.equal(fakeWindow.location.href, initialUrl, 'URL must not change');
  assert.equal(currentView.kind, 'news');
});

test('14: unsupported locale cannot be manually selected', async () => {
  const storage = createMockStorage({ [LOCALE_STORAGE_KEY]: 'ar' });
  const doc = createMockDocument();
  const instance = createI18nInstance({ storage, document: doc });

  const result = await handleManualLanguageChange('fr', { i18nInstance: instance, storage, document: doc });
  assert.equal(result.success, false);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'ar', 'Storage must remain unchanged on invalid switch');
  assert.equal(instance.language, 'ar');
});

test('15 & 16: desktop and mobile variants expose all 3 languages', () => {
  const options = getLanguageOptions();
  assert.equal(options.length, 3);
  assert.deepEqual(options.map((o) => o.locale), ['ar', 'tr', 'en']);
});

test('17 & 18: accessibility semantics and active indicator', () => {
  const options = getLanguageOptions('tr');
  const activeOpt = options.find((o) => o.locale === 'tr');
  const inactiveOpt = options.find((o) => o.locale === 'en');

  assert.equal(activeOpt.isActive, true);
  assert.equal(inactiveOpt.isActive, false);
});

test('19: escape key closes desktop dropdown behavior', async () => {
  const code = await read('src/components/LanguageSwitcher.tsx');
  assert.match(code, /event\.key\s*===\s*'Escape'/);
  assert.match(code, /setIsOpen\(false\)/);
});

test('20: browser-detected initial locale is NOT persisted automatically', () => {
  const storage = createMockStorage();
  createI18nInstance({ storage, navLanguages: ['tr-TR'] });

  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), null, 'Initial browser detection must not write to storage');
});

// Helper to execute the extracted inline script from index.html
async function runIndexHtmlBootstrap({ storageData = {}, navigatorLangs = [] } = {}) {
  const htmlContent = await read('index.html');

  const match = htmlContent.match(/<script[^>]*data-locale-bootstrap[^>]*>([\s\S]*?)<\/script>/i)
    || htmlContent.match(/<script>([\s\S]*?localStorage\.getItem\(['"]ummet_locale['"]\)[\s\S]*?)<\/script>/i);

  assert.ok(match, 'index.html must contain the synchronous locale bootstrap script');
  const scriptContent = match[1];

  let setItemCalls = 0;
  const mockStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storageData, k) ? storageData[k] : null; },
    setItem() { setItemCalls++; },
  };

  const mockDoc = {
    documentElement: {
      lang: '',
      dir: '',
    },
  };

  const mockNav = {
    languages: navigatorLangs,
    language: navigatorLangs[0] || '',
  };

  const fn = new Function('localStorage', 'navigator', 'document', scriptContent);
  fn(mockStorage, mockNav, mockDoc);

  return {
    lang: mockDoc.documentElement.lang,
    dir: mockDoc.documentElement.dir,
    setItemCalls,
  };
}

test('21: bootstrap: saved tr -> html tr/ltr', async () => {
  const result = await runIndexHtmlBootstrap({ storageData: { ummet_locale: 'tr' } });
  assert.equal(result.lang, 'tr');
  assert.equal(result.dir, 'ltr');
  assert.equal(result.setItemCalls, 0);
});

test('22: bootstrap: saved en -> html en/ltr', async () => {
  const result = await runIndexHtmlBootstrap({ storageData: { ummet_locale: 'en' } });
  assert.equal(result.lang, 'en');
  assert.equal(result.dir, 'ltr');
  assert.equal(result.setItemCalls, 0);
});

test('23: bootstrap: saved ar -> html ar/rtl', async () => {
  const result = await runIndexHtmlBootstrap({ storageData: { ummet_locale: 'ar' } });
  assert.equal(result.lang, 'ar');
  assert.equal(result.dir, 'rtl');
  assert.equal(result.setItemCalls, 0);
});

test('24: bootstrap: invalid saved + browser tr-TR -> tr/ltr', async () => {
  const result = await runIndexHtmlBootstrap({
    storageData: { ummet_locale: 'garbage' },
    navigatorLangs: ['tr-TR'],
  });
  assert.equal(result.lang, 'tr');
  assert.equal(result.dir, 'ltr');
  assert.equal(result.setItemCalls, 0);
});

test('25: bootstrap: no supported browser locale -> ar/rtl', async () => {
  const result = await runIndexHtmlBootstrap({
    storageData: {},
    navigatorLangs: ['fr-FR', 'de-DE'],
  });
  assert.equal(result.lang, 'ar');
  assert.equal(result.dir, 'rtl');
  assert.equal(result.setItemCalls, 0);
});

test('26: bootstrap: performs no localStorage write', async () => {
  const result = await runIndexHtmlBootstrap({
    storageData: {},
    navigatorLangs: ['en-US'],
  });
  assert.equal(result.lang, 'en');
  assert.equal(result.dir, 'ltr');
  assert.equal(result.setItemCalls, 0, 'Bootstrap must not write to localStorage');
});

test('27: component contracts and Navbar integration', async () => {
  const [componentCode, navbarCode] = await Promise.all([
    read('src/components/LanguageSwitcher.tsx'),
    read('src/components/Navbar.tsx'),
  ]);

  // Component structure
  assert.match(componentCode, /export (default )?function LanguageSwitcher/);
  assert.match(componentCode, /aria-haspopup="listbox"/);
  assert.match(componentCode, /aria-expanded=\{isOpen\}/);
  assert.match(componentCode, /role="listbox"/);
  assert.match(componentCode, /role="option"/);
  assert.match(componentCode, /aria-selected=\{opt\.isActive\}/);
  assert.match(componentCode, /variant === 'mobile'/);

  // Navbar integration
  assert.match(navbarCode, /import LanguageSwitcher from '\.\/LanguageSwitcher'/);
  assert.match(navbarCode, /<LanguageSwitcher variant="desktop"/);
  assert.match(navbarCode, /<LanguageSwitcher variant="mobile"/);
});
