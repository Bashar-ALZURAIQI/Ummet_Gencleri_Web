import test from 'node:test';
import assert from 'node:assert/strict';

import { visibleHistoryFor } from '../src/domain/accountIdentity.ts';
import {
  createProfileEditEnvelope,
  createSiteEditEnvelope,
  createEditedApprovalNote,
  mapEditRequestToHistory,
  mapEditRequestToProfileEdit,
  mapEditRequestToSiteEdit,
  mapDecidedEditRequestsToHistory,
  normalizeLegacyHistory,
  parseEditedApprovalNote,
  parseEditRequestEnvelope,
} from '../src/domain/editRequestHistory.ts';

const baseRequest = {
  id: '10000000-0000-0000-0000-000000000001',
  submittedByUserId: '20000000-0000-0000-0000-000000000001',
  submittedRole: 'MEDIA_HEAD',
  committeeKey: 'media',
  editType: 'site',
  originalText: 'العنوان: قديم',
  proposedText: '',
  status: 'pending',
  decisionNote: null,
  reviewedByUserId: null,
  submittedAt: '2026-08-23T08:00:00.000Z',
  reviewedAt: null,
};

test('a mapped request is visible only to its UUID owner even when another executive has identical display identity', () => {
  const envelope = createSiteEditEnvelope({
    applicantName: 'أحمد محمد',
    applicantEmail: 'shared@example.org',
    pageId: 'home',
    pageLabel: 'الرئيسية',
    sectionLabel: 'العنوان',
    target: 'site',
    op: 'set',
    path: 'hero.title',
    fieldValue: 'عنوان جديد',
    diffs: [{ label: 'العنوان', oldValue: 'قديم', newValue: 'جديد', path: 'hero.title' }],
  });
  const history = mapEditRequestToHistory({ ...baseRequest, proposedText: envelope });

  assert.equal(history.submittedByUserId, '20000000-0000-0000-0000-000000000001');
  assert.deepEqual(
    visibleHistoryFor([history], {
      userId: '20000000-0000-0000-0000-000000000002',
      role: 'MEDIA_HEAD',
      name: 'أحمد محمد',
      email: 'shared@example.org',
      position: 'المسؤول الإعلامي',
    }),
    [],
  );
  assert.deepEqual(
    visibleHistoryFor([history], {
      userId: '20000000-0000-0000-0000-000000000001',
      role: 'MEDIA_HEAD',
      name: 'أحمد محمد',
      email: 'shared@example.org',
      position: 'المسؤول الإعلامي',
    }),
    [history],
  );
});

test('site envelopes persist only the visible diff contract needed for a confirmed approval', () => {
  const encoded = createSiteEditEnvelope({
    applicantName: 'المسؤول الإعلامي',
    applicantEmail: 'media@example.org',
    pageId: 'news',
    pageLabel: 'الأخبار',
    sectionLabel: 'خبر جديد',
    target: 'news',
    op: 'add',
    recordValue: { id: 'n-1', title: 'الخبر' },
    diffs: [{ label: 'العنوان', oldValue: '', newValue: 'الخبر', path: 'title' }],
  });

  assert.deepEqual(parseEditRequestEnvelope(encoded), {
    version: 1,
    kind: 'site',
    display: { applicantName: 'المسؤول الإعلامي', applicantEmail: 'media@example.org' },
    payload: {
      pageId: 'news',
      pageLabel: 'الأخبار',
      sectionLabel: 'إضافة سجل',
      target: 'news',
      op: 'add',
      diffs: [{ label: 'عنوان الخبر', oldValue: '', newValue: 'الخبر', path: 'title' }],
    },
  });
});

test('profile mapping trusts the database committee key and never exposes profile head fields for approval', () => {
  const proposedText = createProfileEditEnvelope({
    applicantName: 'المسؤول الأكاديمي',
    applicantEmail: 'academic@example.org',
    committeeId: 'presidency',
    snapshot: {
      head: { id: 'victim', name: 'اسم مزور', role: 'الرئيس', bio: 'مزور', email: 'victim@example.org', photo: '' },
      responsibilities: ['مهمة أكاديمية'],
      stats: [{ label: 'برامج', value: '5' }],
      members: [{ id: 'm-1', name: 'عضو', position: 'عضو', photo: '' }],
    },
    summary: [{ label: 'المهام', oldValue: '', newValue: 'مهمة أكاديمية' }],
  });
  const mapped = mapEditRequestToProfileEdit({
    ...baseRequest,
    submittedRole: 'ACADEMIC_HEAD',
    committeeKey: 'academic',
    editType: 'profile',
    proposedText,
  });

  assert.equal(mapped?.committeeId, 'academic');
  assert.equal(Object.prototype.hasOwnProperty.call(mapped?.snapshot ?? {}, 'head'), false);
  assert.deepEqual(mapped?.snapshot.responsibilities, ['مهمة أكاديمية']);
});

test('site mapping rejects an envelope submitted by a non-media assignment', () => {
  const proposedText = createSiteEditEnvelope({
    applicantName: 'عضو أكاديمي',
    applicantEmail: 'academic@example.org',
    pageId: 'home',
    pageLabel: 'الرئيسية',
    sectionLabel: 'العنوان',
    target: 'site',
    op: 'set',
    path: 'hero.title',
    fieldValue: 'محاولة غير مصرح بها',
    diffs: [{ label: 'العنوان', oldValue: 'قديم', newValue: 'جديد', path: 'hero.title' }],
  });

  assert.equal(mapEditRequestToSiteEdit({
    ...baseRequest,
    submittedRole: 'ACADEMIC_HEAD',
    committeeKey: 'academic',
    proposedText,
  }), null);
});

test('edited approval notes preserve revised diffs without changing request ownership', () => {
  const note = createEditedApprovalNote([
    { label: 'العنوان', oldValue: 'قديم', newValue: 'نسخة الرئيس', path: 'title' },
  ]);
  assert.deepEqual(parseEditedApprovalNote(note), {
    version: 1,
    kind: 'edited-approval',
    revisedDiffs: [{ label: 'العنوان', oldValue: 'قديم', newValue: 'نسخة الرئيس', path: 'title' }],
  });
});

test('legacy history is always ownerless and unverified even when localStorage claims a UUID owner', () => {
  const normalized = normalizeLegacyHistory([
    {
      id: 'owned', type: 'site', applicantName: 'نفس الاسم', submittedByUserId: 'owner-1',
      applicantRole: 'الإعلام', committee: 'الرئيسية', editType: 'تعديل', originalText: 'أ', proposedText: 'ب',
      decision: 'APPROVED', decisionDate: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'email-only', type: 'site', applicantName: 'نفس الاسم', submittedByEmail: 'owner@example.org',
      applicantRole: 'الإعلام', committee: 'الرئيسية', editType: 'تعديل', originalText: 'أ', proposedText: 'ب',
      decision: 'REJECTED', decisionDate: '2026-08-02T00:00:00.000Z',
    },
  ]);

  assert.equal(normalized[0].submittedByUserId, undefined);
  assert.equal(normalized[1].submittedByUserId, undefined);
  assert.equal(normalized[0].isLegacy, true);
  assert.equal(normalized[0].isUnverified, true);
  assert.deepEqual(visibleHistoryFor(normalized, { userId: 'owner-1', role: 'MEDIA_HEAD' }), []);
  assert.deepEqual(visibleHistoryFor(normalized, { userId: 'president-1', role: 'PRESIDENT' }), normalized);
});

const structuredProfileRequest = {
  ...baseRequest,
  editType: 'profile',
  committeeKey: 'media',
  submittedRole: 'MEDIA_HEAD',
  proposedText: JSON.stringify({
    version: 1,
    kind: 'profile',
    display: { applicantName: 'المسؤول الإعلامي', applicantEmail: 'media@example.org' },
    payload: { committeeId: 'media' },
  }),
  profileBaseSnapshot: {
    responsibilities: ['المهمة القديمة'], stats: [],
    members: [{ id: 'member-id', name: 'أحمد', position: 'عضو', photo: '/hidden.webp' }],
  },
  profileProposedSnapshot: {
    responsibilities: ['المهمة الجديدة'], stats: [],
    members: [{ id: 'member-id', name: 'أحمد محمود', position: 'منسق', photo: '/hidden.webp' }],
  },
  profilePayloadVersion: 1,
};

test('pending requests never enter decided audit history', () => {
  assert.deepEqual(mapDecidedEditRequestsToHistory([
    { ...structuredProfileRequest, status: 'pending' },
  ]), []);
});

test('structured profile requests map directly from safe columns and expose changed-only diffs', () => {
  const pending = mapEditRequestToProfileEdit(structuredProfileRequest);
  const [history] = mapDecidedEditRequestsToHistory([
    { ...structuredProfileRequest, status: 'approved', reviewedAt: '2026-08-25T12:00:00.000Z' },
  ]);

  assert.equal(pending?.status, 'PENDING_APPROVAL');
  assert.deepEqual(pending?.snapshot.responsibilities, ['المهمة الجديدة']);
  assert.deepEqual(history.diffs.map((row) => row.label), ['المهام والمسؤوليات', 'أعضاء اللجنة']);
  assert.equal(JSON.stringify(history.diffs).includes('member-id'), false);
  assert.equal(JSON.stringify(history.diffs).includes('/hidden.webp'), false);
});

test('unparseable decided legacy requests never expose their serialized proposal', () => {
  const [history] = mapDecidedEditRequestsToHistory([{
    ...baseRequest,
    editType: 'profile',
    committeeKey: 'media',
    submittedRole: 'MEDIA_HEAD',
    proposedText: '{bad json',
    status: 'rejected',
    reviewedAt: '2026-08-25T12:00:00.000Z',
  }]);

  assert.equal(history.detailsUnavailable, true);
  assert.equal(history.proposedText.includes('{bad json'), false);
  assert.deepEqual(history.diffs, []);
});
