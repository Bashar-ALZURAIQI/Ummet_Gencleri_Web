import test from 'node:test';
import assert from 'node:assert/strict';

const {
  activityDraftComplete,
  canManageExcuses,
  canCreateExecutiveContent,
  canManageMemberPoints,
  canManageOversight,
  canManageTasks,
  canMutateMemberPoints,
  ledgerCreatorPresentation,
  memberNeedsWarning,
  studentPortalTabs,
  taskDraftComplete,
  tierPresentation,
} = await import('../src/domain/phaseThreeEconomy.ts');

test('derives the three membership badges at the approved boundaries', () => {
  assert.deepEqual(tierPresentation(-50), { tier: 'BRONZE', label: 'عضو مبادر', medal: '🥉' });
  assert.equal(tierPresentation(100).tier, 'BRONZE');
  assert.equal(tierPresentation(101).tier, 'SILVER');
  assert.equal(tierPresentation(300).tier, 'SILVER');
  assert.equal(tierPresentation(301).tier, 'GOLD');
});

test('flags balances at minus fifty or lower', () => {
  assert.equal(memberNeedsWarning(-51), true);
  assert.equal(memberNeedsWarning(-50), true);
  assert.equal(memberNeedsWarning(-49), false);
});

test('requires every activity attendance draft before finalization', () => {
  assert.equal(activityDraftComplete([]), false);
  assert.equal(activityDraftComplete([{ attendanceStatus: 'ON_TIME' }]), true);
  assert.equal(activityDraftComplete([
    { attendanceStatus: 'LATE' },
    { attendanceStatus: null },
  ]), false);
});

test('requires every task completion draft before finalization', () => {
  assert.equal(taskDraftComplete([]), false);
  assert.equal(taskDraftComplete([{ completionStatus: 'PERFECT' }]), true);
  assert.equal(taskDraftComplete([
    { completionStatus: 'PARTIAL' },
    { completionStatus: 'PENDING' },
  ]), false);
});

test('enforces the approved phase-three role matrix', () => {
  assert.equal(canManageExcuses('PRESIDENT'), true);
  assert.equal(canManageExcuses('VICE_PRESIDENT'), true);
  assert.equal(canManageExcuses('ACADEMIC_HEAD'), false);
  assert.equal(canManageExcuses('AUDIT_HEAD'), false);
  assert.equal(canManageOversight('PRESIDENT'), true);
  assert.equal(canManageOversight('AUDIT_HEAD'), true);
  assert.equal(canManageOversight('ACADEMIC_HEAD'), false);
  assert.equal(canManageMemberPoints('PRESIDENT'), true);
  assert.equal(canManageMemberPoints('ACADEMIC_HEAD'), true);
  assert.equal(canManageMemberPoints('AUDIT_HEAD'), true);
  assert.equal(canManageMemberPoints('MEDIA_HEAD'), false);
  assert.equal(canMutateMemberPoints('PRESIDENT'), true);
  assert.equal(canMutateMemberPoints('AUDIT_HEAD'), false);
  for (const role of [
    'PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD',
    'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD',
  ]) {
    assert.equal(canManageTasks(role), true, `${role} should manage scoped tasks`);
  }
  assert.equal(canManageTasks('STUDENT'), false);
});

test('allows every executive role, but never students, to create activities and tasks', () => {
  for (const role of [
    'PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD',
    'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD',
  ]) {
    assert.equal(canCreateExecutiveContent(role), true, `${role} should create activities and tasks`);
  }
  assert.equal(canCreateExecutiveContent('STUDENT'), false);
  assert.equal(canCreateExecutiveContent(null), false);
});

test('places achievements in one dedicated student tab without removing existing tabs', () => {
  assert.equal(typeof studentPortalTabs, 'function');
  assert.deepEqual(studentPortalTabs(false), [
    { id: 'activities', label: 'أنشطتي' },
    { id: 'tasks', label: 'المهام التطوعية' },
    { id: 'achievements', label: 'إنجازاتي ونقاطي' },
    { id: 'suggestions', label: 'الاقتراحات والمشاركات' },
    { id: 'messages', label: 'رسائلي وردود الإدارة' },
  ]);
  assert.deepEqual(studentPortalTabs(true).at(-1), { id: 'application', label: 'حالة الانضمام' });
});

test('presents the ledger creator as role and name with safe self and system fallbacks', () => {
  assert.equal(typeof ledgerCreatorPresentation, 'function');
  assert.equal(ledgerCreatorPresentation({
    createdByName: 'بشار الزريقي', createdByRole: 'PRESIDENT', createdByIsSelf: false,
  }), 'رئيس الاتحاد - بشار الزريقي');
  assert.equal(ledgerCreatorPresentation({
    createdByName: 'أحمد', createdByRole: null, createdByIsSelf: true,
  }), 'الطالب نفسه - أحمد');
  assert.equal(ledgerCreatorPresentation({
    createdByName: null, createdByRole: null, createdByIsSelf: false,
  }), 'النظام');
});
