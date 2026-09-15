import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeSmartText } from '../src/domain/smartTextLinks.ts';

function linkTexts(text) {
  return tokenizeSmartText(text)
    .filter((token) => token.type === 'link')
    .map((token) => ({ value: token.value, href: token.href }));
}

test('detects protocol URLs with their scheme preserved', () => {
  const links = linkTexts('تفاصيل على https://example.com/apply الآن');
  assert.deepEqual(links, [{ value: 'https://example.com/apply', href: 'https://example.com/apply' }]);
});

test('detects www URLs and prefixes https', () => {
  const links = linkTexts('زر www.ataturk.edu.tr/register اليوم');
  assert.equal(links[0].value, 'www.ataturk.edu.tr/register');
  assert.equal(links[0].href, 'https://www.ataturk.edu.tr/register');
});

test('detects bare domains and prefixes https', () => {
  const links = linkTexts('الموقع الرسمي example.org/tours');
  assert.equal(links[0].value, 'example.org/tours');
  assert.equal(links[0].href, 'https://example.org/tours');
});

test('strips trailing punctuation and Arabic punctuation from URLs', () => {
  const links = linkTexts('راجع https://example.com/page؟ ثم تابع،');
  assert.equal(links[0].value, 'https://example.com/page');
  assert.equal(links[0].href, 'https://example.com/page');
});

test('does not glue Arabic characters onto URLs', () => {
  const links = linkTexts('انظر example.com/testواصل');
  assert.equal(links[0].value, 'example.com/test');
  assert.equal(links[0].href, 'https://example.com/test');
});

test('detects emails as mailto links', () => {
  const links = linkTexts('راسلنا على info@ummet.edu.tr.');
  assert.deepEqual(links, [{ value: 'info@ummet.edu.tr', href: 'mailto:info@ummet.edu.tr' }]);
});

test('preserves plain Arabic text and digits untouched', () => {
  const tokens = tokenizeSmartText('أكثر من 1200 طالب من 24 جامعة عام 2026.');
  assert.deepEqual(tokens, [{ type: 'text', value: 'أكثر من 1200 طالب من 24 جامعة عام 2026.' }]);
});

test('interleaves plain text and links in order', () => {
  const tokens = tokenizeSmartText('سجل في https://a.com ثم راسل b@c.org.');
  assert.deepEqual(tokens.map((t) => t.type), ['text', 'link', 'text', 'link', 'text']);
});