import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('student guide renders an isolated public suggestion callout with required feedback states', async () => {
  const [guide, callout, service] = await Promise.all([
    read('src/pages/StudentGuide.tsx'),
    read('src/components/GuideSuggestionCallout.tsx'),
    read('src/services/guideSuggestionService.ts'),
  ]);

  assert.match(guide, /import GuideSuggestionCallout/);
  assert.match(guide, /<GuideSuggestionCallout\s*\/>/);
  assert.match(callout, /هل لديك إضافة أو تصحيح؟ اقترح تعديلاً/);
  assert.match(callout, /submitGuideSuggestion/);
  assert.match(callout, /validateGuideSuggestionInput/);
  assert.match(callout, /اسم الطالب/);
  assert.match(callout, /موضوع الاقتراح/);
  assert.match(callout, /الشرح أو التفاصيل/);
  assert.match(callout, /جاري الإرسال/);
  assert.match(callout, /شكراً لك، تم إرسال اقتراحك بنجاح/);
  assert.match(service, /createGuideSuggestionRepository/);
  assert.doesNotMatch(service, /contact_messages|submitContactMessage|addSuggestion/);
});

test('administration dashboard exposes guide suggestions only through the president or academic-head gate', async () => {
  const [dashboard, panel] = await Promise.all([
    read('src/pages/AdminDashboard.tsx'),
    read('src/components/GuideSuggestionsPanel.tsx'),
  ]);

  assert.match(dashboard, /'guide-suggestions'/);
  assert.match(dashboard, /label: 'اقتراحات الدليل'/);
  assert.match(dashboard, /canManageGuideSuggestions\(currentUser\?\.role\)/);
  assert.match(dashboard, /<GuideSuggestionsPanel/);
  assert.match(panel, /canManageGuideSuggestions/);
  assert.match(panel, /listGuideSuggestions/);
  assert.match(panel, /updateGuideSuggestionStatus/);
  assert.match(panel, /deleteGuideSuggestion/);
  for (const status of ['PENDING', 'REVIEWING', 'IMPLEMENTED', 'REJECTED']) assert.match(panel, new RegExp(status));
  assert.match(panel, /قيد المراجعة/);
  assert.match(panel, /تم التنفيذ/);
  assert.match(panel, /مرفوض/);
});

test('existing contact, member suggestion, and join application screens remain independent', async () => {
  const [contact, studentDashboard] = await Promise.all([
    read('src/pages/ContactPage.tsx'),
    read('src/pages/StudentDashboard.tsx'),
  ]);

  assert.doesNotMatch(contact, /guideSuggestion|guide_suggestions/i);
  assert.doesNotMatch(studentDashboard, /guideSuggestion|guide_suggestions/i);
});
