import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

// Issue 1 regression tests:
// The <html dir> attribute flips ar -> rtl / tr,en -> ltr, so homepage layouts must
// respond to the writing direction. Hard-coded physical utilities (text-right, mr-auto,
// ArrowLeft/ChevronLeft, bg-gradient-to-l) do NOT respond to dir and must be replaced by
// logical properties or direction-aware variants.

test('Issue 1.1: HomePage hero text alignment follows the writing direction (text-start/end), never frozen to a physical side', async () => {
  const home = await read('src/pages/HomePage.tsx');

  // Text alignment must follow the written direction: start-aligned universally so the
  // section reads from the correct side in both rtl (ar) and ltr (tr/en)
  assert.match(home, /lg:text-start/);
  assert.doesNotMatch(home, /lg:text-end/);
  assert.doesNotMatch(home, /lg:text-right/);
  assert.doesNotMatch(home, /lg:text-left/);
  assert.doesNotMatch(home, /className="[^"]*\btext-right\b[^"]*"/);

  // Responsive width constraint removed on large screens must stay symmetric
  assert.match(home, /lg:mx-0/);
});

test('Issue 1.2: HomePage CTA/card spacing uses logical margins (ms-auto), not physical mr-auto', async () => {
  const home = await read('src/pages/HomePage.tsx');

  assert.match(home, /\bms-auto\b/);
  assert.doesNotMatch(home, /\bmr-auto\b/);
});

test('Issue 1.3: HomePage forward/back chevrons flip with the writing direction', async () => {
  const home = await read('src/pages/HomePage.tsx');

  // Every directional chevron must carry the rtl rotation so it points forward in both
  // directions (matching the CommitteePage rtl:rotate-0 ltr:rotate-180 convention).
  const chevrons = home.match(/<ChevronLeft[\s\S]*?\/>/g) ?? [];
  assert.ok(chevrons.length >= 3, `expected at least 3 ChevronLeft usages, got ${chevrons.length}`);
  for (const usage of chevrons) {
    assert.match(usage, /react-rtl-rotate|rtl:rotate-180|ltr:rotate-180/,
      `ChevronLeft usage lacks a direction-aware rotation: ${usage}`);
  }
});

test('Issue 1.4: HomePage hero CTA arrow flips with the writing direction', async () => {
  const home = await read('src/pages/HomePage.tsx');

  const arrows = home.match(/<ArrowLeft[\s\S]*?\/>/g) ?? [];
  assert.ok(arrows.length >= 1, 'expected at least one ArrowLeft usage in the hero CTA');
  for (const usage of arrows) {
    assert.match(usage, /react-rtl-rotate|rtl:rotate-180|ltr:rotate-180/,
      `ArrowLeft usage lacks a direction-aware rotation: ${usage}`);
  }
});

test('Issue 1.5: HomePage decorative gradients are direction-aware', async () => {
  const home = await read('src/pages/HomePage.tsx');

  // Every bg-gradient-to-l must be paired with a logical-to-r RTL variant so the accent
  // gradient always reads toward the end of the line.
  const gradients = home.match(/className="[^"]*bg-gradient-to-l[^"]*"/g) ?? [];
  assert.ok(gradients.length >= 3, `expected at least 3 gradient usages, got ${gradients.length}`);
  for (const usage of gradients) {
    assert.match(usage, /rtl:bg-gradient-to-r/,
      `bg-gradient-to-l usage lacks an rtl:bg-gradient-to-r variant: ${usage}`);
  }
});

test('Issue 1.6: HomePage language direction resolves correctly at runtime', async () => {
  const { i18n } = await import('../src/i18n/config.ts');
  const { getLocaleDirection } = await import('../src/domain/locale.ts');

  assert.equal(getLocaleDirection('ar'), 'rtl');
  assert.equal(getLocaleDirection('tr'), 'ltr');
  assert.equal(getLocaleDirection('en'), 'ltr');

  await i18n.changeLanguage('ar');
  assert.equal(i18n.dir(), 'rtl');

  await i18n.changeLanguage('tr');
  assert.equal(i18n.dir(), 'ltr');

  await i18n.changeLanguage('en');
  assert.equal(i18n.dir(), 'ltr');
});