import test from 'node:test';
import assert from 'node:assert/strict';

const sidebar = await import('../src/domain/sidebarNavigation.ts');

test('drawer state helpers toggle and close the mobile sidebar', () => {
  assert.deepEqual(sidebar.closeSidebar({ open: true }), { open: false });
  assert.deepEqual(sidebar.toggleSidebar({ open: false }), { open: true });
});

test('only Escape requests a mobile sidebar close', () => {
  assert.equal(sidebar.shouldCloseSidebarForKey('Escape'), true);
  assert.equal(sidebar.shouldCloseSidebarForKey('Enter'), false);
});
