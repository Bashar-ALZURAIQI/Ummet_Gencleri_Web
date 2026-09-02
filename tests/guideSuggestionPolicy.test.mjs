import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canManageGuideSuggestions,
  validateGuideSuggestionInput,
} from '../src/domain/guideSuggestionPolicy.ts';

test('normalizes valid guide suggestion fields before submission', () => {
  const result = validateGuideSuggestionInput({
    studentName: '  أحمد محمد  ',
    subject: '  تصحيح عنوان السكن  ',
    description: '  العنوان المذكور يحتاج إلى تحديث.  ',
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      studentName: 'أحمد محمد',
      subject: 'تصحيح عنوان السكن',
      description: 'العنوان المذكور يحتاج إلى تحديث.',
    },
  });
});

test('rejects whitespace-only required guide suggestion fields', () => {
  const result = validateGuideSuggestionInput({ studentName: ' ', subject: '\n', description: '\t' });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, {
    studentName: 'اسم الطالب مطلوب.',
    subject: 'موضوع الاقتراح مطلوب.',
    description: 'الشرح أو التفاصيل مطلوبة.',
  });
});

test('rejects values beyond the database length limits', () => {
  const result = validateGuideSuggestionInput({
    studentName: 'س'.repeat(121),
    subject: 'م'.repeat(201),
    description: 'د'.repeat(4001),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['description', 'studentName', 'subject']);
});

test('permits only the president and academic head to manage guide suggestions', () => {
  assert.equal(canManageGuideSuggestions('PRESIDENT'), true);
  assert.equal(canManageGuideSuggestions('ACADEMIC_HEAD'), true);
  assert.equal(canManageGuideSuggestions('VICE_PRESIDENT'), false);
  assert.equal(canManageGuideSuggestions('MEDIA_HEAD'), false);
  assert.equal(canManageGuideSuggestions('STUDENT'), false);
  assert.equal(canManageGuideSuggestions(null), false);
});
