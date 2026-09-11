import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationNames = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_executive_own_committee_direct_edit.sql'));

const ALL_COMMITTEE_IDS = [
  'presidency', 'vice-presidency', 'media', 'finance',
  'supervisory', 'academic', 'activities',
];

const { canManageCouncilContent } = await import(
  '../src/domain/executiveProfileUpdatePolicy.ts'
);
const coordinator = await import('../src/domain/executiveEditCoordinator.ts');
const { createSectionContentRepository } = await import(
  '../src/domain/sectionContentRepository.ts'
);

function createClient({ ownResponse }) {
  const calls = [];
  return {
    calls,
    client: {
      from() {
        throw new Error('publishOwnCommittee must not hit from()');
      },
      rpc(name, args) {
        calls.push(['rpc', name, args]);
        return Promise.resolve(ownResponse);
      },
    },
  };
}

/* ------------------------- Migration structure ------------------------- */

test('the own-committee migration is unique and defines the direct RPC', () => {
  assert.equal(migrationNames.length, 1);
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');

  assert.match(sql, /create or replace function public\.publish_own_committee\s*\(\s*p_committee_id text,\s*p_snapshot jsonb,\s*p_expected_version bigint\s*\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke execute on function public\.publish_own_committee[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.publish_own_committee[\s\S]*to authenticated/i);
});

test('the direct RPC authorizes from auth.uid() through executive assignments only', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const rpc = sql.match(/create or replace function public\.publish_own_committee[\s\S]*?\n\$function\$;/i)?.[0] ?? '';

  assert.match(rpc, /v_actor_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(rpc, /from public\.executive_assignments\s+where user_id = v_actor_id/i);
  assert.match(rpc, /only a current executive may manage own committee content/i);
  assert.match(rpc, /42501/i);
});

test('the direct RPC denies other-committee tampering and unknown committee ids', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const rpc = sql.match(/create or replace function public\.publish_own_committee[\s\S]*?\n\$function\$;/i)?.[0] ?? '';

  assert.match(rpc, /v_assignment\.position_key\s*<>\s*'PRESIDENT'/i);
  assert.match(rpc, /v_assignment\.committee_key\s+is distinct from\s+p_committee_id/i);
  assert.match(rpc, /OWN_COMMITTEE_FORBIDDEN/i);
  assert.match(rpc, /p_committee_id\s+not in\s*\(/i);
  assert.match(rpc, /'supervisory'/i);
  assert.match(rpc, /OWN_COMMITTEE_UNKNOWN_COMMITTEE/i);
});

test('the president override is committee-wide but leadership is still required', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const helper = sql.match(/create or replace function private\.executive_can_manage_committee[\s\S]*?\n\$function\$;/i)?.[0] ?? '';

  assert.match(helper, /ea\.position_key\s*=\s*'PRESIDENT'/i);
  assert.match(helper, /or\s+ea\.committee_key\s*=\s*p_committee_id/i);
  assert.match(sql, /OWN_COMMITTEE_AUTHORITY_CHANGED/i);
});

test('the direct RPC publishes only the matched committee element with existing ordering', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const rpc = sql.match(/create or replace function public\.publish_own_committee[\s\S]*?\n\$function\$;/i)?.[0] ?? '';

  assert.match(rpc, /jsonb_agg\s*\(\s*case\s+when c\.item\s*->>\s*'id'\s*=\s*p_committee_id/i);
  assert.match(rpc, /then c\.item\s*\|\|\s*v_snapshot\s+else c\.item\s+end/i);
  assert.match(rpc, /order by c\.position/i);
  assert.match(rpc, /private\.publish_cms_target_locked\s*\(\s*v_actor_id,\s*'committees'/i);
  assert.match(rpc, /private\.normalize_executive_profile_snapshot\s*\(\s*p_snapshot\s*\)/i);
  assert.match(rpc, /private\.executive_profile_snapshot_from_committee/i);
  assert.match(rpc, /OWN_COMMITTEE_NO_CHANGES/i);
  assert.match(rpc, /when serialization_failure\s+then[\s\S]*?40001[\s\S]*?CONTENT_VERSION_CONFLICT/i);
});

test('the direct RPC never creates or consumes pending approval requests', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  assert.doesNotMatch(sql, /submit_profile_edit_request/i);
  assert.doesNotMatch(sql, /insert into public\.edit_requests/i);
  assert.doesNotMatch(sql, /PROFILE_EDIT_ALREADY_PENDING/i);
});

/* ------------------------- Role -> committee matrix ------------------------- */

const ROLE_OWN_COMMITTEE = {
  VICE_PRESIDENT: 'vice-presidency',
  MEDIA_HEAD: 'media',
  FINANCE_HEAD: 'finance',
  AUDIT_HEAD: 'supervisory',
  ACADEMIC_HEAD: 'academic',
  ACTIVITIES_HEAD: 'activities',
};

test('the president can manage every committee', () => {
  for (const committeeId of ALL_COMMITTEE_IDS) {
    assert.equal(
      canManageCouncilContent({ role: 'PRESIDENT', committee: 'presidency' }, committeeId),
      true,
      `president must manage ${committeeId}`,
    );
  }
});

test('every non-president executive manages exactly their own committee', () => {
  for (const [role, ownCommittee] of Object.entries(ROLE_OWN_COMMITTEE)) {
    for (const committeeId of ALL_COMMITTEE_IDS) {
      assert.equal(
        canManageCouncilContent({ role, committee: ownCommittee }, committeeId),
        committeeId === ownCommittee,
        `${role} and ${committeeId}: expected ${committeeId === ownCommittee}`,
      );
    }
  }
});

test('students and assignment-less actors are denied everywhere', () => {
  for (const committeeId of ALL_COMMITTEE_IDS) {
    assert.equal(canManageCouncilContent({ role: 'STUDENT' }, committeeId), false);
    assert.equal(canManageCouncilContent({ role: 'MEDIA_HEAD' }, committeeId), false);
  }
});

/* ------------------------- CRUD persistence coordination ------------------------- */

function committeeOver(overrides) {
  return {
    id: 'media',
    head: { name: 'أحمد' },
    vision: 'رؤية',
    goals: 'أهداف',
    responsibilities: ['مسؤولية قديمة'],
    stats: [{ label: 'العدد', value: '1' }],
    members: [{ id: 'm1', name: 'سارة', position: 'منسقة', photo: '/a.webp' }],
    ...overrides,
  };
}

test('own-committee save publishes a strict snapshot only after the server confirms', async () => {
  const next = committeeOver({
    responsibilities: ['مسؤولية قديمة', 'مسؤولية جديدة'],
    stats: [{ label: 'العدد', value: '2' }],
  });
  let confirmPublication;
  const publication = new Promise((resolve) => { confirmPublication = resolve; });
  let settled = false;
  let snapshotArgument;

  const pending = coordinator.persistOwnCommitteeEdit({
    publish: async (committeeId, snapshot) => {
      snapshotArgument = { committeeId, snapshot };
      return publication;
    },
  }, 'media', next).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  assert.equal(settled, false, 'must not report success before server confirmation');
  assert.deepEqual(snapshotArgument, {
    committeeId: 'media',
    snapshot: {
      responsibilities: ['مسؤولية قديمة', 'مسؤولية جديدة'],
      stats: [{ label: 'العدد', value: '2' }],
      members: [{ id: 'm1', name: 'سارة', position: 'منسقة', photo: '/a.webp' }],
    },
  });

  confirmPublication({ ok: true });
  assert.deepEqual(await pending, { ok: true });
});

test('member add/edit/delete projects into the strict snapshot contract', async () => {
  const addCase = coordinator.persistOwnCommitteeEdit({
    publish: async (_id, snapshot) => ({ snapshot }),
  }, 'media', committeeOver({
    members: [
      { id: 'm1', name: 'سارة', position: 'منسقة', photo: '/a.webp' },
      { id: 'cm-9', name: 'ليلى', position: 'عضوة', photo: '/b.webp' },
    ],
  }));
  assert.deepEqual((await addCase).snapshot.members.map((m) => m.name), ['سارة', 'ليلى']);

  const editCase = coordinator.persistOwnCommitteeEdit({
    publish: async (_id, snapshot) => ({ snapshot }),
  }, 'media', committeeOver({
    members: [{ id: 'm1', name: 'سارة أحمد', position: 'منسقة أولى', photo: '/a.webp' }],
  }));
  assert.deepEqual((await editCase).snapshot.members, [
    { id: 'm1', name: 'سارة أحمد', position: 'منسقة أولى', photo: '/a.webp' },
  ]);

  const deleteCase = coordinator.persistOwnCommitteeEdit({
    publish: async (_id, snapshot) => ({ snapshot }),
  }, 'media', committeeOver({ members: [] }));
  assert.deepEqual((await deleteCase).snapshot.members, []);
});

test('own-committee save rejects an invalid projected snapshot locally', async () => {
  await assert.rejects(
    coordinator.persistOwnCommitteeEdit({
      publish: async () => ({ ok: true }),
    }, 'media', { id: 'media' }),
    /OWN_COMMITTEE_INVALID_SNAPSHOT/,
  );
});

/* ------------------------- Repository ------------------------- */

test('publishOwnCommittee calls the narrow RPC with the exact expected arguments', async () => {
  const fake = createClient({
    ownResponse: {
      data: {
        target: 'committees',
        payload: [{ id: 'media', responsibilities: ['جديدة'] }],
        version: 9,
        updated_at: '2026-09-11T12:00:00Z',
      },
      error: null,
    },
  });
  const repo = createSectionContentRepository(fake.client);
  const snapshot = { responsibilities: ['جديدة'], stats: [], members: [] };
  const result = await repo.publishOwnCommittee('media', snapshot, 8);
  assert.deepEqual(result, {
    ok: true,
    data: {
      target: 'committees',
      payload: [{ id: 'media', responsibilities: ['جديدة'] }],
      version: 9,
      updatedAt: '2026-09-11T12:00:00Z',
    },
  });
  assert.deepEqual(fake.calls, [[
    'rpc',
    'publish_own_committee',
    { p_committee_id: 'media', p_snapshot: snapshot, p_expected_version: 8 },
  ]]);
});

test('publishOwnCommittee maps version conflicts and own-committee denial', async () => {
  const conflict = createClient({
    ownResponse: { data: null, error: { code: '40001', message: 'CONTENT_VERSION_CONFLICT' } },
  });
  const repo = createSectionContentRepository(conflict.client);
  assert.equal(
    (await repo.publishOwnCommittee('media', { responsibilities: [], stats: [], members: [] }, 2)).error.code,
    'CONTENT_VERSION_CONFLICT',
  );

  const denied = createClient({
    ownResponse: { data: null, error: { code: '42501', message: 'OWN_COMMITTEE_FORBIDDEN' } },
  });
  const deniedRepo = createSectionContentRepository(denied.client);
  assert.equal(
    (await deniedRepo.publishOwnCommittee('media', { responsibilities: [], stats: [], members: [] }, 2)).error.code,
    'OWN_COMMITTEE_FORBIDDEN',
  );
});

test('publishOwnCommittee rejects a non-committee publication envelope', async () => {
  const fake = createClient({
    ownResponse: {
      data: { target: 'events', payload: [], version: 5, updated_at: '2026-09-11T12:00:00Z' },
      error: null,
    },
  });
  const result = await createSectionContentRepository(fake.client)
    .publishOwnCommittee('media', { responsibilities: [], stats: [], members: [] }, 2);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SECTION_CONTENT_RESPONSE_INVALID');
});

/* ------------------------- CommitteePage wiring ------------------------- */

test('committee institutional editing routes to the own-committee direct RPC, not the approval queue', () => {
  const source = readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /const result = await submitProfileEdit\(committeeId, snapshot\);/);
  assert.doesNotMatch(source, /PROFILE_EDIT_SUBMITTED_MESSAGE/);
  assert.match(source, /persistOwnCommitteeEdit/);
  assert.match(source, /saveOwnCommitteeContent/);
  assert.match(source, /canManageCouncilContent/);
});

test('pending approval requests no longer gate institutional editing', () => {
  const source = readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  const canEdit = source.match(/const canEditContent\s*=\s*([^;]+);/)?.[1] ?? '';
  assert.doesNotMatch(canEdit, /contentEditState|myPendingEdit|hasPendingRequest/);
  assert.match(canEdit, /allowedCommitteeManager/);
});

test('the president still publishes directly and owns translation publication', () => {
  const source = readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /persistPresidentCommitteeEdit/);
  assert.match(source, /savePublishedSiteTarget\('committees',/);
  assert.match(source, /canPublish=\{Boolean\(isPresident\)\}/);
});

test('the personal profile editor is untouched by the institutional direct path', () => {
  const source = readFileSync(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /canEditPersonalProfile/);
  assert.match(source, /updateBoardHead/);
  assert.match(source, /uploadOwnAvatar/);
});