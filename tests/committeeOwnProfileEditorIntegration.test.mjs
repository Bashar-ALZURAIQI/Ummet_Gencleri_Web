import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');

test('committee personal editor uses authenticated profile fields and owner-bound avatar operation', () => {
  const headEditor = source.match(/\{\/\* Head edit modal \*\/\}([\s\S]*?)\{\/\* Responsibility modal \*\/\}/)?.[1] ?? '';
  assert.match(source, /uploadOwnAvatar/);
  assert.doesNotMatch(headEditor, /uploadManagedFile\('avatar'/);
  assert.match(source, /name:\s*currentUser\?\.name/);
  assert.match(source, /bio:\s*currentUser\?\.bio/);
  assert.match(source, /email:\s*currentUser\?\.contactEmail/);
});

test('pending institutional requests do not gate the personal profile editor', () => {
  const personalAuthority = source.match(/const canEditPersonalProfile\s*=([^;]+);/)?.[1] ?? '';
  assert.doesNotMatch(personalAuthority, /myPendingEdit|contentEditState|canEditContent/);
});
