import test from 'node:test';
import assert from 'node:assert/strict';

const authorization = await import('../src/domain/managedAssetAuthorization.ts');

test('gallery upload policy maps roles to permitted folders', () => {
  assert.equal(authorization.canUploadManagedFolder('PRESIDENT', 'site'), true);
  assert.equal(authorization.canUploadManagedFolder('PRESIDENT', 'documents'), true);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'news'), true);
  assert.equal(authorization.canUploadManagedFolder('MEDIA_HEAD', 'events'), false);
  assert.equal(authorization.canUploadManagedFolder('ACADEMIC_HEAD', 'events'), true);
  assert.equal(authorization.canUploadManagedFolder('ACTIVITIES_HEAD', 'events'), true);
  assert.equal(authorization.canUploadManagedFolder('AUDIT_HEAD', 'documents'), true);
  assert.equal(authorization.canUploadManagedFolder('STUDENT', 'news'), false);
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
