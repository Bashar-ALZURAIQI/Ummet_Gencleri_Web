import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeGoogleMapsInput } = await import('../src/domain/contactMap.ts');

test('accepts a direct Google Maps embed URL and derives its public link', () => {
  assert.deepEqual(
    normalizeGoogleMapsInput('https://www.google.com/maps?q=Erzurum&output=embed'),
    {
      ok: true,
      embedUrl: 'https://www.google.com/maps?q=Erzurum&output=embed',
      openUrl: 'https://www.google.com/maps?q=Erzurum',
    },
  );
});

test('extracts only the src from pasted Google Maps iframe markup', () => {
  assert.deepEqual(
    normalizeGoogleMapsInput('<iframe width="600" src="https://www.google.com/maps/embed?pb=abc" loading="lazy"></iframe>'),
    {
      ok: true,
      embedUrl: 'https://www.google.com/maps/embed?pb=abc',
      openUrl: 'https://www.google.com/maps/embed?pb=abc',
    },
  );
});

test('rejects non-HTTPS and non-Google map sources', () => {
  const expected = { ok: false, error: 'رابط الخريطة يجب أن يكون من Google Maps عبر HTTPS.' };
  assert.deepEqual(normalizeGoogleMapsInput('http://www.google.com/maps?q=Erzurum'), expected);
  assert.deepEqual(normalizeGoogleMapsInput('<iframe src="https://evil.example/phish"></iframe>'), expected);
  assert.deepEqual(normalizeGoogleMapsInput('https://www.google.com/search?q=Erzurum'), expected);
});

test('rejects malformed iframe markup without a quoted src', () => {
  assert.deepEqual(normalizeGoogleMapsInput('<iframe title="map"></iframe>'), {
    ok: false,
    error: 'تعذر استخراج رابط الخريطة من القيمة المدخلة.',
  });
});
