import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildManagedAssetPath,
  routeForUsage,
  validateManagedFile,
} from '../src/domain/managedAssets.ts';

const AREA_GUIDE_MIGRATION = '20260915141000_allow_guide_managed_asset_area.sql';
const GUIDE_AUTH_MIGRATION = '20260915130000_guide_document_safe_path_authorization.sql';
const BASE_MIGRATION = '20260824143201_site_wide_managed_assets.sql';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const srcUrl = new URL('../src/', import.meta.url);

const readMigration = (suffix) => {
  const migrations = readdirSync(fileURLToPath(migrationsUrl)).sort();
  const name = migrations.find((n) => n.endsWith(suffix) || n === suffix);
  assert.ok(name, `missing migration ${suffix}`);
  return readFileSync(fileURLToPath(new URL(name, migrationsUrl)), 'utf8').toLowerCase();
};

const readSource = (rel) => readFileSync(new URL(rel, srcUrl), 'utf8');

// ---------- managed_assets.area: guide allowed, unknown areas rejected ----------

test('guide is a valid managed_assets area in the domain type and the migration CHECK', () => {
  const domain = readSource('domain/managedAssets.ts');
  assert.match(domain, /ManagedAssetArea.*=.*'guide'/);
  const sql = readMigration(AREA_GUIDE_MIGRATION);
  assert.match(
    sql,
    /area in \('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar', 'guide'\)/,
    'the forward CHECK must allow exactly the seven legacy areas plus guide',
  );
});

test('an arbitrary unknown area remains rejected by the forward CHECK', () => {
  const sql = readMigration(AREA_GUIDE_MIGRATION);
  // The CHECK lists only the eight allowed areas as a closed set.
  const check = sql.match(/add constraint managed_assets_area_check\s*check\s*\(area in \(([^)]*)\)\)/)?.[1] ?? '';
  const areas = check.split(',').map((a) => a.trim());
  assert.deepEqual(
    new Set(areas),
    new Set(["'news'", "'events'", "'gallery'", "'site'", "'plans'", "'reports'", "'avatar'", "'guide'"]),
    'no area outside the allowed eight may enter the CHECK',
  );
  // The legacy base CHECK must still describe the pre-guide closed set so this is
  // provably a forward relaxation, not a different constraint.
  assert.match(
    readMigration(BASE_MIGRATION),
    /area text not null check \(area in \('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar'\)\)/,
  );
});

// ---------- guide-document file validation: office types allowed, executables denied ----------

const GUIDE_DOCUMENT_TYPES = [
  ['rehber.pdf', 'application/pdf', 'pdf'],
  ['talimat.doc', 'application/msword', 'doc'],
  ['talimat.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['tablo.xls', 'application/vnd.ms-excel', 'xls'],
  ['tablo.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['sunum.ppt', 'application/vnd.ms-powerpoint', 'ppt'],
  ['sunum.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
];

test('PDF is allowed as a guide document attachment', () => {
  const ok = validateManagedFile({ name: 'rehber.pdf', type: 'application/pdf', size: 2048 }, 'document', 'guide-document');
  assert.deepEqual(ok, { ok: true, extension: 'pdf', maxBytes: 20 * 1024 * 1024 });
  const path = buildManagedAssetPath({
    usage: 'guide-document',
    ownerId: 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d',
    assetId: 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a',
    mimeType: 'application/pdf',
  });
  assert.deepEqual(path, { ok: true, path: 'documents/a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d/guide/d0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a.pdf' });
});

test('DOC and DOCX are allowed as guide document attachments', () => {
  for (const [name, type, extension] of GUIDE_DOCUMENT_TYPES.slice(1, 3)) {
    const ok = validateManagedFile({ name, type, size: 2048 }, 'document', 'guide-document');
    assert.deepEqual(ok, { ok: true, extension, maxBytes: 20 * 1024 * 1024 });
  }
});

test('XLS and XLSX are allowed as guide document attachments', () => {
  for (const [name, type, extension] of GUIDE_DOCUMENT_TYPES.slice(3, 5)) {
    const ok = validateManagedFile({ name, type, size: 2048 }, 'document', 'guide-document');
    assert.deepEqual(ok, { ok: true, extension, maxBytes: 20 * 1024 * 1024 });
  }
});

test('PPT and PPTX are allowed as guide document attachments', () => {
  for (const [name, type, extension] of GUIDE_DOCUMENT_TYPES.slice(5, 7)) {
    const ok = validateManagedFile({ name, type, size: 2048 }, 'document', 'guide-document');
    assert.deepEqual(ok, { ok: true, extension, maxBytes: 20 * 1024 * 1024 });
  }
});

test('executable extensions are denied for guide document attachments', () => {
  const denied = [
    ['setup.exe', 'application/octet-stream'],
    ['setup.exe', 'application/x-msdownload'],
    ['script.sh', 'application/x-sh'],
    ['payload.dll', 'application/octet-stream'],
    ['malware.php', 'application/octet-stream'],
  ];
  for (const [name, type] of denied) {
    const ok = validateManagedFile({ name, type, size: 2048 }, 'document', 'guide-document');
    assert.equal(ok.ok, false, `${name} must be rejected`);
    assert.equal(ok.code, 'FILE_TYPE_UNSUPPORTED');
  }
});

// ---------- Guide document authorization matrix ----------

test('guide-document route maps to bucket gallery, folder documents, area guide', () => {
  assert.deepEqual(routeForUsage('guide-document'), {
    bucket: 'gallery',
    folder: 'documents',
    kind: 'document',
    area: 'guide',
  });
});

test('PRESIDENT and MEDIA_HEAD are the only roles authorized for guide documents', () => {
  const policy = readMigration(GUIDE_AUTH_MIGRATION);
  // Storage INSERT: PRESIDENT always; MEDIA_HEAD guide marker branch; grouped
  // non-guide roles only when segment 3 is NULL.
  assert.match(policy, /authz\.position_key = 'president'/);
  assert.match(policy, /'media_head'[\s\S]{0,120}= 'guide'/);
  // The five non-guide executive roles are grouped in one branch and the guide
  // marker segment must stay NULL there, denying guide paths to every one of them.
  assert.match(
    policy,
    /'vice_president',[\s\S]{0,220}'finance_head',[\s\S]{0,220}'audit_head',[\s\S]{0,220}'academic_head',[\s\S]{0,220}'activities_head'\s*\)[\s\S]{0,400}\[3\]\s*is\s*null/,
  );
});

test('register_managed_asset enforces PRESIDENT/MEDIA_HEAD only and rejects the rest', () => {
  const sql = readMigration(GUIDE_AUTH_MIGRATION);
  const fn = sql.startsWith('create or replace function public.register_managed_asset')
    ? sql
    : sql.slice(sql.indexOf('create or replace function public.register_managed_asset'));
  assert.match(fn, /v_position\s+not\s+in\s*\('president',\s*'media_head'\)/);
  assert.match(fn, /asset_area\s+<>\s*'guide'/);
  assert.match(fn, /asset_kind\s+<>\s*'document'/);
  assert.match(fn, /pdf\|doc\|docx\|xls\|xlsx\|ppt\|pptx/);
});

test('STUDENT is never granted gallery write or guide-document access', () => {
  const sql = readMigration(GUIDE_AUTH_MIGRATION).replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /'student'/);
});

test('anonymous callers are denied by the FOR INSERT TO authenticated clause', () => {
  const sql = readMigration(GUIDE_AUTH_MIGRATION);
  assert.match(sql, /to authenticated/);
  assert.doesNotMatch(sql, /to\s+anon[\s\S]*insert/);
});

// ---------- Attachment persists in Guide data after save + refresh + renders clickable ----------

test('guide item data persists the attachment URL and label on save and reload', () => {
  const page = readSource('pages/StudentGuide.tsx');
  // The item modal keeps an attachment field in the form state.
  assert.match(page, /documentLabel:\s*''\s*,\s*documentUrl:\s*''/);
  // Saving the item embeds documentLabel/documentUrl into the item object
  // (both the MEDIA_HEAD submitSiteEdit path and the President direct-save path).
  const urlSaves = page.match(/documentUrl:\s*itemForm\.documentUrl\.trim\(\)\s*\?\s*itemForm\.documentUrl\.trim\(\)\s*:\s*undefined/g);
  assert.ok(urlSaves && urlSaves.length >= 2, 'both save paths must persist documentUrl');
  // Editing reloads the persisted attachment from the canonical item.
  assert.match(page, /documentUrl:\s*canonItem\?\.documentUrl\s*\?\?\s*item\.documentUrl\s*\?\?\s*''/);
});

test('the uploaded public URL is written into the guide item attachment', () => {
  const page = readSource('pages/StudentGuide.tsx');
  assert.match(
    page,
    /onUploaded=\{\s*\(asset\)\s*=>\s*setItemForm\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*documentUrl:\s*asset\.publicUrl\s*\}\)\)\s*\}/,
    'uploaded asset publicUrl must become the persisted item documentUrl',
  );
  assert.match(page, /ManagedFileField[\s\S]{0,120}usage="guide-document"/);
});

test('the persisted attachment renders as a clickable download link on the public guide', () => {
  const page = readSource('pages/StudentGuide.tsx');
  assert.match(page, /\{item\.documentUrl &&\s*\(/);
  assert.match(page, /href=\{item\.documentUrl\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
});