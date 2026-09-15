/**
 * Pure, dependency-free helpers for resolving a human-readable title for
 * guide contact links and for hardening the resolution against SSRF.
 *
 * The orchestrator (`resolveGuideLinkWithAdapter`) re-validates DNS results and
 * every HTTP(S) redirect hop before fetching, and degrades to a sanitized
 * hostname fallback on any failure so editors are never blocked from saving.
 */

const MAX_TITLE_LENGTH = 120;

// ---------------------------------------------------------------------------
// URL normalization (strict http/https with a real hostname only)
// ---------------------------------------------------------------------------

export function normalizeGuideLinkUrl(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  if (!hasScheme) {
    candidate = `https://${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  if (!url.hostname) return null;

  return url.toString();
}

export function hostnameOfGuideLink(input: string): string {
  const normalized = normalizeGuideLinkUrl(input);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isIpLiteralHost(hostname: string): boolean {
  const h = (hostname ?? '').trim().toLowerCase();
  if (!h) return false;
  if (h.includes(':')) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

export function isBlockedLoopbackHostname(hostname: string): boolean {
  const h = (hostname ?? '').trim().toLowerCase();
  return (
    h === 'localhost' ||
    h === 'localhost.localdomain' ||
    h === 'ip6-localhost' ||
    h === 'ip6-loopback'
  );
}

// ---------------------------------------------------------------------------
// IP classification (loopback, RFC1918, link-local, metadata, CGNAT, multicast)
// ---------------------------------------------------------------------------

function isBlockedIPv4(octets: readonly number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 127) return true; // 127.0.0.0/8 loopback (incl. 127.0.0.1)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function parseIPv4(input: string): number[] | null {
  const parts = input
    .trim()
    .toLowerCase()
    .split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return null;
  }
  return octets;
}

/** Expands an IPv6 address into 8 lowercase zero-padded hex groups, or null. */
function expandIPv6(input: string): string[] | null {
  let raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const zoneIndex = raw.indexOf('%');
  if (zoneIndex !== -1) raw = raw.slice(0, zoneIndex);
  if (raw.includes(':::')) return null;

  let embeddedTail: string[] = [];
  const lastColon = raw.lastIndexOf(':');
  const afterLastColon = lastColon === -1 ? raw : raw.slice(lastColon + 1);
  const hasEmbeddedIPv4 = afterLastColon.includes('.');
  if (hasEmbeddedIPv4) {
    const v4 = parseIPv4(afterLastColon);
    if (!v4) return null;
    embeddedTail = [
      ((v4[0] << 8) | v4[1]).toString(16),
      ((v4[2] << 8) | v4[3]).toString(16),
    ];
    raw = raw.slice(0, lastColon);
  }

  const segments = raw.split('::');
  if (segments.length > 2) return null;

  const left = segments[0] ? segments[0].split(':').filter(Boolean) : [];
  const right = segments.length === 2 && segments[1] ? segments[1].split(':').filter(Boolean) : [];

  let groups: string[];
  if (segments.length === 1) {
    if (left.length + embeddedTail.length !== 8) return null;
    groups = [...left, ...embeddedTail];
  } else {
    const fill = 8 - (left.length + right.length + embeddedTail.length);
    if (fill < 1) return null;
    groups = [...left, ...Array<string>(fill).fill('0'), ...right, ...embeddedTail];
  }

  if (groups.length !== 8) return null;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  }
  return groups.map((g) => g.padStart(4, '0'));
}

function ipv4FromIpv6HexTail(hi: string, lo: string): number[] {
  const high = parseInt(hi, 16);
  const low = parseInt(lo, 16);
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
}

export function isBlockedNetworkAddress(address: string): boolean {
  const addr = (address ?? '').trim().toLowerCase();
  if (!addr) return true;

  // IPv4 (plain dotted quad or malformed-with-dots: fail closed)
  if (addr.includes('.')) {
    const octets = parseIPv4(addr);
    return octets ? isBlockedIPv4(octets) : true;
  }

  const groups = expandIPv6(addr);
  if (!groups) return true;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const isIpv4Mapped =
    groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff';
  if (isIpv4Mapped) {
    return isBlockedIPv4(ipv4FromIpv6HexTail(groups[6], groups[7]));
  }

  // Unspecified (::) and loopback (::1)
  if (groups.every((g) => g === '0000')) return true;
  if (groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001') return true;

  const first = parseInt(groups[0], 16);
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7 ULA
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 link-local

  // 6to4 + IPv4-embedded addresses could hide private v4; fail closed for safety.
  if (first >= 0x0064 && first <= 0x0064 && groups[1] === 'ff9b') return true; // NAT64 well-known
  return false;
}

// ---------------------------------------------------------------------------
// HTML metadata extraction (og:title -> <title> -> null)
// ---------------------------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function stripControlCharacters(src: string): string {
  let out = '';
  for (const ch of src) {
    const code = ch.charCodeAt(0);
    // Keep whitespace controls (Tab, LF, FF, CR) and regular space.
    const isWhitespace = code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;
    if (code < 0x20) {
      if (!isWhitespace) continue;
    } else if (code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      continue;
    }
    out += ch;
  }
  return out;
}

export function sanitizeGuideLinkTitle(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<[^>]*>/g, ' ');
  text = decodeEntities(text);
  text = stripControlCharacters(text);
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length > MAX_TITLE_LENGTH) {
    text = text.slice(0, MAX_TITLE_LENGTH).trim();
  }
  return text;
}

const OG_TITLE_PATTERNS = [
  /<meta[^>]+property=["']og:title["'][^>]*>/gi,
  /<meta[^>]+name=["']og:title["'][^>]*>/gi,
];

function extractMetaTagContent(html: string): string | null {
  for (const pattern of OG_TITLE_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;
    const content = /content=["']([^"']*)["']/i.exec(match[0]);
    if (content && content[1]) return content[1];
  }
  return null;
}

export function extractGuideLinkTitle(html: string): string | null {
  if (typeof html !== 'string') return null;
  const bounded = html.slice(0, 400000);

  const metaSubject = extractMetaTagContent(bounded);
  if (metaSubject !== null) {
    const fromMeta = sanitizeGuideLinkTitle(metaSubject);
    if (fromMeta !== null) return fromMeta;
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(bounded);
  if (titleMatch) {
    const fromTitle = sanitizeGuideLinkTitle(titleMatch[1]);
    if (fromTitle !== null) return fromTitle;
  }

  return null;
}

// ---------------------------------------------------------------------------
// SSRF-hardened resolution orchestrator (adapter-injected, fully unit-testable)
// ---------------------------------------------------------------------------

export interface GuideLinkHttpResponse {
  status: number;
  location: string | null;
  body: string;
}

export interface GuideLinkFetchAdapter {
  makeTimeoutSignal(timeoutMs: number): AbortSignal;
  lookupAddresses(hostname: string, signal: AbortSignal | undefined): Promise<string[]>;
  fetchOnce(url: string, signal: AbortSignal | undefined): Promise<GuideLinkHttpResponse>;
}

export interface GuideLinkMetadataResult {
  ok: boolean;
  title: string | null;
  host: string;
  finalUrl: string;
  blocked: boolean;
}

export interface GuideLinkResolutionOptions {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export async function resolveGuideLinkWithAdapter(
  input: string,
  adapter: GuideLinkFetchAdapter,
  options: GuideLinkResolutionOptions = {},
): Promise<GuideLinkMetadataResult> {
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 5000;

  const normalized = normalizeGuideLinkUrl(input);
  const fallbackHost = normalized ? hostnameOfGuideLink(normalized) : '';
  const failure = (blocked: boolean): GuideLinkMetadataResult => ({
    ok: false,
    title: null,
    host: fallbackHost,
    finalUrl: '',
    blocked,
  });

  if (!normalized) return failure(false);

  const timeout = adapter.makeTimeoutSignal(timeoutMs);

  try {
    let current = normalized;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const parsed = new URL(current);
      const hostname = parsed.hostname.toLowerCase();

      if (isIpLiteralHost(hostname)) {
        if (isBlockedNetworkAddress(hostname)) return failure(true);
      } else {
        if (isBlockedLoopbackHostname(hostname)) return failure(true);
        let addresses: string[];
        try {
          addresses = await adapter.lookupAddresses(hostname, timeout);
        } catch {
          addresses = [];
        }
        if (!addresses || addresses.length === 0) return failure(false);
        if (addresses.every((address) => isBlockedNetworkAddress(address))) return failure(true);
      }

      const response = await adapter.fetchOnce(current, timeout);

      if (response.status >= 300 && response.status < 400 && response.location) {
        const rawNext = new URL(response.location, current).toString();
        const nextNormalized = normalizeGuideLinkUrl(rawNext);
        if (!nextNormalized) return failure(true);
        current = nextNormalized;
        continue;
      }

      if (response.status < 200 || response.status >= 300) return failure(false);

      const body = typeof response.body === 'string' ? response.body.slice(0, maxBytes) : '';
      const title = extractGuideLinkTitle(body);
      const finalHost = new URL(current).hostname.replace(/^www\./, '');
      return { ok: true, title, host: finalHost, finalUrl: current, blocked: false };
    }
    return failure(false);
  } catch {
    // Transport errors, DNS failures, aborts, and timeouts all degrade to the
    // safe hostname fallback instead of blocking the editor's save.
    return failure(false);
  }
}