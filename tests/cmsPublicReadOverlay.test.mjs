import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';

test('1. Canonical null/undefined/primitive returns input as-is', () => {
  assert.equal(overlayLocalizedCmsPayload(null, { title: 'Test' }, 'news'), null);
  assert.equal(overlayLocalizedCmsPayload(undefined, { title: 'Test' }, 'news'), undefined);
  assert.equal(overlayLocalizedCmsPayload('canonical string', { title: 'Test' }, 'news'), 'canonical string');
  assert.equal(overlayLocalizedCmsPayload(42, { title: 'Test' }, 'news'), 42);
  assert.equal(overlayLocalizedCmsPayload(true, { title: 'Test' }, 'news'), true);
});

test('2. Target without schema behaves like standard object overlay for string fields', () => {
  const canon = { foo: 'bar', desc: 'canonical description' };
  const loc = { foo: 'qux', desc: 'localized description' };
  const result = overlayLocalizedCmsPayload(canon, loc);
  assert.deepEqual(result, { foo: 'qux', desc: 'localized description' });
});

test('3. Empty or null localized payload returns canonical untouched', () => {
  const canon = { hero: { title: 'الأصلي', image: 'https://img.jpg' } };
  assert.deepEqual(overlayLocalizedCmsPayload(canon, null, 'site'), canon);
  assert.deepEqual(overlayLocalizedCmsPayload(canon, undefined, 'site'), canon);
  assert.deepEqual(overlayLocalizedCmsPayload(canon, {}, 'site'), canon);
});

test('4. Translatable primitive overlay succeeds (hero.badge, hero.title)', () => {
  const canon = {
    hero: {
      badge: 'شارة أصلية',
      title: 'عنوان أصلي',
      image: 'https://example.com/canonical-hero.jpg',
    },
  };
  const loc = {
    hero: {
      badge: 'Öncü Birlik',
      title: 'Yarının Liderleri',
    },
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.hero.badge, 'Öncü Birlik');
  assert.equal(result.hero.title, 'Yarının Liderleri');
  assert.equal(result.hero.image, 'https://example.com/canonical-hero.jpg');
});

test('5. Non-translatable field in localized payload ignored (hero.image remains canonical)', () => {
  const canon = {
    hero: {
      title: 'عنوان أصلي',
      image: 'https://example.com/canonical-hero.jpg',
    },
  };
  const loc = {
    hero: {
      title: 'Başlık',
      image: 'https://attacker.com/malicious-hero.jpg',
    },
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.hero.title, 'Başlık');
  assert.equal(result.hero.image, 'https://example.com/canonical-hero.jpg');
});

test('6. Deep non-translatable field ignored (brand.logoUrl, brand.logoIcon remain canonical)', () => {
  const canon = {
    brand: {
      name: 'اتحاد أصلي',
      logoUrl: 'https://example.com/logo.png',
      logoIcon: 'Users',
      logoPath: 'branding/logo.png',
    },
    hero: {
      title: 'عنوان أصلي',
    },
  };
  const loc = {
    brand: {
      name: 'Yerel İsim',
      logoUrl: 'https://evil.com/fake-logo.png',
      logoIcon: 'Hacked',
      logoPath: 'evil/path.png',
    },
    hero: {
      title: 'Başlık',
    },
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.hero.title, 'Başlık');
  assert.equal(result.brand.name, 'اتحاد أصلي'); // Brand fields are strictly preserved
  assert.equal(result.brand.logoUrl, 'https://example.com/logo.png');
  assert.equal(result.brand.logoIcon, 'Users');
  assert.equal(result.brand.logoPath, 'branding/logo.png');
});

test('7. Primitive array overlay (guideSections.*.items.*.tips replaces strings by index)', () => {
  const canon = [
    {
      id: 'registration',
      label: 'التسجيل',
      title: 'دليل التسجيل',
      intro: 'مقدمة',
      items: [
        {
          id: 'reg-1',
          heading: 'المستندات',
          body: 'نص المستندات',
          tips: ['جواز السفر', 'الشهادة', 'be or not be'],
        },
      ],
    },
  ];
  const loc = [
    {
      id: 'registration',
      label: 'Kayıt',
      title: 'Kayıt Rehberi',
      intro: 'Giriş',
      items: [
        {
          id: 'reg-1',
          heading: 'Belgeler',
          body: 'Belge açıklaması',
          tips: ['Pasaport', 'Diploma', 'Dil yeterlilik belgesi (TÖMER / YDS - varsa)'],
        },
      ],
    },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'guideSections');
  assert.deepEqual(result[0].items[0].tips, [
    'Pasaport',
    'Diploma',
    'Dil yeterlilik belgesi (TÖMER / YDS - varsa)',
  ]);
});

test('8. Primitive array non-translatable (hero.boardPreview.memberIds remains canonical)', () => {
  const canon = {
    boardPreview: {
      title: 'الهيئة',
      subtitle: 'الهيكل',
      memberIds: ['presidency', 'media'],
    },
  };
  const loc = {
    boardPreview: {
      title: 'Yönetim Kurulu',
      subtitle: 'Yapı',
      memberIds: ['hacked_id_1', 'hacked_id_2'],
    },
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.boardPreview.title, 'Yönetim Kurulu');
  assert.deepEqual(result.boardPreview.memberIds, ['presidency', 'media']);
});

test('9. Array of objects with IDs overlays matching elements', () => {
  const canon = [
    { id: 'ev1', title: 'فعالية 1', location: 'إسطنبول' },
    { id: 'ev2', title: 'فعالية 2', location: 'أنقرة' },
  ];
  const loc = [
    { id: 'ev2', title: 'Etkinlik 2', location: 'Ankara' },
    { id: 'ev1', title: 'Etkinlik 1', location: 'İstanbul' },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'events');
  assert.equal(result[0].title, 'Etkinlik 1');
  assert.equal(result[0].location, 'İstanbul');
  assert.equal(result[1].title, 'Etkinlik 2');
  assert.equal(result[1].location, 'Ankara');
});

test('10. Array of objects with non-translatable fields preserves canonical object fields', () => {
  const canon = [
    {
      id: 'album1',
      title: 'ألبوم كروي',
      coverImage: 'https://example.com/cover.jpg',
      date: '2026-06-15',
      mediaCount: 12,
    },
  ];
  const loc = [
    {
      id: 'album1',
      title: 'Futbol Albümü',
      coverImage: 'https://evil.com/cover.jpg',
      date: '2099-01-01',
      mediaCount: 999,
    },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'galleryAlbums');
  assert.equal(result[0].title, 'Futbol Albümü');
  assert.equal(result[0].coverImage, 'https://example.com/cover.jpg');
  assert.equal(result[0].date, '2026-06-15');
  assert.equal(result[0].mediaCount, 12);
});

test('11. Extra elements in localized array ignored', () => {
  const canon = [
    { id: 'q1', question: 'س1', answer: 'ج1' },
  ];
  const loc = [
    { id: 'q1', question: 'S1', answer: 'C1' },
    { id: 'q_injected', question: 'Injected Q', answer: 'Injected A' },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'faqCategories');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'q1');
});

test('12. Missing elements in localized array fall back to canonical', () => {
  const canon = [
    { id: 'q1', title: 'فئة 1' },
    { id: 'q2', title: 'فئة 2' },
  ];
  const loc = [
    { id: 'q1', title: 'Kategori 1' },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'faqCategories');
  assert.equal(result[0].title, 'Kategori 1');
  assert.equal(result[1].title, 'فئة 2');
});

test('13. Wildcard star schema paths match correctly (guideSections.*.contacts.*.label)', () => {
  const canon = [
    {
      id: 'registration',
      label: 'التسجيل',
      title: 'الدليل',
      intro: 'مقدمة',
      items: [],
      contacts: [
        { id: 'c1', label: 'مكتب الطلاب', value: '+90 555', type: 'phone' },
      ],
    },
  ];
  const loc = [
    {
      id: 'registration',
      label: 'Kayıt',
      title: 'Rehber',
      intro: 'Giriş',
      items: [],
      contacts: [
        { id: 'c1', label: 'Öğrenci İşleri Ofisi', value: '+90 999 (hacked)', type: 'link' },
      ],
    },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'guideSections');
  assert.equal(result[0].contacts[0].label, 'Öğrenci İşleri Ofisi');
  assert.equal(result[0].contacts[0].value, '+90 555');
  assert.equal(result[0].contacts[0].type, 'phone');
});

test('14. Non-translatable boolean or number in localized payload ignored', () => {
  const canon = {
    stats: [
      { icon: 'Users', label: 'أعضاء', value: 12 },
    ],
  };
  const loc = {
    stats: [
      { icon: 'HackedIcon', label: 'Üyeler', value: 99999 },
    ],
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.stats[0].label, 'Üyeler');
  assert.equal(result.stats[0].value, 12);
  assert.equal(result.stats[0].icon, 'Users');
});

test('15. String array overlay falls back to canonical when localized string is empty or whitespace', () => {
  const canon = [
    {
      id: 'registration',
      label: 'التسجيل',
      title: 'الدليل',
      intro: 'مقدمة',
      items: [
        {
          id: 'item1',
          heading: 'عنوان',
          body: 'نص',
          tips: ['نصيحة أصلية 1', 'نصيحة أصلية 2'],
        },
      ],
    },
  ];
  const loc = [
    {
      id: 'registration',
      items: [
        {
          id: 'item1',
          tips: ['Yerel İpucu 1', '   '],
        },
      ],
    },
  ];
  const result = overlayLocalizedCmsPayload(canon, loc, 'guideSections');
  assert.equal(result[0].items[0].tips[0], 'Yerel İpucu 1');
  assert.equal(result[0].items[0].tips[1], 'نصيحة أصلية 2');
});

test('16. Canonical objects are never mutated in place (immutability)', () => {
  const canon = Object.freeze({
    hero: Object.freeze({
      badge: 'أصلي',
      title: 'عنوان',
    }),
  });
  const loc = {
    hero: {
      badge: 'Yerel',
      title: 'Yerel Başlık',
    },
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.hero.badge, 'Yerel');
  assert.equal(canon.hero.badge, 'أصلي');
});

test('17. Localized payload with extra unexpected keys does not pollute canonical object', () => {
  const canon = {
    hero: {
      badge: 'شارة',
      title: 'عنوان',
    },
  };
  const loc = {
    hero: {
      badge: 'Rozet',
      title: 'Başlık',
      untrustedInjection: 'malicious payload',
    },
    untrustedRootKey: true,
  };
  const result = overlayLocalizedCmsPayload(canon, loc, 'site');
  assert.equal(result.hero.badge, 'Rozet');
  assert.equal(result.hero.untrustedInjection, undefined);
  assert.equal(result.untrustedRootKey, undefined);
});

test('18. Full site target overlay preserves branding, image URLs, contact emails, and numbers', () => {
  const canon = {
    hero: {
      badge: 'شارة',
      title: 'عنوان',
      subtitle: 'فرعي',
      primaryBtn: 'زر 1',
      secondaryBtn: 'زر 2',
      tertiaryBtn: 'زر 3',
      description: 'وصف',
      image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/hero.jpg',
      badge1: { label: 'جائزة', value: '12' },
      badge2: { icon: 'TrendingUp', label: 'نمو', value: '+%10' },
    },
    about: {
      badge: 'من نحن',
      title: 'رسالتنا',
      description: 'وصف عن الاتحاد',
      image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/about.jpg',
      imageBadge: { label: 'طالب مستفيد', value: '+1200' },
      features: [
        { icon: 'Target', title: 'رؤية', desc: 'إعداد قادة' },
      ],
    },
    brand: {
      name: 'اتحاد شباب الأمة',
      nameTr: 'Ummet Gençleri Birliği',
      logoUrl: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/site_assets/logo.png',
      logoIcon: 'Users',
      logoPath: 'branding/logo.png',
    },
    stats: [
      { icon: 'Users', label: 'عضو مسجل', value: 12 },
    ],
    footer: {
      email: 'ummetgencleribirligi@gmail.com',
      phone: '00905375922478',
      social: { twitter: 'https://twitter.com/ummet' },
      address: 'Erzurum, Türkiye',
      copyright: 'جميع الحقوق محفوظة',
    },
  };

  const loc = {
    hero: {
      badge: 'Gençleri Güçlendiriyor',
      title: 'Ümmet Gençleri Birliği',
      subtitle: 'Bilinçli Nesil',
      primaryBtn: 'Programları İncele',
      secondaryBtn: 'Birliği Tanıyın',
      tertiaryBtn: 'Yönetim Kurulu',
      description: 'Türkçe Açıklama',
      image: 'https://evil.com/fake.jpg',
      badge1: { label: 'Onur Ödülü', value: '999' },
      badge2: { icon: 'Fake', label: 'Yıllık Büyüme', value: 'fake' },
    },
    about: {
      badge: 'Hakkımızda',
      title: 'Misyonumuz',
      description: 'Açıklama',
      image: 'https://evil.com/about.jpg',
      imageBadge: { label: 'Yararlanan Öğrenci', value: 'hacked' },
      features: [
        { icon: 'Hacked', title: 'Net Vizyon', desc: 'Liderler yetiştirmek' },
      ],
    },
    brand: {
      name: 'Ümmet Gençleri Birliği',
      logoUrl: 'https://evil.com/logo.png',
      logoIcon: 'Hacked',
    },
    stats: [
      { icon: 'Hacked', label: 'Kayıtlı Üye', value: 99999 },
    ],
    footer: {
      email: 'evil@hacker.com',
      phone: '000',
      address: 'Erzurum, Türkiye',
      copyright: 'Tüm hakları saklıdır',
    },
  };

  const result = overlayLocalizedCmsPayload(canon, loc, 'site');

  // Text fields localized
  assert.equal(result.hero.badge, 'Gençleri Güçlendiriyor');
  assert.equal(result.hero.primaryBtn, 'Programları İncele');
  assert.equal(result.hero.secondaryBtn, 'Birliği Tanıyın');
  assert.equal(result.hero.tertiaryBtn, 'Yönetim Kurulu');
  assert.equal(result.about.badge, 'Hakkımızda');
  assert.equal(result.about.features[0].title, 'Net Vizyon');
  assert.equal(result.stats[0].label, 'Kayıtlı Üye');
  assert.equal(result.footer.copyright, 'Tüm hakları saklıdır');

  // Critical non-translatable fields STRICTLY preserved from canonical
  assert.equal(result.hero.image, canon.hero.image);
  assert.equal(result.about.image, canon.about.image);
  assert.equal(result.about.imageBadge.value, '+1200');
  assert.equal(result.about.features[0].icon, 'Target');
  assert.equal(result.brand.logoUrl, canon.brand.logoUrl);
  assert.equal(result.brand.logoIcon, 'Users');
  assert.equal(result.stats[0].icon, 'Users');
  assert.equal(result.stats[0].value, 12);
  assert.equal(result.footer.email, 'ummetgencleribirligi@gmail.com');
  assert.equal(result.footer.phone, '00905375922478');
});
