import test from 'node:test';
import assert from 'node:assert/strict';

const authorization = await import('../src/domain/managedAssetAuthorization.ts');

const EXECUTIVE_ROLES = [
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
];

test('every executive role may upload their own event image', () => {
  for (const role of EXECUTIVE_ROLES) {
    assert.equal(authorization.canUploadManagedFolder(role, 'events'), true, `${role} must allow events`);
  }
});

test('STUDENT stays denied from every gallery folder', () => {
  for (const folder of ['news', 'events', 'albums', 'site', 'documents', 'videos']) {
    assert.equal(authorization.canUploadManagedFolder('STUDENT', folder), false, `STUDENT must not allow ${folder}`);
  }
});

test('gallery upload policy maps roles to permitted folders', () => {
  assert.equal(authorization.canUploadManagedFolder('PRESIDENT', 'site'), true);
  assert.equal(authorization.canUploadManagedFolder('PRESIDENT', 'documents'), true);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'news'), true);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'events'), true);
  assert.equal(authorization.canUploadManagedFolder('ACADEMIC_HEAD', 'events'), true);
  assert.equal(authorization.canUploadManagedFolder('ACTIVITIES_HEAD', 'events'), true);
  assert.equal(authorization.canUploadManagedFolder('AUDIT_HEAD', 'documents'), true);
});

test('unrelated folder permissions stay unchanged for non-president executives', () => {
  assert.equal(authorization.canUploadManagedFolder('VICE_PRESIDENT', 'news'), false);
  assert.equal(authorization.canUploadManagedFolder('VICE_PRESIDENT', 'albums'), false);
  assert.equal(authorization.canUploadManagedFolder('VICE_PRESIDENT', 'site'), false);
  assert.equal(authorization.canUploadManagedFolder('VICE_PRESIDENT', 'videos'), false);
  assert.equal(authorization.canUploadManagedFolder('FINANCE_HEAD', 'news'), false);
  assert.equal(authorization.canUploadManagedFolder('FINANCE_HEAD', 'site'), false);
  assert.equal(authorization.canUploadManagedFolder('AUDIT_HEAD', 'news'), false);
  assert.equal(authorization.canUploadManagedFolder('AUDIT_HEAD', 'videos'), false);
  assert.equal(authorization.canUploadManagedFolder('ACADEMIC_HEAD', 'news'), false);
  assert.equal(authorization.canUploadManagedFolder('ACTIVITIES_HEAD', 'albums'), false);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'documents'), true);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'videos'), true);
});

test('published content rejects a stale expected version', () => {
  assert.deepEqual(
    authorization.validateExpectedContentVersion({ storedVersion: 4, expectedVersion: 3 }),
    { ok: false, code: 'CONTENT_VERSION_CONFLICT' },
  );
  assert.deepEqual(
    authorization.validateExpectedContentVersion({ storedVersion: 4, expectedVersion: 4 }),
    { ok: true, nextVersion: 5 },
  );
});

test('unknown roles and folders fail closed', () => {
  assert.equal(authorization.canUploadManagedFolder('UNKNOWN', 'news'), false);
  assert.equal(authorization.canUploadManagedFolder('PRESIDENT', 'executables'), false);
});
