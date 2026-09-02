import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'src/context/AppContext.tsx',
  'src/pages/AdminDashboard.tsx',
  'src/pages/CommitteePage.tsx',
  'src/pages/ContactPage.tsx',
  'src/pages/FAQPage.tsx',
  'src/pages/MediaGallery.tsx',
  'src/pages/ProgramsPage.tsx',
  'src/pages/StudentGuide.tsx',
  'src/components/HomepageContentCMS.tsx',
  'src/components/InlineEditOverlay.tsx',
];

test('every edit submission call waits for server confirmation', () => {
  const violations = [];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const callee of ['submitSiteEdit', 'submitProfileEdit']) {
      const pattern = new RegExp(`(?<![A-Za-z0-9_])${callee}\\s*\\(`, 'g');
      for (const match of source.matchAll(pattern)) {
        const before = source.slice(Math.max(0, match.index - 24), match.index);
        const declaration = /(?:const|interface|type)\s+$/.test(before);
        if (!declaration && !/await\s*$/.test(before)) violations.push(`${file}:${callee}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('committee submission reports success or failure and closes only after confirmed success', () => {
  const committee = readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  assert.match(committee, /const\s+result\s*=\s*await\s+submitProfileEdit/);
  assert.match(committee, /if\s*\(\s*!result\.ok\s*\)/);
  assert.match(committee, /console\.error\s*\(/);
  assert.match(committee, /setSubmissionFeedback\s*\(/);
  assert.match(committee, /PROFILE_EDIT_SUBMITTED_MESSAGE/);
  assert.match(committee, /if\s*\(\s*!\(await\s+submitOrApply/);
});

test('inline editors await indirect saves and keep the modal open on a failed result', () => {
  const source = readFileSync(new URL('../src/components/InlineEditOverlay.tsx', import.meta.url), 'utf8');
  assert.match(source, /updateSiteField:\s*\([^;]+Promise<boolean>/);
  assert.match(source, /updateAboutField:\s*\([^;]+Promise<boolean>/);
  assert.match(source, /const\s+save\s*=\s*async/);
  assert.match(source, /const\s+saved\s*=\s*await\s+\(config\.target/);
  assert.match(source, /if\s*\(\s*!saved\s*\)[\s\S]{0,100}return/);
  assert.doesNotMatch(source, /Promise\.all/);
});

test('editable cards use one awaited batch operation instead of per-field saves', () => {
  const overlay = readFileSync(new URL('../src/components/InlineEditOverlay.tsx', import.meta.url), 'utf8');
  const card = overlay.slice(overlay.indexOf('export function EditableCard'));
  const context = readFileSync(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const siteBatch = context.slice(context.indexOf("const updateSiteFields:"), context.indexOf("const updateAboutFields:"));
  const aboutBatch = context.slice(context.indexOf("const updateAboutFields:"), context.indexOf("const updateSiteField:"));

  assert.match(overlay, /updateSiteFields:\s*\([^;]+Promise<boolean>/);
  assert.match(overlay, /updateAboutFields:\s*\([^;]+Promise<boolean>/);
  assert.match(card, /const\s+saved\s*=\s*await\s+\(config\.target/);
  assert.match(card, /updateSiteFields\s*\(/);
  assert.match(card, /updateAboutFields\s*\(/);
  assert.doesNotMatch(card, /for\s*\(const field of config\.fields\)/);
  assert.doesNotMatch(card, /updateSiteField\s*\(/);
  assert.doesNotMatch(card, /updateAboutField\s*\(/);
  assert.match(context, /const\s+updateSiteFields:[\s\S]+?await\s+submitSiteEdit\s*\(/);
  assert.match(context, /const\s+updateAboutFields:[\s\S]+?await\s+submitSiteEdit\s*\(/);
  assert.equal((siteBatch.match(/await\s+submitSiteEdit\s*\(/g) ?? []).length, 1);
  assert.equal((aboutBatch.match(/await\s+submitSiteEdit\s*\(/g) ?? []).length, 1);
  assert.match(app, /InlineEditProvider value=\{\{[^}]*updateSiteFields[^}]*updateAboutFields/);
});

test('the president review panel shows canonical technical target identity', () => {
  const source = readFileSync(new URL('../src/components/SiteEditsPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /target=/);
  assert.match(source, /recordId/);
  assert.match(source, /path/);
  assert.match(source, /parentField/);
  assert.match(source, /itemId/);
});
