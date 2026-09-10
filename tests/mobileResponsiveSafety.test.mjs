import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile navbar allows the dynamic brand to shrink and keeps compact controls usable', () => {
  const navbar = read('src/components/Navbar.tsx');
  const switcher = read('src/components/LanguageSwitcher.tsx');

  assert.match(navbar, /Logo[\s\S]*?<button[\s\S]*?className="[^"]*\bmin-w-0\b[^"]*\bflex-1\b/);
  assert.match(navbar, /text-start[^"\n]*\bmin-w-0\b/);
  assert.match(navbar, /resolvePublicBrandName[\s\S]*?\btruncate\b/);
  assert.match(switcher, /currentOption\.nativeName[\s\S]*?hidden sm:inline|hidden sm:inline[\s\S]*?currentOption\.nativeName/);
});

test('recognition grid and cards cannot take intrinsic width from dynamic names', () => {
  const source = read('src/components/PublicRecognition.tsx');
  assert.match(source, /grid-cols-1[^"\n]*\bmin-w-0\b|min-w-0[^"\n]*grid-cols-1/);
  assert.match(source, /card[^"\n]*\bmin-w-0\b[^"\n]*lg:col-span-2/);
  assert.match(source, /leaders\.map[\s\S]*?\bmin-w-0\b[\s\S]*?\bflex-1\b/);
  assert.equal((source.match(/person-name-two-lines/g) ?? []).length >= 2, true);
});

test('two-line public person names preserve readability and break unbroken tokens safely', () => {
  const css = read('src/index.css');
  assert.match(css, /\.person-name-two-lines\s*\{[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(css, /\.person-name-two-lines\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);

  for (const path of ['src/pages/BoardPage.tsx', 'src/pages/CommitteePage.tsx']) {
    assert.match(read(path), /person-name-two-lines/);
  }
});

test('public event titles, statistic labels, and mobile hero actions cannot force page width', () => {
  assert.match(read('src/components/EventCard.tsx'), /dynamic-text-safe/);
  assert.match(read('src/components/StatCounter.tsx'), /dynamic-text-safe/);
  const home = read('src/pages/HomePage.tsx');
  assert.equal((home.match(/w-full sm:w-auto/g) ?? []).length >= 3, true);
});
