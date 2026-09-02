import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runExecutiveEditApproval,
  runExecutiveEditRejection,
  runExecutiveEditSubmission,
} from '../src/domain/executiveEditCoordinator.ts';

const proposedSnapshot = { responsibilities: ['مهمة جديدة'], stats: [], members: [] };
const profileRequest = {
  id: 'request-1', editType: 'profile', status: 'pending', committeeKey: 'media',
  profileBaseSnapshot: { responsibilities: [], stats: [], members: [] },
  profileProposedSnapshot: proposedSnapshot, profilePayloadVersion: 1,
};
const approvedRequest = { ...profileRequest, status: 'approved' };
const publication = {
  target: 'committees', payload: [{ id: 'media', ...proposedSnapshot }],
  version: 7, updatedAt: '2026-08-25T12:00:00.000Z',
};

test('confirmed structured submission publishes only the returned request row', async () => {
  const published = [];
  const result = await runExecutiveEditSubmission({
    submit: async () => ({ ok: true, data: profileRequest }),
    publishRequest: (request) => published.push(request),
  }, proposedSnapshot);

  assert.equal(result.ok, true);
  assert.deepEqual(published, [profileRequest]);
});

test('failed profile approval never publishes committee content or a final request', async () => {
  const publications = [];
  const requests = [];
  const result = await runExecutiveEditApproval({
    approve: async () => ({ ok: false, error: { code: 'PROFILE_EDIT_STALE', message: 'stale' } }),
    publishCommittees: (value) => publications.push(value),
    publishRequest: (value) => requests.push(value),
  }, profileRequest.id);

  assert.equal(result.ok, false);
  assert.deepEqual(publications, []);
  assert.deepEqual(requests, []);
});

test('successful profile approval applies only the atomic publication envelope', async () => {
  const publications = [];
  const requests = [];
  const result = await runExecutiveEditApproval({
    approve: async () => ({ ok: true, data: { request: approvedRequest, publication } }),
    publishCommittees: (value) => publications.push(value),
    publishRequest: (value) => requests.push(value),
  }, profileRequest.id);

  assert.equal(result.ok, true);
  assert.deepEqual(publications, [publication]);
  assert.deepEqual(requests, [approvedRequest]);
});

test('failed rejection preserves the pending row', async () => {
  const requests = [];
  const result = await runExecutiveEditRejection({
    reject: async () => ({ ok: false, error: { code: 'OFFLINE', message: 'offline' } }),
    publishRequest: (value) => requests.push(value),
  }, profileRequest.id);

  assert.equal(result.ok, false);
  assert.deepEqual(requests, []);
});
