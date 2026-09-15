import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGuideLinkTitle,
  hostnameOfGuideLink,
  isBlockedNetworkAddress,
  isIpLiteralHost,
  normalizeGuideLinkUrl,
  resolveGuideLinkWithAdapter,
  sanitizeGuideLinkTitle,
} from '../src/domain/guideLinkMetadata.ts';

// ---------------------------------------------------------------------------
// Small in-memory adapter (mirrors the Edge Function wiring 1:1)
// ---------------------------------------------------------------------------

const PG = (() => {
  const rows = new Map();
  return {
    add(host, records) {
      rows.set(host.toLowerCase(), records);
    },
    lookup(host) {
      return rows.get(host.toLowerCase()) ?? [];
    },
    href(site, url) {
      return `${site}${url}`;
    },
    html({ title }) {
      return `<!doctype html><html><head><title>${title}</title></head><body>مرحباً</body></html>`;
    },
    htmlOg({ title }) {
      return `<!doctype html><html><head><meta property="og:title" content="${title}"><title>ignored</title></head></html>`;
    },
  };
})();

const siteA = 'https://www1.atauni.edu.tr';
const siteB = 'https://guide.ummetgencleri.org';
const siteBlocked = 'http://192.168.1.10';
const siteMalform = 'https://[::1]';

PG.add('www1.atauni.edu.tr', ['193.140.4.210']);
PG.add('guide.ummetgencleri.org', ['172.16.9.9']);
PG.add('nft-gateway.example', ['2606:4700::6810:84e5']);

function makeFetchRouter(sites) {
  return async (url) => {
    for (const site of sites) {
      if (url.startsWith(site.base)) {
        const path = url.slice(site.base.length) || '/';
        const route = site.routes.find((r) => r.path === path);
        if (route) {
          return { status: route.status, location: route.location ?? null, body: route.body ?? '' };
        }
      }
    }
    throw new Error(`UNEXPECTED_URL: ${url}`);
  };
}

function makeMockAdapter(sites) {
  const fetchOnce = makeFetchRouter(sites);
  return {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async (hostname) => PG.lookup(hostname),
    fetchOnce,
  };
}

// ---------------------------------------------------------------------------
// 1. URL normalization
// ---------------------------------------------------------------------------

test('1. normalizeGuideLinkUrl accepts bare domains and extends to https', () => {
  assert.equal(normalizeGuideLinkUrl('facebook.com'), 'https://facebook.com/');
  assert.equal(normalizeGuideLinkUrl('https://guide.ummetgencleri.org/start'), 'https://guide.ummetgencleri.org/start');
  assert.equal(normalizeGuideLinkUrl('  https://www.atauni.edu.tr  '), 'https://www.atauni.edu.tr/');
});

test('2. normalizeGuideLinkUrl rejects non-http(s), empty, and scheme-less bad input', () => {
  assert.equal(normalizeGuideLinkUrl(''), null);
  assert.equal(normalizeGuideLinkUrl('   '), null);
  assert.equal(normalizeGuideLinkUrl('ftp://files.example.com'), null);
  assert.equal(normalizeGuideLinkUrl('javascript:alert(1)'), null);
  assert.equal(normalizeGuideLinkUrl('file:///etc/passwd'), null);
  assert.equal(normalizeGuideLinkUrl('tel:+905550000000'), null);
});

// ---------------------------------------------------------------------------
// 2. IP-literal and network classification (SSRF hardening)
// ---------------------------------------------------------------------------

test('3. loopback and RFC1918 targets are blocked', () => {
  assert.equal(isBlockedNetworkAddress('127.0.0.1'), true);
  assert.equal(isBlockedNetworkAddress('127.0.0.0'), true);
  assert.equal(isBlockedNetworkAddress('10.0.0.5'), true);
  assert.equal(isBlockedNetworkAddress('172.16.0.1'), true);
  assert.equal(isBlockedNetworkAddress('172.31.255.254'), true);
  assert.equal(isBlockedNetworkAddress('192.168.1.10'), true);
});

test('4. cloud metadata (169.254.169.254), link-local, CGNAT, multicast are blocked', () => {
  assert.equal(isBlockedNetworkAddress('169.254.169.254'), true);
  assert.equal(isBlockedNetworkAddress('169.254.0.1'), true);
  assert.equal(isBlockedNetworkAddress('100.64.0.1'), true);
  assert.equal(isBlockedNetworkAddress('224.0.0.1'), true);
  assert.equal(isBlockedNetworkAddress('240.0.0.1'), true);
  assert.equal(isBlockedNetworkAddress('0.0.0.0'), true);
});

test('5. IPv6 loopback, ULA, link-local, and IPv4-mapped forms are blocked', () => {
  assert.equal(isBlockedNetworkAddress('::1'), true);
  assert.equal(isBlockedNetworkAddress('::'), true);
  assert.equal(isBlockedNetworkAddress('fe80::1'), true);
  assert.equal(isBlockedNetworkAddress('fc00::1'), true);
  assert.equal(isBlockedNetworkAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedNetworkAddress('::ffff:192.168.1.10'), true);
  assert.equal(isBlockedNetworkAddress('[::ffff:10.0.0.1]'), true);
});

test('6. public addresses and hostnames are not blocked', () => {
  assert.equal(isBlockedNetworkAddress('193.140.4.210'), false);
  assert.equal(isBlockedNetworkAddress('8.8.8.8'), false);
  assert.equal(isBlockedNetworkAddress('2606:4700::6810:84e5'), false);
  assert.equal(isIpLiteralHost('193.140.4.210'), true);
  assert.equal(isIpLiteralHost('www.atauni.edu.tr'), false);
  assert.equal(isBlockedNetworkAddress('www.atauni.edu.tr'), true);
});

// ---------------------------------------------------------------------------
// 3. HTML metadata extraction + sanitization
// ---------------------------------------------------------------------------

test('7. html title extraction (html <title>)', () => {
  assert.equal(
    extractGuideLinkTitle('<html><head><title>   جامعة أتاتورك   | الرئيسية </title></head></html>'),
    'جامعة أتاتورك | الرئيسية',
  );
});

test('8. og:title wins over <title>', () => {
  assert.equal(
    extractGuideLinkTitle('<head><meta property="og:title" content="أكارسو — الصفحة الرسمية"><title>ignored</title></head>'),
    'أكارسو — الصفحة الرسمية',
  );
});

test('9. entities are decoded and markup is stripped', () => {
  assert.equal(extractGuideLinkTitle('<title>Kayıt &amp; Ders &lt;2026&gt;</title>'), 'Kayıt & Ders <2026>');
  assert.equal(extractGuideLinkTitle('<title>A<b>B</b></title>'), 'A B');
});

test('10. script/style/tags are scrubbed and long titles are truncated', () => {
  const out = extractGuideLinkTitle('<title><script>alert(1)</script>Clean &amp; Title</title>');
  assert.equal(out, 'Clean & Title');
  const long = sanitizeGuideLinkTitle(`x${'y'.repeat(200)}`);
  assert.ok(long !== null && long.length <= 120);
});

test('11. empty and non-HTML input yields null', () => {
  assert.equal(extractGuideLinkTitle(''), null);
  assert.equal(extractGuideLinkTitle('<html><head></head></html>'), null);
  assert.equal(extractGuideLinkTitle(null), null);
});

// ---------------------------------------------------------------------------
// 4. Resolution orchestrator (success paths)
// ---------------------------------------------------------------------------

test('12. resolves title from a public site (hostname + single hop)', async () => {
  const adapter = makeMockAdapter([
    {
      base: siteA,
      routes: [
        { path: '/', status: 200, body: PG.html({ title: 'Atatürk University', site: siteA }) },
      ],
    },
  ]);
  const result = await resolveGuideLinkWithAdapter(`${siteA}/`, adapter);
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.title, 'Atatürk University');
  assert.equal(result.host, 'www1.atauni.edu.tr');
});

test('13. HTTP 301 redirect chain passes each hop validation and finalizes on target host', async () => {
  const adapter = makeMockAdapter([
    { base: siteB, routes: [{ path: '/start', status: 301, location: `${siteA}/landing`, body: '' }] },
    { base: siteA, routes: [{ path: '/landing', status: 200, body: PG.html({ title: 'Atauni Landing', site: siteA }) }] },
  ]);
  PG.add(siteB.replace('https://', ''), ['203.0.113.7']);
  const result = await resolveGuideLinkWithAdapter(`${siteB}/start`, adapter);
  assert.equal(result.ok, true);
  assert.equal(result.title, 'Atauni Landing');
  assert.equal(result.host, 'www1.atauni.edu.tr');
  assert.equal(result.finalUrl, `${siteA}/landing`);
});

test('14. bare hostname input resolves (https extension) and uses og:title', async () => {
  const adapter = makeMockAdapter([
    { base: siteA, routes: [{ path: '/', status: 200, body: PG.htmlOg({ title: 'Atauni Open Graph Title', site: siteA }) }] },
  ]);
  const result = await resolveGuideLinkWithAdapter('www1.atauni.edu.tr', adapter);
  assert.equal(result.ok, true);
  assert.equal(result.title, 'Atauni Open Graph Title');
});

// ---------------------------------------------------------------------------
// 5. Blocked / failure paths
// ---------------------------------------------------------------------------

test('15. localhost and loopback hostnames are blocked before any fetch', async () => {
  let fetched = false;
  const adapter = {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async () => ['127.0.0.1'],
    fetchOnce: async () => {
      fetched = true;
      return { status: 200, location: null, body: '<title>internal</title>' };
    },
  };
  const result = await resolveGuideLinkWithAdapter('http://localhost/admin', adapter);
  assert.equal(result.blocked, true);
  assert.equal(result.ok, false);
  assert.equal(fetched, false);
});

test('16. DNS resolving to a private IP is blocked before fetch', async () => {
  let fetched = false;
  const adapter = {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async () => ['192.168.1.10'],
    fetchOnce: async () => {
      fetched = true;
      return { status: 200, location: null, body: '<title>lan</title>' };
    },
  };
  const result = await resolveGuideLinkWithAdapter('http://intranet.lan/', adapter);
  assert.equal(result.blocked, true);
  assert.equal(fetched, false);
});

test('17. excel-embedded IP-literal and IPv4-mapped loopback render blocked', async () => {
  const adapter = makeMockAdapter([]);
  const rIp = await resolveGuideLinkWithAdapter('http://169.254.169.254/latest/meta-data/', adapter);
  assert.equal(rIp.blocked, true);
  const rV6 = await resolveGuideLinkWithAdapter('http://[::1]/', adapter);
  assert.equal(rV6.blocked, true);
});

test('18. redirects into a private network are blocked (no fetch to internal target)', async () => {
  let internalFetched = false;
  const adapter = {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async (host) => (host === 'public.example' ? ['93.184.216.34'] : []),
    fetchOnce: async (url) => {
      if (url.startsWith('http://192.168.1.10')) {
        internalFetched = true;
        return { status: 200, location: null, body: '<title>private</title>' };
      }
      return { status: 302, location: 'http://192.168.1.10/admin', body: '' };
    },
  };
  const result = await resolveGuideLinkWithAdapter('http://public.example/', adapter);
  assert.equal(result.blocked, true);
  assert.equal(internalFetched, false);
});

test('19. DNS failure + network failure degrade to an ok:false hostname fallback (never throws)', async () => {
  const adapter = {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async () => ([]),
    fetchOnce: async () => {
      throw new Error('ECONNREFUSED');
    },
  };
  const result = await resolveGuideLinkWithAdapter('https://non-existent-domain.example/', adapter);
  assert.equal(result.ok, false);
  assert.equal(result.blocked, false);
  assert.equal(result.host, 'non-existent-domain.example');
  assert.equal(result.title, null);
});

test('20. non-2xx responses degrade to hostname fallback', async () => {
  const adapter = makeMockAdapter([
    { base: siteA, routes: [{ path: '/', status: 404, body: '<title>lost</title>' }] },
  ]);
  const result = await resolveGuideLinkWithAdapter(`${siteA}/`, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.title, null);
  assert.equal(result.host, 'www1.atauni.edu.tr');
});

test('21. redirect limit is bounded', async () => {
  let calls = 0;
  const adapter = {
    makeTimeoutSignal: () => new AbortController().signal,
    lookupAddresses: async () => ['93.184.216.34'],
    fetchOnce: async () => {
      calls += 1;
      return { status: 302, location: siteA, body: '' };
    },
  };
  const result = await resolveGuideLinkWithAdapter('http://loop.example/', adapter);
  assert.equal(result.ok, false);
  assert.ok(calls <= 6);
});

// ---------------------------------------------------------------------------
// 6. StudentGuide wiring sanity
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. Hostname display helpers
// ---------------------------------------------------------------------------

test('22. hostnameOfGuideLink strips scheme/www for the display host', () => {
  assert.equal(hostnameOfGuideLink('https://www.atauni.edu.tr/tr'), 'atauni.edu.tr');
  assert.equal(hostnameOfGuideLink('guide.ummetgencleri.org'), 'guide.ummetgencleri.org');
  assert.equal(hostnameOfGuideLink(''), '');
});