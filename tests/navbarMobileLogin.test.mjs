import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const mobileMenu = source.match(/\{\/\* Mobile menu \*\/\}([\s\S]*)$/)?.[1] ?? '';

test('anonymous mobile menu exposes a standalone login action using the real login route', () => {
  assert.match(mobileMenu, /!currentUser\s*&&\s*\(/);
  assert.match(mobileMenu, /onClick=\{\(\)\s*=>\s*go\(\{\s*kind:\s*'login'\s*\}\)\}/);
  assert.match(mobileMenu, /<LogIn[\s\S]*?t\('auth\.login'\)/);
});

test('student portal remains present and authenticated mobile users do not receive login', () => {
  assert.match(mobileMenu, /onClick=\{goStudentPortal\}/);
  const loginGuard = mobileMenu.match(/!currentUser\s*&&\s*\(([\s\S]*?)\n\s*\)\}/)?.[1] ?? '';
  assert.match(loginGuard, /kind:\s*'login'/);
});

test('desktop anonymous login action remains present', () => {
  const desktop = source.match(/\{\/\* Right actions \*\/\}([\s\S]*?)\{\/\* Mobile toggle \*\/\}/)?.[1] ?? '';
  assert.match(desktop, /kind:\s*'login'/);
  assert.match(desktop, /t\('auth\.login'\)/);
});
