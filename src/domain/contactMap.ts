export type ContactMapNormalizationResult =
  | { ok: true; embedUrl: string; openUrl: string }
  | { ok: false; error: string };

const INVALID_MAP_ERROR = 'رابط الخريطة يجب أن يكون من Google Maps عبر HTTPS.';

function extractInputUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.toLowerCase().includes('<iframe')) return trimmed;
  return trimmed.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim() || null;
}

export function normalizeGoogleMapsInput(input: string): ContactMapNormalizationResult {
  const candidate = extractInputUrl(input);
  if (!candidate) {
    return { ok: false, error: 'تعذر استخراج رابط الخريطة من القيمة المدخلة.' };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: INVALID_MAP_ERROR };
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHost = hostname === 'google.com'
    || hostname === 'www.google.com'
    || hostname === 'maps.google.com';
  if (url.protocol !== 'https:' || !allowedHost || !url.pathname.startsWith('/maps')) {
    return { ok: false, error: INVALID_MAP_ERROR };
  }

  const embedUrl = url.toString();
  const open = new URL(embedUrl);
  open.searchParams.delete('output');
  return {
    ok: true,
    embedUrl,
    openUrl: open.toString(),
  };
}
