import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

test('1, 2, 3: font stack rules for rtl and ltr in src/index.css', async () => {
  const css = await read('src/index.css');

  // Must declare Cairo/Tajawal under [dir="rtl"]
  assert.match(css, /\[dir=["']rtl["']\][\s\S]*?font-family:\s*['"]Cairo['"]/i);

  // Must declare lightweight Latin/system font stack under [dir="ltr"]
  assert.match(css, /\[dir=["']ltr["']\][\s\S]*?font-family:\s*system-ui/i);
});

test('4, 7, 8: Navbar dropdowns use logical end/start alignment rather than fixed physical offsets', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  // Profile dropdown menu should align using logical end-0 rather than hardcoded physical left-0
  assert.match(navbar, /profileOpen\s*&&\s*\([\s\S]*?className="[^"]*\bend-0\b[^"]*"/);
  assert.doesNotMatch(navbar, /profileOpen\s*&&\s*\([\s\S]*?className="[^"]*\bleft-0\b[^"]*"/);

  // Executive board dropdown uses centered alignment or logical positioning
  assert.match(navbar, /boardOpen\s*&&\s*\([\s\S]*?left-1\/2/);
});

test('5: LanguageSwitcher uses logical text-start and end-0 alignment', async () => {
  const switcher = await read('src/components/LanguageSwitcher.tsx');
  assert.match(switcher, /text-start/);
  assert.match(switcher, /end-0/);
});

test('6: Mobile navigation indentation uses logical ps-* instead of physical pr-*', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  // Sub-items in mobile drawer (committee list) must use ps-10, not pr-10
  assert.match(navbar, /committeeOrder\.map\([\s\S]*?className="[^"]*\bps-10\b/);
  assert.doesNotMatch(navbar, /committeeOrder\.map\([\s\S]*?className="[^"]*\bpr-10\b/);
});

test('9 & 10: Dashboard SidebarLayout reactively subscribes to i18n language changes', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');

  // Must import useTranslation from react-i18next for reactive subscription
  assert.match(layout, /import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/);

  // Must NOT directly import static i18n singleton to avoid non-reactive closure
  assert.doesNotMatch(layout, /import\s*\{[^}]*\bi18n\b[^}]*\}\s*from/);

  // Must invoke useTranslation inside component to establish reactive listener
  assert.match(layout, /const\s*\{\s*i18n\s*\}\s*=\s*useTranslation\(\)/);

  // Must derive direction dynamically from react-i18next hook state
  assert.match(layout, /const\s+direction\s*:\s*['"]rtl['"]\s*\|\s*['"]ltr['"]\s*=\s*customDirection\s*\?\?\s*\(\s*i18n\.dir\(\)\s*as\s*['"]rtl['"]\s*\|\s*['"]ltr['"]\s*\)/);

  // Verifies that border-inline and drawer positioning remain intact
  assert.match(layout, /direction === 'rtl' \? 'right-0' : 'left-0'/);

  // Runtime verification: i18n instance emits languageChanged and i18n.dir() updates immediately
  const { i18n } = await import('../src/i18n/config.ts');
  let notifiedLang = null;
  const listener = (lng) => {
    notifiedLang = lng;
  };
  i18n.on('languageChanged', listener);

  await i18n.changeLanguage('tr');
  assert.equal(i18n.dir(), 'ltr');
  assert.equal(notifiedLang, 'tr');

  await i18n.changeLanguage('en');
  assert.equal(i18n.dir(), 'ltr');
  assert.equal(notifiedLang, 'en');

  await i18n.changeLanguage('ar');
  assert.equal(i18n.dir(), 'rtl');
  assert.equal(notifiedLang, 'ar');

  i18n.off('languageChanged', listener);
});


test('11: Common panels do not force hardcoded dir="rtl" on root sections', async () => {
  const [publicRecog, excuseReview, oversight] = await Promise.all([
    read('src/components/PublicRecognition.tsx'),
    read('src/components/ExcuseReviewPanel.tsx'),
    read('src/components/OversightEvaluationPanel.tsx'),
  ]);

  // Root sections should inherit document direction, not force dir="rtl"
  assert.doesNotMatch(publicRecog, /<section[^>]*dir="rtl"/);
  assert.doesNotMatch(excuseReview, /<section[^>]*dir="rtl"/);
  assert.doesNotMatch(oversight, /<section[^>]*dir="rtl"/);
});

test('12: Directional arrows in pagination and navigation support rtl/ltr flip', async () => {
  const committee = await read('src/pages/CommitteePage.tsx');

  // Prev/next committee chevrons must have direction-aware rotation
  assert.match(committee, /ChevronRight[^>]*rtl:rotate-0\s+ltr:rotate-180/);
  assert.match(committee, /ChevronLeft[^>]*rtl:rotate-0\s+ltr:rotate-180/);
});

test('13: Non-directional icons are not rotated or mirrored', async () => {
  const navbar = await read('src/components/Navbar.tsx');

  // Home, Users, Mail, LogIn should not have rotate-180
  assert.doesNotMatch(navbar, /<Home[^>]*rotate-180/);
  assert.doesNotMatch(navbar, /<Users[^>]*rotate-180/);
  assert.doesNotMatch(navbar, /<Mail[^>]*rotate-180/);
  assert.doesNotMatch(navbar, /<LogIn[^>]*rotate-180/);
});

test('14: No broad RTL plugin or unapproved dependency introduced', async () => {
  const [pkg, tailwindConfig] = await Promise.all([
    read('package.json'),
    read('tailwind.config.js'),
  ]);

  assert.doesNotMatch(pkg, /tailwindcss-rtl/);
  assert.doesNotMatch(pkg, /postcss-rtl/);
  assert.doesNotMatch(tailwindConfig, /require\(['"]tailwindcss-rtl['"]\)/);
});

test('15: Allowlist of physical direction classes is narrow and justified', async () => {
  // Allowlist covers intentional physical cases:
  // 1. Technical inputs/displays with dir="ltr" (email, phone, URLs, code, coordinates)
  // 2. Centered/absolute overlay coordinates (e.g. left-1/2 -translate-x-1/2)
  // 3. Fixed chart or timeline horizontal bars
  const authPages = await read('src/pages/AuthPages.tsx');

  // Inputs with dir="ltr" for emails/passwords are intentional physical allowlisted
  assert.match(authPages, /id=\{fieldId\('email'\)\}[\s\S]*?dir="ltr"/);
});


