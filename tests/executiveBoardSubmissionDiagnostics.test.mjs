import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditRequestService } from '../src/domain/editRequestGateway.ts';

const proposedSnapshot = {
  responsibilities: ['مهمة إعلامية'],
  stats: [],
  members: [],
};

test('profile submission preserves complete Supabase diagnostics for the console path', async () => {
  const supabaseError = {
    code: '22023',
    message: 'PROFILE_EDIT_INVALID_MEMBER',
    details: 'Stored member contains fields outside the public edit snapshot.',
    hint: 'Project persisted members before strict validation.',
  };
  const client = {
    from() {
      return {
        select() {
          return { order: async () => ({ data: [], error: null }) };
        },
      };
    },
    async rpc() {
      return { data: null, error: supabaseError };
    },
  };

  const result = await createEditRequestService(client).submitProfile({ proposedSnapshot });

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, supabaseError);
});
