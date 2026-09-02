import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveStudentAccess, canUseMemberFeatures, resolveEventRegistrationAction } = await import('../src/domain/studentAccess.ts');

test('student access stays closed while the application is loading or missing', () => {
  assert.equal(resolveStudentAccess({ profileStatus: 'inactive', applicationStatus: null, applicationsLoading: true }), 'loading');
  assert.equal(resolveStudentAccess({ profileStatus: 'active', applicationStatus: null, applicationsLoading: false }), 'pending');
  assert.equal(canUseMemberFeatures('loading'), false);
  assert.equal(canUseMemberFeatures('pending'), false);
});

test('pending and interview applications receive their dedicated locked states', () => {
  assert.equal(resolveStudentAccess({ profileStatus: 'inactive', applicationStatus: 'pending', applicationsLoading: false }), 'pending');
  assert.equal(resolveStudentAccess({ profileStatus: 'inactive', applicationStatus: 'interview', applicationsLoading: false }), 'interview');
  assert.equal(canUseMemberFeatures('interview'), false);
});

test('full member features require both an active profile and an accepted application', () => {
  assert.equal(resolveStudentAccess({ profileStatus: 'active', applicationStatus: 'accepted', applicationsLoading: false }), 'accepted');
  assert.equal(resolveStudentAccess({ profileStatus: 'inactive', applicationStatus: 'accepted', applicationsLoading: false }), 'pending');
  assert.equal(canUseMemberFeatures('accepted'), true);
});

test('removed and banned profiles override a stale accepted application', () => {
  for (const profileStatus of ['removed', 'banned']) {
    assert.equal(resolveStudentAccess({ profileStatus, applicationStatus: 'accepted', applicationsLoading: false }), 'removed');
  }
  assert.equal(canUseMemberFeatures('removed'), false);
});

test('a rejected application remains locked rather than falling through to the dashboard', () => {
  assert.equal(resolveStudentAccess({ profileStatus: 'inactive', applicationStatus: 'rejected', applicationsLoading: false }), 'rejected');
  assert.equal(canUseMemberFeatures('rejected'), false);
});

test('event actions check authentication and accepted access before stale registration state', () => {
  assert.equal(resolveEventRegistrationAction({ hasStudent: false, access: 'pending', isRegistered: false, isFull: false }), 'login');
  assert.equal(resolveEventRegistrationAction({ hasStudent: true, access: 'removed', isRegistered: true, isFull: false }), 'locked');
  assert.equal(resolveEventRegistrationAction({ hasStudent: true, access: 'interview', isRegistered: true, isFull: false }), 'locked');
  assert.equal(resolveEventRegistrationAction({ hasStudent: true, access: 'accepted', isRegistered: true, isFull: true }), 'unregister');
  assert.equal(resolveEventRegistrationAction({ hasStudent: true, access: 'accepted', isRegistered: false, isFull: true }), 'full');
  assert.equal(resolveEventRegistrationAction({ hasStudent: true, access: 'accepted', isRegistered: false, isFull: false }), 'register');
});
