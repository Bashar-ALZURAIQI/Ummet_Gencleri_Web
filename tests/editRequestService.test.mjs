import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditRequestService } from '../src/domain/editRequestGateway.ts';

const row = {
  id: '10000000-0000-0000-0000-000000000001',
  submitted_by: '20000000-0000-0000-0000-000000000001',
  submitted_role: 'MEDIA_HEAD',
  committee_key: 'media',
  edit_type: 'site',
  original_text: 'قديم',
  proposed_text: '{"version":1}',
  status: 'pending',
  decision_note: null,
  reviewed_by: null,
  submitted_at: '2026-08-23T08:00:00.000Z',
  reviewed_at: null,
};

const structuredRow = {
  ...row,
  site_target: 'news',
  site_payload: [{ id: 'n1', title: 'خبر' }],
  site_base_version: 7,
  site_payload_version: 1,
};

const profileSnapshot = {
  responsibilities: ['مهمة جديدة'],
  stats: [{ label: 'البرامج', value: '5' }],
  members: [{ id: 'member-1', name: 'أحمد', position: 'منسق', photo: '/kept.webp' }],
};

const profileRow = {
  ...row,
  edit_type: 'profile',
  profile_base_snapshot: { responsibilities: [], stats: [], members: [] },
  profile_proposed_snapshot: profileSnapshot,
  profile_payload_version: 1,
};

function createClient({ listResponse = { data: [row], error: null }, rpcResponse = { data: row, error: null } } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column, options) {
              calls.push(['order', column, options]);
              return Promise.resolve(listResponse);
            },
          };
        },
      };
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve(rpcResponse);
    },
  };
  return { client, calls };
}

test('list maps immutable submitter and reviewer UUIDs from Supabase rows', async () => {
  const { client } = createClient();
  const service = createEditRequestService(client);
  const result = await service.list();

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.data[0], {
    id: '10000000-0000-0000-0000-000000000001',
    submittedByUserId: '20000000-0000-0000-0000-000000000001',
    submittedRole: 'MEDIA_HEAD',
    committeeKey: 'media',
    editType: 'site',
    originalText: 'قديم',
    proposedText: '{"version":1}',
    status: 'pending',
    decisionNote: null,
    reviewedByUserId: null,
    submittedAt: '2026-08-23T08:00:00.000Z',
    reviewedAt: null,
  });
});

test('submit uses only the authenticated submit_edit_request RPC and returns its confirmed row', async () => {
  const { client, calls } = createClient();
  const service = createEditRequestService(client);
  const result = await service.submit({ editType: 'site', originalText: 'قديم', proposedText: '{"version":1}' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[
    'rpc',
    'submit_edit_request',
    { p_edit_type: 'site', p_original_text: 'قديم', p_proposed_text: '{"version":1}' },
  ]]);
});

test('decision updates the same request through decide_edit_request and reports failures without a fake success row', async () => {
  const failure = { code: '42501', message: 'Only the current president may decide edit requests' };
  const { client, calls } = createClient({ rpcResponse: { data: null, error: failure } });
  const service = createEditRequestService(client);
  const result = await service.review(
    '10000000-0000-0000-0000-000000000001',
    'approved',
    'confirmed',
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, '42501');
  assert.deepEqual(calls, [[
    'rpc',
    'decide_edit_request',
    {
      p_request_id: '10000000-0000-0000-0000-000000000001',
      p_decision: 'approved',
      p_decision_note: 'confirmed',
    },
  ]]);
});

test('unexpected transport throws become explicit failures instead of escaping as fake success', async () => {
  const client = {
    from() {
      throw new Error('offline');
    },
    async rpc() {
      throw new Error('offline');
    },
  };
  const service = createEditRequestService(client);

  const submit = await service.submit({ editType: 'site', proposedText: '{"version":1}' });
  const review = await service.review('10000000-0000-0000-0000-000000000001', 'approved');
  const list = await service.list();

  assert.equal(submit.ok, false);
  assert.equal(submit.error.code, 'EDIT_REQUEST_SUBMIT_FAILED');
  assert.equal(review.ok, false);
  assert.equal(review.error.code, 'EDIT_REQUEST_REVIEW_FAILED');
  assert.equal(list.ok, false);
  assert.equal(list.error.code, 'EDIT_REQUESTS_LOAD_FAILED');
});

test('structured site submission persists the complete proposed target and base version', async () => {
  const { client, calls } = createClient({ rpcResponse: { data: structuredRow, error: null } });
  const service = createEditRequestService(client);
  const result = await service.submitSite({
    originalText: 'قديم',
    proposedText: '{"version":1}',
    target: 'news',
    payload: [{ id: 'n1', title: 'خبر' }],
    baseVersion: 7,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.siteTarget, 'news');
  assert.deepEqual(calls, [[
    'rpc',
    'submit_site_edit_request',
    {
      p_original_text: 'قديم',
      p_proposed_text: '{"version":1}',
      p_target: 'news',
      p_payload: [{ id: 'n1', title: 'خبر' }],
      p_base_version: 7,
      p_payload_version: 1,
    },
  ]]);
});

test('site approval maps the request and database-confirmed publication atomically', async () => {
  const publication = {
    target: 'news', payload: structuredRow.site_payload, version: 8, updated_at: '2026-08-25T13:00:00Z',
  };
  const { client, calls } = createClient({
    rpcResponse: { data: { request: { ...structuredRow, status: 'approved' }, publication }, error: null },
  });
  const result = await createEditRequestService(client).approveSite(row.id, structuredRow.site_payload, 'اعتماد');
  assert.deepEqual(result.ok && result.data.publication, {
    target: 'news', payload: structuredRow.site_payload, version: 8, updatedAt: '2026-08-25T13:00:00Z',
  });
  assert.deepEqual(calls, [[
    'rpc',
    'approve_site_edit_request',
    { p_request_id: row.id, p_approved_payload: structuredRow.site_payload, p_decision_note: 'اعتماد' },
  ]]);
});

test('site rejection uses the dedicated president RPC without publishing content', async () => {
  const { client, calls } = createClient({ rpcResponse: { data: { ...structuredRow, status: 'rejected' }, error: null } });
  const result = await createEditRequestService(client).rejectSite(row.id, 'مرفوض');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[
    'rpc',
    'reject_site_edit_request',
    { p_request_id: row.id, p_decision_note: 'مرفوض' },
  ]]);
});

test('profile submission uses the dedicated structured RPC and maps its confirmed snapshots', async () => {
  const { client, calls } = createClient({ rpcResponse: { data: profileRow, error: null } });
  const result = await createEditRequestService(client).submitProfile({ proposedSnapshot: profileSnapshot });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.data.profileProposedSnapshot, profileSnapshot);
  assert.deepEqual(calls, [[
    'rpc',
    'submit_profile_edit_request',
    { p_proposed_snapshot: profileSnapshot, p_payload_version: 1 },
  ]]);
});

test('profile submission never reports success unless Supabase confirms a pending request', async () => {
  const { client } = createClient({
    rpcResponse: { data: { ...profileRow, status: 'approved' }, error: null },
  });

  const result = await createEditRequestService(client).submitProfile({ proposedSnapshot: profileSnapshot });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PROFILE_EDIT_SUBMIT_INVALID_STATUS');
});

test('profile approval requires and maps the atomic request-publication envelope', async () => {
  const revisedSnapshot = { ...profileSnapshot, responsibilities: ['مهمة منقحة'] };
  const publication = {
    target: 'committees', payload: { media: revisedSnapshot }, version: 8, updated_at: '2026-08-25T13:00:00Z',
  };
  const { client, calls } = createClient({
    rpcResponse: { data: { request: { ...profileRow, status: 'approved' }, publication }, error: null },
  });
  const result = await createEditRequestService(client).approveProfile(row.id, revisedSnapshot, 'نقّحه الرئيس');

  assert.deepEqual(result.ok && result.data.publication, {
    target: 'committees', payload: { media: revisedSnapshot }, version: 8, updatedAt: '2026-08-25T13:00:00Z',
  });
  assert.deepEqual(calls, [[
    'rpc',
    'approve_profile_edit_request',
    { p_request_id: row.id, p_revised_snapshot: revisedSnapshot, p_decision_note: 'نقّحه الرئيس' },
  ]]);
});

test('profile approval rejects a malformed success envelope instead of reporting publication success', async () => {
  const { client } = createClient({
    rpcResponse: { data: { request: { ...profileRow, status: 'approved' } }, error: null },
  });
  const result = await createEditRequestService(client).approveProfile(row.id);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PROFILE_EDIT_APPROVAL_INVALID');
});

test('profile rejection uses the dedicated president RPC', async () => {
  const { client, calls } = createClient({
    rpcResponse: { data: { ...profileRow, status: 'rejected' }, error: null },
  });
  const result = await createEditRequestService(client).rejectProfile(row.id, 'مرفوض');

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[
    'rpc',
    'reject_profile_edit_request',
    { p_request_id: row.id, p_decision_note: 'مرفوض' },
  ]]);
});
