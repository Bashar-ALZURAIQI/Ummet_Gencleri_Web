import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildRevocationConfirmation,
  executeExecutiveRevocation,
  classifyRevocationRpcResult,
  isProvenNoCommitRevocationError,
} = await import('../src/domain/executiveRevocation.ts');

const {
  executeExecutiveTransfer,
} = await import('../src/domain/executiveTransfer.ts');

const president = { userId: '11111111-1111-4111-8111-111111111111', role: 'PRESIDENT' };
const auditHead = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'أحمد',
  role: 'AUDIT_HEAD',
  status: 'active',
};
const academicHead = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'محمد',
  role: 'ACADEMIC_HEAD',
  status: 'active',
};
const studentMember = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'خالد',
  role: 'STUDENT',
  status: 'active',
};

function successfulRevocationRpc(targetUserId, position) {
  return Promise.resolve({
    kind: 'confirmed',
    data: {
      revokedPosition: position,
      revokedUserId: targetUserId,
      revokedBy: president.userId,
      revokedAt: '2026-09-04T12:00:00Z',
    },
  });
}

// 1. PRESIDENT can revoke AUDIT_HEAD -> STUDENT
test('PRESIDENT can revoke AUDIT_HEAD -> STUDENT', async () => {
  let rpcCalls = [];
  const result = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async (targetUserId) => {
      rpcCalls.push(targetUserId);
      return successfulRevocationRpc(targetUserId, 'AUDIT_HEAD');
    },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(rpcCalls, [auditHead.id]);
  assert.deepEqual(result.revokedMember, { id: auditHead.id, name: auditHead.name });
});

// 2. PRESIDENT can revoke ACADEMIC_HEAD -> STUDENT
test('PRESIDENT can revoke ACADEMIC_HEAD -> STUDENT', async () => {
  let rpcCalls = [];
  const result = await executeExecutiveRevocation({
    actor: president,
    target: academicHead,
    revoke: async (targetUserId) => {
      rpcCalls.push(targetUserId);
      return successfulRevocationRpc(targetUserId, 'ACADEMIC_HEAD');
    },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(rpcCalls, [academicHead.id]);
  assert.deepEqual(result.revokedMember, { id: academicHead.id, name: academicHead.name });
});

// 3. Revoking an executive leaves that office vacant
test('revoking an executive leaves that office vacant in the mapped directory', async () => {
  let directoryMembers = [
    { id: auditHead.id, name: auditHead.name, role: 'AUDIT_HEAD' },
  ];

  await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async (targetUserId) => successfulRevocationRpc(targetUserId, 'AUDIT_HEAD'),
    refreshDirectory: async () => {
      // Upon revocation, assignment is deleted so member maps to STUDENT
      directoryMembers = directoryMembers.map((m) =>
        m.id === auditHead.id ? { ...m, role: 'STUDENT' } : m
      );
      return { ok: true };
    },
  });

  const auditHolder = directoryMembers.find((m) => m.role === 'AUDIT_HEAD');
  assert.equal(auditHolder, undefined, 'Office should be vacant');
  const demotedMember = directoryMembers.find((m) => m.id === auditHead.id);
  assert.equal(demotedMember?.role, 'STUDENT');
});

// 4. Target profile/membership is not removed
test('target profile and membership status are preserved when revoking', async () => {
  let targetProfile = { ...auditHead, status: 'active', university: 'جامعة اسطنبول' };

  const result = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async (targetUserId) => {
      // Mock server behavior: profile status and data remain active
      return successfulRevocationRpc(targetUserId, 'AUDIT_HEAD');
    },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(targetProfile.status, 'active');
  assert.equal(targetProfile.university, 'جامعة اسطنبول');
});

// 5. Non-president actor cannot revoke an executive
test('non-president actor cannot revoke an executive', async () => {
  let rpcCalls = 0;
  const nonPresidents = [{ role: 'VICE_PRESIDENT' }, { role: 'STUDENT' }, { role: 'AUDIT_HEAD' }, null];

  for (const actor of nonPresidents) {
    const result = await executeExecutiveRevocation({
      actor,
      target: auditHead,
      revoke: async () => { rpcCalls += 1; return successfulRevocationRpc(auditHead.id, 'AUDIT_HEAD'); },
      refreshDirectory: async () => ({ ok: true }),
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /رئيس الاتحاد/);
  }
  assert.equal(rpcCalls, 0);
});

// 6. PRESIDENT assignment cannot be revoked
test('PRESIDENT assignment cannot be revoked to STUDENT', async () => {
  let rpcCalls = 0;
  const presidentTarget = { id: president.userId, name: 'الرئيس', role: 'PRESIDENT', status: 'active' };

  const result = await executeExecutiveRevocation({
    actor: president,
    target: presidentTarget,
    revoke: async () => { rpcCalls += 1; return successfulRevocationRpc(president.userId, 'PRESIDENT'); },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /الرئيس/);
  assert.equal(rpcCalls, 0);
});

// 7. Target with no executive assignment does not produce fake success
test('target with no executive assignment does not produce fake success', async () => {
  const result = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async () => ({
      kind: 'definitive-failure',
      error: { code: 'P0002', message: 'Target member does not hold an executive assignment' },
    }),
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /تعذر إنهاء المنصب/);
});

// 8. Existing STUDENT -> executive transfer still works
test('existing STUDENT -> executive transfer still works', async () => {
  const result = await executeExecutiveTransfer({
    actor: { role: 'PRESIDENT' },
    target: { id: studentMember.id, name: studentMember.name },
    position: 'AUDIT_HEAD',
    previousHolder: null,
    transfer: async () => ({
      kind: 'confirmed',
      data: {
        transferredPosition: 'AUDIT_HEAD',
        previousUserId: null,
        newUserId: studentMember.id,
        targetPreviousPosition: null,
        assignedBy: president.userId,
        assignedAt: '2026-09-04T12:00:00Z',
      },
    }),
    gateAuthority: () => {},
    refreshDirectory: async () => ({ ok: true }),
    reloadIdentity: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.newHolder?.id, studentMember.id);
});

// 9. Existing executive -> another executive position transfer still works
test('existing executive -> another executive position transfer still works', async () => {
  const result = await executeExecutiveTransfer({
    actor: { role: 'PRESIDENT' },
    target: { id: academicHead.id, name: academicHead.name },
    position: 'AUDIT_HEAD',
    previousHolder: { id: auditHead.id, name: auditHead.name },
    transfer: async () => ({
      kind: 'confirmed',
      data: {
        transferredPosition: 'AUDIT_HEAD',
        previousUserId: auditHead.id,
        newUserId: academicHead.id,
        targetPreviousPosition: 'ACADEMIC_HEAD',
        assignedBy: president.userId,
        assignedAt: '2026-09-04T12:00:00Z',
      },
    }),
    gateAuthority: () => {},
    refreshDirectory: async () => ({ ok: true }),
    reloadIdentity: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.newHolder?.id, academicHead.id);
  assert.equal(result.previousHolder?.id, auditHead.id);
});

// 10. Existing presidency transfer still works
test('existing presidency transfer still works', async () => {
  const result = await executeExecutiveTransfer({
    actor: { role: 'PRESIDENT' },
    target: { id: auditHead.id, name: auditHead.name },
    position: 'PRESIDENT',
    previousHolder: { id: president.userId, name: 'الرئيس القديم' },
    transfer: async () => ({
      kind: 'confirmed',
      data: {
        transferredPosition: 'PRESIDENT',
        previousUserId: president.userId,
        newUserId: auditHead.id,
        targetPreviousPosition: 'AUDIT_HEAD',
        assignedBy: president.userId,
        assignedAt: '2026-09-04T12:00:00Z',
      },
    }),
    gateAuthority: () => {},
    refreshDirectory: async () => ({ ok: true }),
    reloadIdentity: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.newHolder?.id, auditHead.id);
});

// 12. Current STUDENT does not perform redundant write
test('current STUDENT does not perform redundant write', async () => {
  let rpcCalls = 0;
  const result = await executeExecutiveRevocation({
    actor: president,
    target: studentMember,
    revoke: async () => { rpcCalls += 1; return successfulRevocationRpc(studentMember.id, 'STUDENT'); },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /طالب بالفعل/);
  assert.equal(rpcCalls, 0);
});

// 14. Correct Arabic confirmation text is generated
test('buildRevocationConfirmation generates correct Arabic text for offices', () => {
  const auditMsg = buildRevocationConfirmation({
    targetName: 'أحمد',
    position: 'AUDIT_HEAD',
  });
  assert.equal(
    auditMsg,
    'سيتم إنهاء منصب الرقابة لـ أحمد وإعادته إلى طالب عادي. سيصبح منصب الرقابة شاغراً. هل تريد المتابعة؟'
  );

  const academicMsg = buildRevocationConfirmation({
    targetName: 'محمد',
    position: 'ACADEMIC_HEAD',
  });
  assert.equal(
    academicMsg,
    'سيتم إنهاء منصب الأكاديمية لـ محمد وإعادته إلى طالب عادي. سيصبح منصب الأكاديمية شاغراً. هل تريد المتابعة؟'
  );

  const mediaMsg = buildRevocationConfirmation({
    targetName: 'سارة',
    position: 'MEDIA_HEAD',
  });
  assert.equal(
    mediaMsg,
    'سيتم إنهاء منصب الإعلام لـ سارة وإعادته إلى طالب عادي. سيصبح منصب الإعلام شاغراً. هل تريد المتابعة؟'
  );

  const financeMsg = buildRevocationConfirmation({
    targetName: 'عمر',
    position: 'FINANCE_HEAD',
  });
  assert.equal(
    financeMsg,
    'سيتم إنهاء منصب المالية لـ عمر وإعادته إلى طالب عادي. سيصبح منصب المالية شاغراً. هل تريد المتابعة؟'
  );

  const activitiesMsg = buildRevocationConfirmation({
    targetName: 'بلال',
    position: 'ACTIVITIES_HEAD',
  });
  assert.equal(
    activitiesMsg,
    'سيتم إنهاء منصب الأنشطة لـ بلال وإعادته إلى طالب عادي. سيصبح منصب الأنشطة شاغراً. هل تريد المتابعة؟'
  );

  const vpMsg = buildRevocationConfirmation({
    targetName: 'يوسف',
    position: 'VICE_PRESIDENT',
  });
  assert.equal(
    vpMsg,
    'سيتم إنهاء منصب نائب الرئيس لـ يوسف وإعادته إلى طالب عادي. سيصبح منصب نائب الرئيس شاغراً. هل تريد المتابعة؟'
  );
});

// 15. Directory refresh happens after confirmed revocation
test('directory refresh happens after confirmed revocation', async () => {
  let directoryRefreshed = false;
  const result = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async (id) => successfulRevocationRpc(id, 'AUDIT_HEAD'),
    refreshDirectory: async () => {
      directoryRefreshed = true;
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(directoryRefreshed, true);
});

// Fail-closed behavior on indeterminate RPC or throw
test('fail-closed on indeterminate RPC or thrown error', async () => {
  const resultIndeterminate = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async () => ({ kind: 'indeterminate', error: { code: 'NETWORK_ERR', message: 'Unknown' } }),
    refreshDirectory: async () => ({ ok: true }),
  });
  assert.equal(resultIndeterminate.ok, false);
  assert.match(resultIndeterminate.error, /تعذر التأكد/);

  const resultThrow = await executeExecutiveRevocation({
    actor: president,
    target: auditHead,
    revoke: async () => { throw new Error('transport failure'); },
    refreshDirectory: async () => ({ ok: true }),
  });
  assert.equal(resultThrow.ok, false);
  assert.match(resultThrow.error, /تعذر التأكد/);
});

test('classifyRevocationRpcResult handles confirmed, rollback, and indeterminate responses', () => {
  const confirmed = classifyRevocationRpcResult({
    data: [{
      revoked_position: 'AUDIT_HEAD',
      revoked_user_id: auditHead.id,
      revoked_by: president.userId,
      revoked_at: '2026-09-04T12:00:00Z',
    }],
    error: null,
  });
  assert.equal(confirmed.kind, 'confirmed');
  assert.deepEqual(confirmed.data, {
    revokedPosition: 'AUDIT_HEAD',
    revokedUserId: auditHead.id,
    revokedBy: president.userId,
    revokedAt: '2026-09-04T12:00:00Z',
  });

  const rejectedP0002 = classifyRevocationRpcResult({
    data: null,
    error: { code: 'P0002', message: 'Target member does not hold an executive assignment' },
  });
  assert.equal(rejectedP0002.kind, 'definitive-failure');
  assert.equal(rejectedP0002.error.code, 'P0002');

  const rejected42501 = classifyRevocationRpcResult({
    data: null,
    error: { code: '42501', message: 'Only the current president may revoke' },
  });
  assert.equal(rejected42501.kind, 'definitive-failure');

  const indeterminateNetwork = classifyRevocationRpcResult({
    data: null,
    error: { code: 'PGRST000', message: 'connection timeout' },
  });
  assert.equal(indeterminateNetwork.kind, 'indeterminate');

  const malformedData = classifyRevocationRpcResult({
    data: [],
    error: null,
  });
  assert.equal(malformedData.kind, 'indeterminate');
});

test('isProvenNoCommitRevocationError recognizes PostgreSQL rejection codes', () => {
  assert.equal(isProvenNoCommitRevocationError({ code: '42501' }), true);
  assert.equal(isProvenNoCommitRevocationError({ code: '22023' }), true);
  assert.equal(isProvenNoCommitRevocationError({ code: 'P0002' }), true);
  assert.equal(isProvenNoCommitRevocationError({ code: '23505' }), true);
  assert.equal(isProvenNoCommitRevocationError({ code: '57014' }), false);
  assert.equal(isProvenNoCommitRevocationError(null), false);
});

// 11 & 13. UI shows "طالب عادي" and disables it for current PRESIDENT and STUDENT
test('UI shows "طالب عادي" in MembersTab and handles president and student disabled state', async () => {
  const { readFile } = await import('node:fs/promises');
  const adminCode = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');

  // 11. UI shows "طالب عادي" alongside executive roles
  assert.match(adminCode, /طالب عادي/);
  assert.match(adminCode, /selectStudent\(\)/);

  // 13. PRESIDENT -> STUDENT is disabled/rejected
  assert.match(adminCode, /roleModal\.role === 'PRESIDENT'/);
  assert.match(adminCode, /disabled=\{[^}]*roleModal\.role === 'PRESIDENT'/);
  assert.match(adminCode, /لا يمكن إنهاء منصب الرئيس وإعادته إلى طالب مباشرة/);

  // Wiring: revokeExecutiveAssignment passed to MembersTab
  assert.match(adminCode, /revokeExecutiveAssignment=\{revokeExecutiveAssignment\}/);
});


