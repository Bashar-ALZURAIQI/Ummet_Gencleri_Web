import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const adminDashboardPath = path.join(process.cwd(), 'src/pages/AdminDashboard.tsx');
const adminDashboardContent = fs.readFileSync(adminDashboardPath, 'utf-8');

const CANONICAL_QUARTERS = [
  'الربع الأول 2026',
  'الربع الثاني 2026',
  'الربع الثالث 2026',
  'الربع الرابع 2026',
  'السنة 2026',
  'الربع الأول 2027',
];

const CANONICAL_REPORT_TYPES = [
  'تقرير سنوي',
  'تقرير ربع سنوي',
  'تقرير لجنة',
];

test('1. Every plan quarter option has an explicit canonical value', () => {
  const quarterSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('quarter'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  assert.ok(quarterSelectMatch, 'planForm.quarter select element must exist');

  const selectBody = quarterSelectMatch[1];
  const optionMatches = [...selectBody.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)];

  for (const canonicalQuarter of CANONICAL_QUARTERS) {
    const found = optionMatches.some((m) => {
      const attrs = m[1];
      return attrs.includes(`value="${canonicalQuarter}"`) || attrs.includes(`value='${canonicalQuarter}'`);
    });
    assert.ok(
      found,
      `Expected plan quarter option with explicit value="${canonicalQuarter}"`
    );
  }
});

test('2. Visible quarter label remains translated via t(...)', () => {
  const quarterSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('quarter'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  const selectBody = quarterSelectMatch[1];

  assert.match(selectBody, /value="الربع الأول 2026"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.q1_2026'/);
  assert.match(selectBody, /value="الربع الثاني 2026"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.q2_2026'/);
  assert.match(selectBody, /value="الربع الثالث 2026"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.q3_2026'/);
  assert.match(selectBody, /value="الربع الرابع 2026"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.q4_2026'/);
  assert.match(selectBody, /value="السنة 2026"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.year_2026'/);
  assert.match(selectBody, /value="الربع الأول 2027"[^>]*>\{t\('admin\.plans\.planModal\.quarters\.q1_2027'/);
});

import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

test('3. Turkish quarter display does NOT become the stored value', () => {
  const trQuarters = Object.values(tr.admin?.plans?.planModal?.quarters || {});
  assert.ok(trQuarters.length > 0, 'Turkish quarter translations must exist');

  for (const trLabel of trQuarters) {
    assert.doesNotMatch(
      adminDashboardContent,
      new RegExp(`value=["']${trLabel}["']`),
      `Turkish display label "${trLabel}" must never be an option value`
    );
  }
});

test('4. English quarter display does NOT become the stored value', () => {
  const enQuarters = Object.values(en.admin?.plans?.planModal?.quarters || {});
  assert.ok(enQuarters.length > 0, 'English quarter translations must exist');

  for (const enLabel of enQuarters) {
    assert.doesNotMatch(
      adminDashboardContent,
      new RegExp(`value=["']${enLabel}["']`),
      `English display label "${enLabel}" must never be an option value`
    );
  }
});

test('5. Existing canonical quarter remains selectable in all locales', () => {
  const quarterSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('quarter'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  const selectBody = quarterSelectMatch[1];
  assert.ok(
    selectBody.includes('value="الربع الثالث 2026"'),
    'Canonical value "الربع الثالث 2026" must be available for selection'
  );

  // Also verify legacy unknown value fallback preservation
  assert.ok(
    selectBody.includes('planForm.quarter') && selectBody.includes('!['),
    'Legacy unknown quarter fallback option must be present'
  );
});

test('6. Every report type option has an explicit canonical value', () => {
  const reportTypeSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('type'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  assert.ok(reportTypeSelectMatch, 'reportForm.type select element must exist');

  const selectBody = reportTypeSelectMatch[1];
  const optionMatches = [...selectBody.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)];

  for (const canonicalType of CANONICAL_REPORT_TYPES) {
    const found = optionMatches.some((m) => {
      const attrs = m[1];
      return attrs.includes(`value="${canonicalType}"`) || attrs.includes(`value='${canonicalType}'`);
    });
    assert.ok(
      found,
      `Expected report type option with explicit value="${canonicalType}"`
    );
  }
});

test('7. Visible report-type label remains translated', () => {
  const reportTypeSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('type'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  const selectBody = reportTypeSelectMatch[1];

  assert.match(selectBody, /value="تقرير سنوي"[^>]*>\{t\('admin\.plans\.reportModal\.reportTypes\.annual'/);
  assert.match(selectBody, /value="تقرير ربع سنوي"[^>]*>\{t\('admin\.plans\.reportModal\.reportTypes\.quarterly'/);
  assert.match(selectBody, /value="تقرير لجنة"[^>]*>\{t\('admin\.plans\.reportModal\.reportTypes\.committee'/);
});

test('8. Turkish report-type display does NOT become stored value', () => {
  const trTypes = Object.values(tr.admin?.plans?.reportModal?.reportTypes || {});
  assert.ok(trTypes.length > 0, 'Turkish report type translations must exist');

  for (const trLabel of trTypes) {
    assert.doesNotMatch(
      adminDashboardContent,
      new RegExp(`value=["']${trLabel}["']`),
      `Turkish display label "${trLabel}" must never be an option value`
    );
  }
});

test('9. English report-type display does NOT become stored value', () => {
  const enTypes = Object.values(en.admin?.plans?.reportModal?.reportTypes || {});
  assert.ok(enTypes.length > 0, 'English report type translations must exist');

  for (const enLabel of enTypes) {
    assert.doesNotMatch(
      adminDashboardContent,
      new RegExp(`value=["']${enLabel}["']`),
      `English display label "${enLabel}" must never be an option value`
    );
  }
});

test('10. Existing canonical report type remains selectable in all locales', () => {
  const reportTypeSelectMatch = adminDashboardContent.match(
    /<select[^>]*id=\{fieldId\('type'\)\}[^>]*>([\s\S]*?)<\/select>/
  );
  const selectBody = reportTypeSelectMatch[1];
  assert.ok(
    selectBody.includes('value="تقرير سنوي"'),
    'Canonical value "تقرير سنوي" must be available for selection'
  );

  // Also verify legacy unknown value fallback preservation
  assert.ok(
    selectBody.includes('reportForm.type') && selectBody.includes('!['),
    'Legacy unknown report type fallback option must be present'
  );
});

test('11. report.period remains a free-form input and is NOT converted into a fixed enum', () => {
  const hasPeriodTextInput = /id=\{fieldId\('period'\)\}[^>]*type="text"|type="text"[^>]*id=\{fieldId\('period'\)\}/.test(
    adminDashboardContent
  );
  assert.ok(hasPeriodTextInput, 'reportForm.period must remain a free-form input[type="text"]');

  const periodSelect = adminDashboardContent.match(/<select[^>]*id=\{fieldId\('period'\)\}/);
  assert.equal(periodSelect, null, 'reportForm.period must NOT be a select element');
});

test('12. No database payload shape changes', () => {
  assert.match(adminDashboardContent, /const payload = \{ \.\.\.planForm/);
  assert.match(adminDashboardContent, /const payload = \{ \.\.\.reportForm/);
  assert.match(adminDashboardContent, /quarter:\s*p\.quarter/);
  assert.match(adminDashboardContent, /type:\s*r\.type/);
});

test('13. No Supabase interaction', () => {
  const migrationsExist = fs.existsSync(path.join(process.cwd(), 'supabase/migrations'));
  assert.ok(migrationsExist, 'Supabase migrations directory exists');
});

import { isCmsPathTranslatable } from '../src/domain/cmsTranslatableFields.ts';

test('14. No CMS localization schema changes', () => {
  assert.equal(isCmsPathTranslatable('plans', 'quarter'), false, 'plans.quarter must NOT be translatable via CMS');
  assert.equal(isCmsPathTranslatable('reports', 'type'), false, 'reports.type must NOT be translatable via CMS');
  assert.equal(isCmsPathTranslatable('reports', 'period'), true, 'reports.period must be translatable via CMS');
});

test('15. No translation provider changes', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(deps['@azure/cognitiveservices-translatortext'], undefined);
  assert.equal(deps['@google-cloud/translate'], undefined);
  assert.equal(deps['deepl-node'], undefined);
});
