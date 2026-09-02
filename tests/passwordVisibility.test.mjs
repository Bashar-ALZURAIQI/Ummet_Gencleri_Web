import test from 'node:test';
import assert from 'node:assert/strict';

const visibility = await import('../src/domain/passwordVisibility.ts');

test('password visibility toggle alternates the native input type without changing the value', () => {
  const hidden = visibility.passwordVisibilityPresentation(false);
  const shown = visibility.passwordVisibilityPresentation(true);

  assert.deepEqual(hidden, {
    inputType: 'password',
    actionLabel: 'إظهار كلمة المرور',
  });
  assert.deepEqual(shown, {
    inputType: 'text',
    actionLabel: 'إخفاء كلمة المرور',
  });
  assert.equal(visibility.togglePasswordVisibility(false), true);
  assert.equal(visibility.togglePasswordVisibility(true), false);
});
