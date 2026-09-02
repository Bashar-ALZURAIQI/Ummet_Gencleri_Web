import test from 'node:test';
import assert from 'node:assert/strict';

const {
  validateGuideSection,
  validateGuideItem,
  validateGuideContact,
  validateFaqCategory,
  validateFaqItem,
} = await import('../src/domain/cmsValidation.ts');

test('completed guide and FAQ forms validate their actual state fields', () => {
  assert.deepEqual(
    validateGuideSection({ label: 'السكن', title: 'دليل السكن', intro: 'مقدمة واضحة' }),
    { valid: true, invalid: [] },
  );
  assert.deepEqual(
    validateGuideItem({ heading: 'المواصلات', body: 'شرح المواصلات' }),
    { valid: true, invalid: [] },
  );
  assert.deepEqual(
    validateGuideContact({ label: 'مكتب الطلاب', value: '+90 555 000 0000' }),
    { valid: true, invalid: [] },
  );
  assert.deepEqual(validateFaqCategory({ title: 'التسجيل' }), { valid: true, invalid: [] });
  assert.deepEqual(
    validateFaqItem({ question: 'كيف أسجل؟', answer: 'من صفحة التسجيل' }),
    { valid: true, invalid: [] },
  );
});

test('blank required values map to the visible input identifiers', () => {
  assert.deepEqual(
    validateGuideSection({ label: ' ', title: '', intro: 'مقدمة' }),
    { valid: false, invalid: ['secLabel', 'secTitle'] },
  );
  assert.deepEqual(
    validateGuideItem({ heading: '  ', body: 'شرح' }),
    { valid: false, invalid: ['itemHeading'] },
  );
  assert.deepEqual(
    validateGuideContact({ label: 'المكتب', value: '\n' }),
    { valid: false, invalid: ['contactValue'] },
  );
  assert.deepEqual(validateFaqCategory({ title: '\t' }), { valid: false, invalid: ['catTitle'] });
  assert.deepEqual(
    validateFaqItem({ question: 'السؤال', answer: ' ' }),
    { valid: false, invalid: ['qAnswer'] },
  );
});
