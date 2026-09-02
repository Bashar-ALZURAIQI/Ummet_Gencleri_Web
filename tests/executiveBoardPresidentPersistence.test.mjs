import test from 'node:test';
import assert from 'node:assert/strict';

const coordinator = await import('../src/domain/executiveEditCoordinator.ts');

const committees = [
  { id: 'presidency', responsibilities: ['old-president-task'] },
  { id: 'media', responsibilities: ['old-media-task'] },
];
const nextMedia = { id: 'media', responsibilities: ['persisted-media-task'] };

test('president committee save publishes the full replacement list and awaits server confirmation', async () => {
  assert.equal(typeof coordinator.persistPresidentCommitteeEdit, 'function');

  const calls = [];
  let confirmPublication;
  const publication = new Promise((resolve) => { confirmPublication = resolve; });
  let settled = false;

  const pending = coordinator.persistPresidentCommitteeEdit({
    publishCommittees: async (value) => {
      calls.push(value);
      return publication;
    },
  }, committees, 'media', nextMedia).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  assert.equal(settled, false, 'must not report success before Supabase confirms the write');
  assert.deepEqual(calls, [[committees[0], nextMedia]]);

  confirmPublication({ ok: true });
  assert.deepEqual(await pending, { ok: true });
});

test('president committee save returns the server failure without a local fallback', async () => {
  const serverFailure = { ok: false, error: 'database rejected the publication', diagnostic: { code: '42501' } };
  const result = await coordinator.persistPresidentCommitteeEdit({
    publishCommittees: async () => serverFailure,
  }, committees, 'media', nextMedia);

  assert.deepEqual(result, serverFailure);
});
