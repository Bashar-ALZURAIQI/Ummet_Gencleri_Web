import test from 'node:test';
import assert from 'node:assert/strict';

const state = await import('../src/domain/managedFileFieldState.ts');

test('valid selection creates preview and revokes the previous temporary preview', () => {
  const previous = { ...state.initialManagedFileFieldState('https://old.example/image.jpg'), previewUrl: 'blob:old' };
  const result = state.selectManagedFile(previous, { name: 'new.jpg', type: 'image/jpeg', size: 1024 }, 'blob:new');
  assert.equal(result.revokePreviewUrl, 'blob:old');
  assert.equal(result.state.previewUrl, 'blob:new');
  assert.equal(result.state.file.name, 'new.jpg');
  assert.equal(result.state.phase, 'selected');
});

test('upload phases disable duplicate submission and preserve current URL on failure', () => {
  const selected = state.selectManagedFile(
    state.initialManagedFileFieldState('https://old.example/image.jpg'),
    { name: 'new.jpg', type: 'image/jpeg', size: 1024 },
    'blob:new',
  ).state;
  const uploading = state.beginManagedFileUpload(selected);
  assert.equal(uploading.phase, 'uploading');
  assert.equal(state.isManagedFileBusy(uploading), true);
  const failed = state.failManagedFileUpload(uploading, 'تعذر الرفع');
  assert.equal(failed.currentUrl, 'https://old.example/image.jpg');
  assert.equal(failed.previewUrl, 'blob:new');
  assert.equal(failed.error, 'تعذر الرفع');
});

test('successful upload adopts confirmed URL and clears temporary selection', () => {
  const selected = state.selectManagedFile(
    state.initialManagedFileFieldState('https://old.example/image.jpg'),
    { name: 'new.jpg', type: 'image/jpeg', size: 1024 },
    'blob:new',
  ).state;
  const result = state.confirmManagedFileUpload(selected, 'https://storage/new.jpg');
  assert.equal(result.revokePreviewUrl, 'blob:new');
  assert.deepEqual(result.state, {
    currentUrl: 'https://storage/new.jpg',
    file: null,
    previewUrl: null,
    phase: 'uploaded',
    progress: 100,
    error: null,
  });
});

test('clearing selection restores current asset without deleting it', () => {
  const selected = state.selectManagedFile(
    state.initialManagedFileFieldState('https://old.example/image.jpg'),
    { name: 'new.jpg', type: 'image/jpeg', size: 1024 },
    'blob:new',
  ).state;
  const result = state.clearManagedFileSelection(selected);
  assert.equal(result.revokePreviewUrl, 'blob:new');
  assert.equal(result.state.currentUrl, 'https://old.example/image.jpg');
  assert.equal(result.state.file, null);
});
