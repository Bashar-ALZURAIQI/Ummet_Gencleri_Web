import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  } catch (error) {
    assert.fail(`${path} must exist: ${error.message}`);
  }
}

async function loadFaviconModule() {
  try {
    return await import('../src/components/DynamicFaviconSync.ts');
  } catch (error) {
    assert.fail(`DynamicFavicon helper must exist: ${error.message}`);
  }
}

function createDocumentWithNoIcon() {
  const links = [];
  let creations = 0;

  return {
    links,
    get creations() {
      return creations;
    },
    querySelector(selector) {
      assert.equal(selector, 'link[rel~="icon"]');
      return links.find((link) => link.rel.split(/\s+/).includes('icon')) ?? null;
    },
    createElement(name) {
      assert.equal(name, 'link');
      creations += 1;
      return { rel: '', href: '' };
    },
    head: {
      appendChild(link) {
        links.push(link);
        return link;
      },
    },
  };
}

test('favicon synchronization reuses one icon link and restores the safe fallback', async () => {
  const { DEFAULT_FAVICON_HREF, synchronizeFavicon } = await loadFaviconModule();
  const documentRef = createDocumentWithNoIcon();

  const created = synchronizeFavicon(documentRef, 'https://cdn.example.test/union-logo.webp');
  const reused = synchronizeFavicon(documentRef, undefined);

  assert.strictEqual(created, reused);
  assert.equal(documentRef.creations, 1);
  assert.equal(documentRef.links.length, 1);
  assert.equal(reused.rel, 'icon');
  assert.equal(reused.href, DEFAULT_FAVICON_HREF);
});

test('brand presentation wires the current logo into the navbar and app provider tree', async () => {
  const [brandMark, navbar, favicon, faviconSynchronizer, app] = await Promise.all([
    read('src/components/BrandMark.tsx'),
    read('src/components/Navbar.tsx'),
    read('src/components/DynamicFavicon.tsx'),
    read('src/components/DynamicFaviconSync.ts'),
    read('src/App.tsx'),
  ]);

  assert.match(brandMark, /logoUrl/);
  assert.match(brandMark, /logoIcon/);
  assert.match(brandMark, /alt=.*شعار/);
  assert.match(brandMark, /object-contain/);
  assert.doesNotMatch(brandMark, /bg-gradient-to-br/);
  assert.doesNotMatch(brandMark, /object-contain\s+p-1/);
  assert.match(brandMark, /onError/);
  assert.match(brandMark, /setImageFailed\(false\)/);
  assert.match(brandMark, /<Users/);

  assert.match(navbar, /<BrandMark/);
  assert.match(navbar, /logoUrl=\{siteContent\.brand\.logoUrl\}/);
  assert.match(navbar, /logoIcon=\{siteContent\.brand\.logoIcon\}/);
  assert.match(navbar, /brand\.name/);
  assert.match(navbar, /brand\.nameTr/);

  assert.match(favicon, /logoUrl/);
  assert.match(faviconSynchronizer, /link\[rel~=["']icon["']\]/);
  assert.match(faviconSynchronizer, /createElement\(['"]link['"]\)/);
  assert.match(app, /<DynamicFavicon\s*\/>/);
  assert.match(app, /<AppProvider>[\s\S]*<DynamicFavicon\s*\/>[\s\S]*<Router\s*\/>[\s\S]*<\/AppProvider>/);
});
