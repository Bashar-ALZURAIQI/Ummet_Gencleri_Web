import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyExecutiveTextRevision,
  buildEditDiffTableModel,
  buildExecutiveEditDiff,
  normalizeExecutiveContentSnapshot,
  PROFILE_EDIT_SUBMITTED_MESSAGE,
  resolveExecutiveContentEditState,
} from '../src/domain/executiveEditWorkflow.ts';
import * as executiveWorkflow from '../src/domain/executiveEditWorkflow.ts';
import { buildEditAuditViewModel } from '../src/domain/editAuditView.ts';

test('profile diff exposes only changed localized content and hides technical member fields', () => {
  const base = {
    responsibilities: ['تنظيم اللقاءات'],
    stats: [{ label: 'البرامج', value: '4' }],
    members: [{ id: 'internal-1', name: 'أحمد', position: 'منسق', photo: '/safe.webp' }],
  };
  const proposed = {
    responsibilities: ['تنظيم اللقاءات', 'متابعة الطلاب'],
    stats: [{ label: 'البرامج', value: '5' }],
    members: [{ id: 'internal-1', name: 'أحمد محمود', position: 'منسق', photo: '/safe.webp' }],
  };

  assert.deepEqual(buildExecutiveEditDiff(base, proposed), [
    {
      key: 'responsibilities',
      label: 'المهام والمسؤوليات',
      oldValue: 'تنظيم اللقاءات',
      newValue: 'تنظيم اللقاءات\nمتابعة الطلاب',
    },
    { key: 'stats', label: 'الإحصائيات', oldValue: '4 — البرامج', newValue: '5 — البرامج' },
    { key: 'members', label: 'أعضاء اللجنة', oldValue: 'أحمد — منسق', newValue: 'أحمد محمود — منسق' },
  ]);

  const serialized = JSON.stringify(buildExecutiveEditDiff(base, proposed));
  assert.equal(serialized.includes('internal-1'), false);
  assert.equal(serialized.includes('/safe.webp'), false);
});

test('structured profile snapshots reject protected and unknown keys', () => {
  assert.equal(normalizeExecutiveContentSnapshot({
    responsibilities: [], stats: [], members: [], role: 'PRESIDENT',
  }), null);
  assert.equal(normalizeExecutiveContentSnapshot({
    head: { name: 'مزور' }, responsibilities: [], stats: [], members: [],
  }), null);
});

test('committee UI data is projected to the strict profile snapshot before submission', () => {
  assert.equal(typeof executiveWorkflow.projectExecutiveContentSnapshot, 'function');
  if (typeof executiveWorkflow.projectExecutiveContentSnapshot !== 'function') return;

  assert.deepEqual(executiveWorkflow.projectExecutiveContentSnapshot({
    responsibilities: ['  مهمة إعلامية معدلة  '],
    stats: [{ label: ' المنشورات ', value: ' 50+ ', icon: 'Megaphone' }],
    members: [{
      id: 'member-1',
      name: ' أحمد ',
      position: ' منسق ',
      photo: ' /avatar.webp ',
      phone: 'ignored',
      university: 'ignored',
      major: 'ignored',
      year: 'ignored',
    }],
    head: { role: 'ignored' },
  }), {
    responsibilities: ['مهمة إعلامية معدلة'],
    stats: [{ label: 'المنشورات', value: '50+' }],
    members: [{ id: 'member-1', name: 'أحمد', position: 'منسق', photo: '/avatar.webp' }],
  });
});

test('structured profile snapshots reject oversized and malformed visible content', () => {
  assert.equal(normalizeExecutiveContentSnapshot({
    responsibilities: [''], stats: [], members: [],
  }), null);
  assert.equal(normalizeExecutiveContentSnapshot({
    responsibilities: [], stats: [{ label: 'برامج', value: 5 }], members: [],
  }), null);
});

test('submission feedback uses the approved Arabic message', () => {
  assert.equal(
    PROFILE_EDIT_SUBMITTED_MESSAGE,
    'تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد',
  );
});

test('president revision changes allowed text while preserving member identities and photos', () => {
  const snapshot = {
    responsibilities: ['النص القديم'], stats: [{ label: 'برامج', value: '4' }],
    members: [{ id: 'hidden-id', name: 'أحمد', position: 'عضو', photo: '/kept.webp' }],
  };
  const revised = applyExecutiveTextRevision(snapshot, {
    responsibilities: ['النص المعدل'],
    stats: [{ label: 'برامج', value: '8' }],
    members: [{ id: 'replacement-id', name: 'الاسم المعدل', position: 'منسق', photo: '/attempt.webp' }],
  });

  assert.equal(revised.ok, true);
  assert.deepEqual(revised.ok && revised.value.members[0], {
    id: 'hidden-id', name: 'الاسم المعدل', position: 'منسق', photo: '/kept.webp',
  });
});

test('president revision rejects member list shape changes', () => {
  const snapshot = {
    responsibilities: [], stats: [],
    members: [{ id: 'hidden-id', name: 'أحمد', position: 'عضو', photo: '/kept.webp' }],
  };
  const revised = applyExecutiveTextRevision(snapshot, {
    responsibilities: [], stats: [], members: [],
  });

  assert.equal(revised.ok, false);
});

test('comparison view model contains display-only rows and never technical fields', () => {
  const model = buildEditDiffTableModel([{
    key: 'members', label: 'أعضاء اللجنة', oldValue: 'أحمد — عضو', newValue: 'أحمد — منسق',
  }]);

  assert.deepEqual(Object.keys(model.rows[0]), ['key', 'label', 'oldValue', 'newValue']);
  assert.equal(JSON.stringify(model).includes('id'), false);
});

test('a non-president with a pending request cannot open committee content editors', () => {
  assert.deepEqual(resolveExecutiveContentEditState({ isPresident: false, hasPendingRequest: true }), {
    canEditContent: false,
    reason: 'PENDING_APPROVAL',
  });
});

test('the president remains able to edit committee content directly', () => {
  assert.deepEqual(resolveExecutiveContentEditState({ isPresident: true, hasPendingRequest: true }), {
    canEditContent: true,
    reason: null,
  });
});

test('audit view defensively keeps only final decisions and exposes no actions', () => {
  const shared = {
    type: 'profile', applicantName: 'عضو الإعلام', applicantRole: 'المسؤول الإعلامي',
    committee: 'اللجنة الإعلامية', editType: 'تعديل بيانات الهيئة',
    originalText: 'قديم', proposedText: 'جديد', submittedAt: '2026-08-25T08:00:00.000Z',
    decisionDate: '2026-08-25T12:00:00.000Z',
    diffs: [{ key: 'responsibilities', label: 'المهام والمسؤوليات', oldValue: 'قديم', newValue: 'جديد' }],
  };
  const model = buildEditAuditViewModel([
    { ...shared, id: 'pending-id', status: 'pending', decision: 'PENDING' },
    { ...shared, id: 'approved-id', status: 'approved', decision: 'APPROVED' },
  ]);

  assert.equal(model.entries.length, 1);
  assert.equal(model.entries[0].id, 'approved-id');
  assert.equal(model.entries[0].decision, 'APPROVED');
  assert.deepEqual(model.entries[0].actions, []);
  assert.equal(JSON.stringify(model).includes('{"version"'), false);
});
