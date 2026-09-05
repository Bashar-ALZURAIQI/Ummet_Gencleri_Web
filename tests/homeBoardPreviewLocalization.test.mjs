import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

function makeT(dict) {
  return (key, fallback) => {
    const parts = key.split('.');
    let cur = dict;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return fallback ?? key;
      cur = cur[p];
    }
    return typeof cur === 'string' ? cur : (fallback ?? key);
  };
}

test('1. HomePage imports getExecutiveSectionLabel from executivePresentation', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(
    home,
    /import\s*\{[^}]*getExecutiveSectionLabel[^}]*\}\s*from\s*['"]\.\.\/domain\/executivePresentation['"]/,
    'HomePage must import getExecutiveSectionLabel from executivePresentation',
  );
});

test('2. Full preview card name uses getExecutiveSectionLabel(cid, t)', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(
    home,
    /getExecutiveSectionLabel\(\s*cid\s*,\s*t\s*\)/,
    'HomePage Board Preview must render full name using getExecutiveSectionLabel(cid, t)',
  );
  assert.doesNotMatch(
    home,
    /\{meta\.name\}/,
    'HomePage Board Preview must NOT display meta.name directly',
  );
});

test('3. Short preview card name uses getExecutiveSectionLabel(cid, t, "short")', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(
    home,
    /getExecutiveSectionLabel\(\s*cid\s*,\s*t\s*,\s*['"]short['"]\s*\)/,
    'HomePage Board Preview must render short name using getExecutiveSectionLabel(cid, t, "short")',
  );
  assert.doesNotMatch(
    home,
    /\{meta\.shortName\}/,
    'HomePage Board Preview must NOT display meta.shortName directly',
  );
});

test('4. presidency full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('presidency', makeT(ar)), 'رئاسة الاتحاد');
  assert.equal(getExecutiveSectionLabel('presidency', makeT(ar), 'short'), 'الرئاسة');

  // TR
  assert.equal(getExecutiveSectionLabel('presidency', makeT(tr)), 'Birlik Başkanlığı');
  assert.equal(getExecutiveSectionLabel('presidency', makeT(tr), 'short'), 'Başkanlık');

  // EN
  assert.equal(getExecutiveSectionLabel('presidency', makeT(en)), 'Union Presidency');
  assert.equal(getExecutiveSectionLabel('presidency', makeT(en), 'short'), 'Presidency');
});

test('5. vice-presidency full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(ar)), 'نائب الرئيس');
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(ar), 'short'), 'النائب');

  // TR
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(tr)), 'Başkan Yardımcılığı');
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(tr), 'short'), 'Yardımcı');

  // EN
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(en)), 'Vice Presidency');
  assert.equal(getExecutiveSectionLabel('vice-presidency', makeT(en), 'short'), 'Vice Presidency');
});

test('6. media full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('media', makeT(ar)), 'اللجنة الإعلامية');
  assert.equal(getExecutiveSectionLabel('media', makeT(ar), 'short'), 'الإعلام');

  // TR
  assert.equal(getExecutiveSectionLabel('media', makeT(tr)), 'Medya Komitesi');
  assert.equal(getExecutiveSectionLabel('media', makeT(tr), 'short'), 'Medya');

  // EN
  assert.equal(getExecutiveSectionLabel('media', makeT(en)), 'Media Committee');
  assert.equal(getExecutiveSectionLabel('media', makeT(en), 'short'), 'Media');
});

test('7. academic full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('academic', makeT(ar)), 'اللجنة الأكاديمية');
  assert.equal(getExecutiveSectionLabel('academic', makeT(ar), 'short'), 'الأكاديمية');

  // TR
  assert.equal(getExecutiveSectionLabel('academic', makeT(tr)), 'Akademik Komite');
  assert.equal(getExecutiveSectionLabel('academic', makeT(tr), 'short'), 'Akademik');

  // EN
  assert.equal(getExecutiveSectionLabel('academic', makeT(en)), 'Academic Committee');
  assert.equal(getExecutiveSectionLabel('academic', makeT(en), 'short'), 'Academic');
});

test('8. supervisory full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(ar)), 'اللجنة الرقابية');
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(ar), 'short'), 'الرقابة');

  // TR
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(tr)), 'Denetim Komitesi');
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(tr), 'short'), 'Denetim');

  // EN
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(en)), 'Oversight Committee');
  assert.equal(getExecutiveSectionLabel('supervisory', makeT(en), 'short'), 'Oversight');
});

test('9. activities full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('activities', makeT(ar)), 'لجنة الأنشطة');
  assert.equal(getExecutiveSectionLabel('activities', makeT(ar), 'short'), 'الأنشطة');

  // TR
  assert.equal(getExecutiveSectionLabel('activities', makeT(tr)), 'Etkinlikler Komitesi');
  assert.equal(getExecutiveSectionLabel('activities', makeT(tr), 'short'), 'Etkinlikler');

  // EN
  assert.equal(getExecutiveSectionLabel('activities', makeT(en)), 'Activities Committee');
  assert.equal(getExecutiveSectionLabel('activities', makeT(en), 'short'), 'Activities');
});

test('10. finance full/short resolve by locale (AR/TR/EN)', async () => {
  const ar = (await import('../src/i18n/locales/ar.ts')).default;
  const tr = (await import('../src/i18n/locales/tr.ts')).default;
  const en = (await import('../src/i18n/locales/en.ts')).default;
  const { getExecutiveSectionLabel } = await import('../src/domain/executivePresentation.ts');

  // AR
  assert.equal(getExecutiveSectionLabel('finance', makeT(ar)), 'اللجنة المالية');
  assert.equal(getExecutiveSectionLabel('finance', makeT(ar), 'short'), 'المالية');

  // TR
  assert.equal(getExecutiveSectionLabel('finance', makeT(tr)), 'Mali Komite');
  assert.equal(getExecutiveSectionLabel('finance', makeT(tr), 'short'), 'Maliye');

  // EN
  assert.equal(getExecutiveSectionLabel('finance', makeT(en)), 'Finance Committee');
  assert.equal(getExecutiveSectionLabel('finance', makeT(en), 'short'), 'Finance');
});

test('11. committeeMeta ID, color, and navigation behavior remain intact', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /onClick=\{\(\) => setView\(\{ kind: 'committee', committeeId: cid \}\)\}/);
  assert.match(home, /\$\{meta\.color\}/);

  const { committeeMeta } = await import('../src/data/mockData.ts');
  assert.ok(committeeMeta.presidency.color);
  assert.ok(committeeMeta['vice-presidency'].color);
  assert.ok(committeeMeta.media.color);
  assert.ok(committeeMeta.academic.color);
  assert.ok(committeeMeta.supervisory.color);
  assert.ok(committeeMeta.activities.color);
  assert.ok(committeeMeta.finance.color);
});

test('12. boardPreview.title remains dynamic/raw CMS content', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /currentValue=\{sc\.boardPreview\.title\}/);
  assert.match(home, />\{sc\.boardPreview\.title\}<\/EditableField>/);
});

test('13. boardPreview.subtitle remains dynamic/raw CMS content', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /currentValue=\{sc\.boardPreview\.subtitle\}/);
  assert.match(home, />\{sc\.boardPreview\.subtitle\}<\/EditableField>/);
});

test('14. boardPreview.description remains dynamic/raw CMS content', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /currentValue=\{sc\.boardPreview\.description\}/);
  assert.match(home, />\{sc\.boardPreview\.description\}<\/EditableField>/);
});
