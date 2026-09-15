import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { SupabaseCmsLocalizationRepository } from '../src/services/localization/SupabaseCmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import {
  publishCmsEntityFields,
  resolveCmsLocalizationScope,
  saveCmsEntityDraft,
} from '../src/domain/cmsLocalizationEditor.ts';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CANONICAL = [
  { id: 'media', heading: 'وسائل الإعلام', responsibilities: ['أ', 'ب'], members: [{ id: 'm1', name: 'سارة', position: 'منسق' }] },
  { id: 'finance', heading: 'الشؤون المالية', responsibilities: ['س'], members: [] },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Fake Supabase client that records RPC calls and forbids any direct table
 * mutation for the target under test. Read-only select chains resolve null.
 */
function makeAssertionClient() {
  const rpcCalls = [];
  const tableUpserts = [];

  const client = {
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args });
      return { data: { ok: true }, error: null };
    },
    from(table) {
      if (table !== 'cms_localizations') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: null, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
        upsert(row, opts) {
          tableUpserts.push({ row, opts });
          return { select: () => ({ single: async () => ({ data: { ...row, id: 'row-1' }, error: null }) }) };
        },
      };
    },
  };

  return { client, rpcCalls, tableUpserts };
}

// ---------------------------------------------------------------------------
// 1. Repository contract: committee localization saves MUST go through the
//    narrow server-enforced RPCs, never through the broad table upsert.
// ---------------------------------------------------------------------------

test('1. published committee localization saves route through publish_own_committee_localization RPC only', async () => {
  const { client, rpcCalls, tableUpserts } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);
  const record = {
    target: 'committees',
    locale: 'tr',
    payload: clone(CANONICAL),
    status: 'fresh',
  };

  const saved = await repo.savePublished(record, { committeeId: 'media' });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'publish_own_committee_localization');
  assert.equal(rpcCalls[0].args.p_committee_id, 'media');
  assert.equal(rpcCalls[0].args.p_locale, 'tr');
  assert.deepEqual(rpcCalls[0].args.p_localized_committees, clone(CANONICAL));
  assert.equal(tableUpserts.length, 0, 'the broad table upsert must never be used for committees');
  assert.equal(saved.target, 'committees');
  assert.equal(saved.locale, 'tr');
});

test('2. committee localization published saves fail closed without a committeeId', async () => {
  const { client } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  await assert.rejects(
    repo.savePublished({ target: 'committees', locale: 'en', payload: clone(CANONICAL), status: 'fresh' }, {}),
    (err) => /committee|record/i.test(err.message),
  );
});

test('3. non-committee localization publishes keep the existing table upsert path', async () => {
  const { client, rpcCalls, tableUpserts } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Ana Sayfa' } },
    status: 'fresh',
  });

  assert.equal(rpcCalls.length, 0);
  assert.equal(tableUpserts.length, 1, 'the table upsert remains the path for non-committee targets');
  assert.equal(tableUpserts[0].row.target, 'site');
});

test('4. committee localization drafts route through save_own_committee_draft_localization RPC only', async () => {
  const { client, rpcCalls, tableUpserts } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  await repo.saveDraft(
    { target: 'committees', locale: 'en', payload: clone(CANONICAL), status: 'draft', manualPaths: ['media.heading'] },
    { committeeId: 'media' },
  );

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'save_own_committee_draft_localization');
  assert.equal(rpcCalls[0].args.p_committee_id, 'media');
  assert.equal(rpcCalls[0].args.p_locale, 'en');
  assert.equal(tableUpserts.length, 0);
});

test('5. committee localization draft deletion routes through delete_own_committee_draft_localization RPC', async () => {
  const { client, rpcCalls } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  const deleted = await repo.deleteDraft('committees', 'tr', { committeeId: 'media' });

  assert.equal(deleted, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'delete_own_committee_draft_localization');
  assert.equal(rpcCalls[0].args.p_committee_id, 'media');
  assert.equal(rpcCalls[0].args.p_locale, 'tr');
});

// ---------------------------------------------------------------------------
// 2. Domain + UI wiring: committeeId reaches each committees-target write
// ---------------------------------------------------------------------------

test('6A. publishCmsEntityFields forwards committeeId into the committee publish RPC', async () => {
  const { client, rpcCalls, tableUpserts } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  await publishCmsEntityFields({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: clone(CANONICAL),
    recordId: 'media',
    fields: { heading: 'İletişim' },
    committeeId: 'media',
  });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'publish_own_committee_localization');
  assert.equal(rpcCalls[0].args.p_committee_id, 'media');
  assert.equal(tableUpserts.length, 0, 'the editor must never fall back to the broad table upsert for committees');
});

test('6B. saveCmsEntityDraft routes committees drafts through the draft RPC with committeeId', async () => {
  const { client, rpcCalls, tableUpserts } = makeAssertionClient();
  const repo = new SupabaseCmsLocalizationRepository(client);

  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'en',
    canonicalPayload: clone(CANONICAL),
    recordId: 'media',
    fields: { heading: 'Media Affairs' },
    committeeId: 'media',
  });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'save_own_committee_draft_localization');
  assert.equal(rpcCalls[0].args.p_committee_id, 'media');
  assert.equal(tableUpserts.length, 0);
});

test('6. every "committees" translation tab on CommitteePage passes committeeId', async () => {
  const source = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  const blocks = source.split(/<CmsEntityTranslationTabs/).slice(1);
  const committeeBlocks = blocks.filter((block) => /target="committees"/.test(block));
  assert.ok(committeeBlocks.length >= 4, `expected >=4 committees tabs, found ${committeeBlocks.length}`);
  for (const block of committeeBlocks) {
    assert.match(block, /committeeId=\{committee\.id\}/, 'committee tabs must pass the committee id for server enforcement');
  }
});

test('7. every "committees" translation tab on AdminDashboard passes committeeId', async () => {
  const source = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  const blocks = source.split(/<CmsEntityTranslationTabs/).slice(1);
  const committeeBlocks = blocks.filter((block) => /target="committees"/.test(block));
  assert.ok(committeeBlocks.length >= 4, `expected >=4 committees tabs, found ${committeeBlocks.length}`);
  for (const block of committeeBlocks) {
    assert.match(block, /committeeId=\{/, 'admin committee tabs must pass the committee id for server enforcement');
  }
});

test('8. committee member drafts are no longer hashed against the pre-edit canonical', async () => {
  const [committeePage, adminDashboard] = await Promise.all([
    readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(committeePage, /computeSourceHash\(\s*committees\s*\)/, 'CommitteePage member draft must hash the post-add canonical');
  assert.doesNotMatch(adminDashboard, /computeSourceHash\(\s*committees\s*\)/, 'AdminDashboard member draft must hash the post-add canonical');
  assert.match(committeePage, /computeSourceHash\(\s*memberCanonicalNext\s*\)/, 'CommitteePage hashes the post-add member capture');
  assert.match(adminDashboard, /computeSourceHash\(\s*memberCanonicalNext\s*\)/, 'AdminDashboard hashes the post-add member capture');
});

// ---------------------------------------------------------------------------
// 3. Domain ordering: publishing a committee after canonical growth preserves
//    every sibling committee and does not regress to a stale status.
// ---------------------------------------------------------------------------

test('9. committee publish after canonical growth preserves sibling translations and stays fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  const publishedPayload = clone(CANONICAL);
  publishedPayload[1].heading = 'Mali İşler';
  await repo.savePublished({
    target: 'committees',
    locale: 'tr',
    payload: publishedPayload,
    status: 'fresh',
    manualPaths: ['finance.heading'],
    stalePaths: [],
  });

  const canonicalNext = clone(CANONICAL);
  canonicalNext[0].responsibilities.push('ج');
  canonicalNext[0].members = [];

  const saved = await publishCmsEntityFields({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: canonicalNext,
    recordId: 'media',
    fields: { heading: 'İletişim', 'responsibilities.2': 'Görev' },
    committeeId: 'media',
  });

  assert.equal(saved.status, 'fresh');
  const media = saved.payload.find((item) => item.id === 'media');
  const finance = saved.payload.find((item) => item.id === 'finance');
  assert.equal(media.heading, 'İletişim');
  assert.equal(media.responsibilities[2], 'Görev');
  assert.equal(finance.heading, 'Mali İşler', 'a sibling committee translation must never be clobbered');

  const scope = resolveCmsLocalizationScope({
    draftRecord: await repo.getDraft('committees', 'tr'),
    publishedRecord: saved,
    recordId: 'media',
    fieldPaths: ['heading', 'responsibilities.2'],
  });
  assert.equal(scope.isStale, false, 'an own-committee publish must not regress sibling committees to stale');
});

test('10. committee identity is threaded through the shared publish executor', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const saved = await publishCmsEntityFields({
    repository: repo,
    target: 'committees',
    locale: 'en',
    canonicalPayload: clone(CANONICAL),
    recordId: 'media',
    fields: { heading: 'Media Affairs' },
    committeeId: 'media',
  });
  assert.equal(saved.locale, 'en');
  assert.equal(saved.status, 'fresh');
  assert.equal(saved.sourceHash, computeSourceHash(clone(CANONICAL)));
});