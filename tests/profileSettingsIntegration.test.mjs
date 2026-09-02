import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('both dashboards use shared profile settings and remove the duplicate modal', async () => {
  const [admin, student] = await Promise.all([
    read('../src/pages/AdminDashboard.tsx'),
    read('../src/pages/StudentDashboard.tsx'),
  ]);
  assert.match(admin, /<ProfileSettings/);
  assert.match(student, /<ProfileSettings/);
  assert.doesNotMatch(student, /function\s+EditProfileModal/);
  assert.doesNotMatch(admin, /members\.find\(\(m\)\s*=>\s*emailKey/);
});

test('shared settings keeps identity read-only and securely manages passwords and previews', async () => {
  const source = await read('../src/components/ProfileSettings.tsx');
  assert.match(source, /بريد الدخول/);
  assert.match(source, /بريد التواصل/);
  assert.match(source, /readOnly/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /mountedRef\.current\s*=\s*true/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('context exposes persistent wrappers and removes local optimistic profile mutation', async () => {
  const source = await read('../src/context/AppContext.tsx');
  assert.match(source, /createOwnProfileOperations/);
  assert.match(source, /uploadOwnAvatar/);
  assert.match(source, /deleteOwnAvatar/);
  assert.match(source, /changeOwnPassword/);
  assert.doesNotMatch(source, /const updateStudentProfile:[\s\S]*?setCurrentStudent\(\(prev\)/);
  assert.doesNotMatch(source, /const updateOwnProfile:[\s\S]*?setMembers\(\(prev\)/);
});

test('profile handlers use one atomic confirmed Auth owner and never compose render state with a live epoch', async () => {
  const context = await read('../src/context/AppContext.tsx');
  assert.match(context, /new ConfirmedAuthOwnerStore\(\)/);
  assert.match(context, /const owner = captureConfirmedAuthOwner\(\)/);
  assert.match(context, /clearConfirmedAuthOwnership\(\);[\s\S]*?authEpoch\.beginEvent\(\)/);
  assert.doesNotMatch(context, /currentUserRef/);
  assert.doesNotMatch(context, /const capturedEpoch = authEpoch\.capture\(\);[\s\S]*?currentUser/);
});

test('password verification and update are isolated while every main USER_UPDATED keeps normal gating', async () => {
  const [context, service, client, isolatedClient] = await Promise.all([
    read('../src/context/AppContext.tsx'),
    read('../src/services/accountService.ts'),
    read('../src/lib/supabase.ts'),
    read('../src/domain/isolatedAuthClient.ts'),
  ]);
  assert.doesNotMatch(context, /ExpectedUserUpdated|expectedUserUpdated/);
  assert.match(service, /createVerificationClient:\s*createPasswordVerificationClient/);
  assert.doesNotMatch(service, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(service, /supabase\.auth\.updateUser/);
  assert.match(client, /createIsolatedAuthClient/);
  assert.match(isolatedClient, /persistSession:\s*false/);
  assert.match(isolatedClient, /autoRefreshToken:\s*false/);
  assert.match(isolatedClient, /detectSessionInUrl:\s*false/);
});

test('profile refresh is background-only while assignment and channel errors retain authority gating', async () => {
  const [context, subscription] = await Promise.all([
    read('../src/context/AppContext.tsx'),
    read('../src/domain/realtimeIdentitySubscription.ts'),
  ]);
  assert.match(context, /refreshOwnProfileInBackground/);
  assert.match(context, /changeKind\s*===\s*'profile'/);
  assert.match(context, /refreshCurrentSessionIdentity\(subscribedRole\)/);
  assert.match(subscription, /requestConfirmedRefresh\('profile'\)/);
  assert.match(subscription, /requestConfirmedRefresh\('assignment'\)/);
  assert.doesNotMatch(context, /refreshOwnIdentityAfterMutation/);
});

test('dashboard editor state and independent operation banners survive authoritative refreshes', async () => {
  const [admin, student, settings, context] = await Promise.all([
    read('../src/pages/AdminDashboard.tsx'),
    read('../src/pages/StudentDashboard.tsx'),
    read('../src/components/ProfileSettings.tsx'),
    read('../src/context/AppContext.tsx'),
  ]);
  assert.match(admin, /if\s*\(authInitializing\s*\|\|\s*identityRefreshing\)\s*return/);
  assert.match(student, /operationResults=/);
  assert.match(admin, /operationResults=/);
  assert.match(settings, /operationResults\.profile/);
  assert.match(settings, /operationResults\.avatar/);
  assert.match(settings, /operationResults\.password/);
  assert.match(context, /ownProfileOperationResults/);
});
