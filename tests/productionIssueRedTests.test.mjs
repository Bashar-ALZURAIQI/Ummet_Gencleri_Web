import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = async (relPath) =>
  (await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

// ===========================================================================
// Part 1 — Executive board own-profile editing (CommitteePage)
// ===========================================================================

test('1. the executive head edit pencil is always visible when editable (touch/mobile included)', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  assert.match(source, /onClick=\{openHead\}/, 'the head edit control must exist');
  assert.doesNotMatch(
    source,
    /onClick=\{openHead\}[\s\S]*?opacity-0[\s\S]*?group-hover\/head:opacity-100/,
    'the head edit pencil must never be gated behind hover-only opacity',
  );
  assert.doesNotMatch(
    source,
    /onClick=\{openHead\}[\s\S]*?opacity-0/,
    'the head edit pencil must stay visible on touch screens',
  );
});

test('2. MAIN save of the executive head publishes the entered TR/EN head bio translations', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  const block = source.slice(source.indexOf('const saveHead'), source.indexOf('// Responsibilities'));
  assert.match(block, /publishCmsEntityLocales/, 'saveHead must publish translations on the main save');
  assert.match(block, /headTranslations/, 'saveHead must consume the collected head translations');
  assert.match(block, /target: 'committees'/, 'head translations publish to the committees target');
  assert.match(block, /committeeId/, 'head translation publish must be server-scoped by committee id');
});

test('3. MAIN save of a responsibility publishes the entered TR/EN translations', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  const block = source.slice(source.indexOf('const saveResp'), source.indexOf('const deleteResp'));
  assert.match(block, /publishCmsEntityLocales/, 'saveResp must publish translations on the main save');
  assert.match(block, /respTranslations/, 'saveResp must consume the collected responsibility translations');
  assert.match(block, /target: 'committees'/, 'responsibility translations publish to the committees target');
  assert.match(block, /committeeId/, 'responsibility translation publish must be server-scoped by committee id');
});

test('4. MAIN save of a statistic publishes the entered TR/EN translations', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  const block = source.slice(source.indexOf('const saveStat'), source.indexOf('// Members'));
  assert.match(block, /publishCmsEntityLocales/, 'saveStat must publish translations on the main save');
  assert.match(block, /statTranslations/, 'saveStat must consume the collected stat translations');
  assert.match(block, /target: 'committees'/, 'stat translations publish to the committees target');
  assert.match(block, /committeeId/, 'stat translation publish must be server-scoped by committee id');
});

test('5. MAIN save keeps THE member identity for add and edit: edit replaces in place, draft path never duplicates', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  const block = source.slice(source.indexOf('const saveMember'), source.indexOf('const deleteMember'));

  // Identity flow: an edit reuses the edited member id; an add generates a new id.
  assert.match(
    block,
    /const newMemberId = editingMember\?\.id \?\?/,
    'edits must reuse the existing member id, adds must generate a new id',
  );
  // Canonical EDIT branch replaces the existing row at that id (no duplicate).
  assert.match(
    block,
    /m\.id === editingMember\.id \? \{ \.\.\.m, \.\.\.memberForm, photo \} : m/,
    'the canonical edit branch must replace the row at the edited member id',
  );
  // Canonical ADD branch appends with the very same newMemberId used by the publish.
  assert.match(
    block,
    /\{ id: newMemberId, name: memberForm\.name, position: memberForm\.position, photo \}\]/,
    'the canonical add branch must append the row under newMemberId',
  );
  // The single translation publish is scoped to the effective member row id for BOTH paths.
  assert.match(block, /recordId: newMemberId/, 'translations publish against the effective member row id');
  // Draft-only roles replace an existing translation row by id instead of appending duplicates.
  assert.match(
    block,
    /members\.findIndex\(\(m\) => m && \(m as \{ id\?: unknown \}\)\.id === newMemberId\)/,
    'draft merge must look up the existing member translation row by id',
  );
  assert.match(block, /members\.splice\(existingIdx, 1\)/, 'draft merge must splice the existing row before pushing');
});

// ===========================================================================
// Part 3 — Committee translation status must stay fresh after MAIN save
// (RPC source_hash persistence)
// ===========================================================================

test('6. committee localization published saves relay the computed source hash to the RPC', async () => {
  const source = await read('src/services/localization/SupabaseCmsLocalizationRepository.ts');
  const start = source.indexOf("rpc('publish_own_committee_localization'");
  assert.ok(start >= 0, 'publish RPC call must exist');
  const block = source.slice(start, source.indexOf('});', start));
  assert.match(block, /p_source_hash/, 'the computed source hash must be passed to the narrow publish RPC');
});

test('7. the source-hash forward migration redefines the publish RPC to persist source_hash', async () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const target = files.find((f) => f.includes('fix_own_committee_localization_source_hash'));
  assert.ok(target, 'the source-hash forward migration must exist');
  const sql = (await readFile(new URL(target, dir), 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.publish_own_committee_localization/, 'publish RPC must be redefined');
  assert.match(sql, /p_source_hash/);
  assert.match(sql, /source_hash/, 'the persisted row columns must include source_hash');
});

test('8. the guide-area forward migration allows exactly the legacy areas plus guide, excluding everything else', async () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const target = files.find((f) => f.includes('allow_guide_managed_asset_area'));
  assert.ok(target, 'the guide-area forward migration must exist');
  const sql = (await readFile(new URL(target, dir), 'utf8')).toLowerCase();

  assert.match(sql, /drop constraint if exists managed_assets_area_check/);
  assert.match(
    sql,
    /area in \('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar', 'guide'\)/,
    'all legacy areas plus guide must be allowed, and unknown areas still rejected by the CHECK',
  );
});

// ===========================================================================
// Part 6 — Homepage RTL/LTR hero alignment
// ===========================================================================

test('9. HomePage hero aligns to the logical start on large screens (LTR safe)', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /text-center lg:text-start/, 'large screens must use the direction-aware start alignment');
  assert.doesNotMatch(home, /lg:text-end/, 'physical text-end breaks LTR alignment and must be removed');
  assert.doesNotMatch(home, /lg:text-right/, 'physical text-right must never return');
});

// ===========================================================================
// Part 7 — Programs achievements direct edit pencil
// ===========================================================================

test('10. the ProgramsPage achievements banner exposes a direct always-visible edit control', async () => {
  const source = await read('src/pages/ProgramsPage.tsx');
  assert.match(source, /const openHeaderEditor = /, 'a shared header/achievements editor opener must exist');
  const bannerStart = source.indexOf('Achievements banner for past tab');
  assert.ok(bannerStart >= 0, 'the achievements banner must exist');
  const banner = source.slice(bannerStart, source.indexOf('</section>', bannerStart));
  assert.match(banner, /Edit3/, 'the achievements banner must carry an edit pencil');
  assert.match(banner, /openHeaderEditor/, 'the pencil must open the achievements/header editor');
  assert.doesNotMatch(banner, /opacity-0/, 'the achievements edit pencil must be visible on touch screens');
});

test('11. the header pencil and the achievements pencil share the same editor opener', async () => {
  const source = await read('src/pages/ProgramsPage.tsx');
  const start = source.indexOf('const openHeaderEditor');
  assert.ok(start >= 0, 'the shared header/achievements opener must exist');
  const openHeaderEditorBody = source.slice(start, source.indexOf('};', start));
  assert.match(openHeaderEditorBody, /setHeaderForm\(programsContent\)/);
  assert.match(openHeaderEditorBody, /setHeaderTranslations/);
  assert.match(openHeaderEditorBody, /setEditingHeader\(true\)/);
});

// ===========================================================================
// Part 9 — Executive profile own-profile email mapping guard (regression)
// ===========================================================================

test('12. executive head saves keep the shared email -> contactEmail own-profile mapping', async () => {
  const { prepareOwnExecutiveProfileUpdate } = await import('../src/domain/executiveProfileUpdatePolicy.ts');
  const result = prepareOwnExecutiveProfileUpdate({
    actorUserId: 'u1',
    targetUserId: 'u1',
    changes: { name: '  Sara  ', email: ' sara@ug.org ', bio: 'Bio', role: 'ignored' },
  });
  assert.deepEqual(result, {
    ok: true,
    data: { name: 'Sara', contactEmail: 'sara@ug.org', bio: 'Bio' },
  });
});

test('13. the executive head modal keeps TR/EN translations openable in the same form', async () => {
  const source = await read('src/pages/CommitteePage.tsx');
  const headModal = source.slice(source.indexOf('Head edit modal'), source.indexOf('Responsibility modal'));
  assert.match(headModal, /CmsEntityTranslationTabs/, 'the head edit modal must host translation tabs');
  assert.match(headModal, /target="committees"/, 'the head translation tabs target committee content');
  assert.match(headModal, /committeeId=\{committee\.id\}/, 'the head translation tabs stay server-scoped by committee id');
});