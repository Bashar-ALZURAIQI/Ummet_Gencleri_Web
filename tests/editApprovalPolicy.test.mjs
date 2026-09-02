import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeSiteEditSubmit,
  deriveApprovedProfilePatch,
  deriveApprovedSiteValue,
} from '../src/domain/editApprovalPolicy.ts';

test('a hidden field in a record payload is never published by an approved visible diff', () => {
  const result = deriveApprovedSiteValue({
    target: 'news', op: 'add',
    recordValue: { id: 'attacker-id', title: 'خبر ظاهر', isAdmin: true },
    diffs: [{ label: 'العنوان', path: 'title', oldValue: '', newValue: 'خبر ظاهر' }],
  }, [{ label: 'العنوان', path: 'title', oldValue: '', newValue: 'خبر ظاهر' }], []);

  assert.equal(result.ok, false);
  assert.match(result.error, /غير صالح|غير مسموح/);
});

test('site approval rejects an unknown diff path and a stale old value', () => {
  const current = [{ id: 'n1', title: 'الحالي', category: '', date: '', excerpt: '', image: '' }];
  const unknown = deriveApprovedSiteValue({
    target: 'news', op: 'update', recordId: 'n1',
    diffs: [{ label: 'سري', path: 'permissions.admin', oldValue: '', newValue: 'true' }],
  }, [{ label: 'سري', path: 'permissions.admin', oldValue: '', newValue: 'true' }], current);
  const stale = deriveApprovedSiteValue({
    target: 'news', op: 'update', recordId: 'n1',
    diffs: [{ label: 'العنوان', path: 'title', oldValue: 'نسخة قديمة', newValue: 'الجديد' }],
  }, [{ label: 'العنوان', path: 'title', oldValue: 'نسخة قديمة', newValue: 'الجديد' }], current);

  assert.equal(unknown.ok, false);
  assert.equal(stale.ok, false);
});

test('site approval derives the next record only from the visible diffs over current state', () => {
  const current = [{
    id: 'n1', title: 'الحالي', category: 'عام', date: '2026-08-23', excerpt: 'ملخص',
    image: '', fullContent: '', pinnedOnHomepage: false,
  }];
  const diffs = [{ label: 'العنوان', path: 'title', oldValue: 'الحالي', newValue: 'الجديد' }];
  const result = deriveApprovedSiteValue({
    target: 'news', op: 'update', recordId: 'n1',
    recordValue: { ...current[0], title: 'الجديد', isAdmin: true },
    diffs,
  }, diffs, current);

  assert.equal(result.ok, false, 'raw record payloads are rejected instead of partially trusted');
});

test('profile approval rejects a malicious snapshot and summary mismatch, preserving head identity', () => {
  const current = {
    head: { id: 'president', name: 'الرئيس الحقيقي' },
    responsibilities: ['قديمة'], stats: [], members: [],
  };
  const result = deriveApprovedProfilePatch({
    snapshot: {
      head: { id: 'victim', name: 'رئيس مزور' },
      responsibilities: ['جديدة'], stats: [], members: [],
      permissions: { president: true },
    },
    summary: [{ label: 'المهام والمسؤوليات', oldValue: 'قديمة', newValue: 'جديدة' }],
  }, current);

  assert.equal(result.ok, false);
  assert.equal(current.head.name, 'الرئيس الحقيقي');
});

test('profile approval accepts only a recomputed allowed summary patch', () => {
  const current = {
    head: { id: 'head-1', name: 'ثابت' },
    responsibilities: ['قديمة'], stats: [], members: [],
  };
  const result = deriveApprovedProfilePatch({
    snapshot: {
      head: { id: '', name: '', role: '', bio: '', email: '', photo: '' },
      responsibilities: ['جديدة'], stats: [], members: [],
    },
    summary: [{ label: 'المهام والمسؤوليات', oldValue: 'قديمة', newValue: 'جديدة' }],
  }, current);

  assert.equal(result.ok, true);
  assert.deepEqual(result.patch, { responsibilities: ['جديدة'] });
  assert.equal(current.head.name, 'ثابت');
});

test('profile approval accepts the new headless structured snapshot contract', () => {
  const current = {
    head: { id: 'head-1', name: 'ثابت' },
    responsibilities: ['قديمة'], stats: [], members: [],
  };
  const result = deriveApprovedProfilePatch({
    snapshot: { responsibilities: ['جديدة'], stats: [], members: [] },
    summary: [{ label: 'المهام والمسؤوليات', oldValue: 'قديمة', newValue: 'جديدة' }],
  }, current);

  assert.equal(result.ok, true);
  assert.deepEqual(result.patch, { responsibilities: ['جديدة'] });
  assert.equal(current.head.name, 'ثابت');
});

test('profile approval rejects protected keys in the headless structured snapshot', () => {
  const result = deriveApprovedProfilePatch({
    snapshot: { responsibilities: ['جديدة'], stats: [], members: [], role: 'PRESIDENT' },
    summary: [{ label: 'المهام والمسؤوليات', oldValue: 'قديمة', newValue: 'جديدة' }],
  }, { responsibilities: ['قديمة'], stats: [], members: [] });

  assert.equal(result.ok, false);
});

test('a committee member name edit cannot replace the hidden member id or photo', () => {
  const current = {
    head: { id: 'head-1', name: 'ثابت' }, responsibilities: [], stats: [],
    members: [{ id: 'member-1', name: 'الاسم القديم', position: 'عضو', photo: '/safe.webp' }],
  };
  const result = deriveApprovedProfilePatch({
    snapshot: {
      head: { id: '', name: '', role: '', bio: '', email: '', photo: '' },
      responsibilities: [], stats: [],
      members: [{ id: 'member-1', name: 'الاسم الجديد', position: 'عضو', photo: 'https://evil.example/replace.webp' }],
    },
    summary: [{ label: 'أعضاء اللجنة', oldValue: 'الاسم القديم (عضو)', newValue: 'الاسم الجديد (عضو)' }],
  }, current);
  assert.equal(result.ok, true);
  assert.deepEqual(result.patch.members, [
    { id: 'member-1', name: 'الاسم الجديد', position: 'عضو', photo: '/safe.webp' },
  ]);
});

test('a same-size member edit with a replaced hidden id is rejected', () => {
  const current = {
    head: {}, responsibilities: [], stats: [],
    members: [{ id: 'member-1', name: 'القديم', position: 'عضو', photo: '/safe.webp' }],
  };
  const result = deriveApprovedProfilePatch({
    snapshot: {
      head: { id: '', name: '', role: '', bio: '', email: '', photo: '' },
      responsibilities: [], stats: [],
      members: [{ id: 'attacker-id', name: 'الجديد', position: 'عضو', photo: '/evil.webp' }],
    },
    summary: [{ label: 'أعضاء اللجنة', oldValue: 'القديم (عضو)', newValue: 'الجديد (عضو)' }],
  }, current);
  assert.equal(result.ok, false);
});

test('spoofed labels are replaced by canonical review identity', () => {
  const result = canonicalizeSiteEditSubmit({
    pageId: 'admin', pageLabel: 'صلاحيات الرئيس', sectionLabel: 'منح صلاحية',
    target: 'news', op: 'update', recordId: 'n1',
    diffs: [{ label: 'تحويل إلى رئيس', path: 'title', oldValue: 'قديم', newValue: 'جديد' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.pageId, 'news');
  assert.equal(result.value.pageLabel, 'الأخبار');
  assert.equal(result.value.sectionLabel, 'تعديل سجل');
  assert.equal(result.value.diffs[0].label, 'عنوان الخبر');
  assert.match(result.technicalIdentity, /target=news/);
  assert.match(result.technicalIdentity, /path=title/);
  assert.match(result.technicalIdentity, /recordId=n1/);
});

test('approval identity follows target and path rather than spoofable labels', () => {
  const current = [{ id: 'n1', title: 'قديم', category: '', date: '', excerpt: '', image: '' }];
  const edit = {
    pageId: 'evil', pageLabel: 'evil', sectionLabel: 'evil', target: 'news', op: 'update', recordId: 'n1',
    diffs: [{ label: 'label-a', path: 'title', oldValue: 'قديم', newValue: 'جديد' }],
  };
  const result = deriveApprovedSiteValue(edit, [
    { label: 'label-b', path: 'title', oldValue: 'قديم', newValue: 'معدل الرئيس' },
  ], current);
  assert.equal(result.ok, true);
  assert.equal(result.value[0].title, 'معدل الرئيس');
});

test('nested canonical identity includes the parent and item and uses contextual field labels', () => {
  const contact = canonicalizeSiteEditSubmit({
    pageId: 'evil', pageLabel: 'evil', sectionLabel: 'evil',
    target: 'guideSections', op: 'update', recordId: 'section-1',
    nested: { parentField: 'contacts', itemId: 'contact-1' },
    diffs: [{ label: 'اسم القسم', path: 'label', oldValue: 'قديم', newValue: 'جديد' }],
  });
  const otherContact = canonicalizeSiteEditSubmit({
    pageId: 'evil', pageLabel: 'evil', sectionLabel: 'evil',
    target: 'guideSections', op: 'update', recordId: 'section-1',
    nested: { parentField: 'contacts', itemId: 'contact-2' },
    diffs: [{ label: 'اسم القسم', path: 'label', oldValue: 'قديم', newValue: 'جديد' }],
  });

  assert.equal(contact.ok, true);
  assert.equal(otherContact.ok, true);
  assert.equal(contact.value.diffs[0].label, 'اسم جهة الاتصال');
  assert.match(contact.technicalIdentity, /parentField=contacts/);
  assert.match(contact.technicalIdentity, /itemId=contact-1/);
  assert.notEqual(contact.technicalIdentity, otherContact.technicalIdentity);
});

test('a multi-field page set is validated and applied atomically from all canonical diffs', () => {
  const current = {
    brand: { name: 'القديم', nameTr: 'Old' },
    footer: { phone: '111' },
  };
  const diffs = [
    { label: 'مزور 1', path: 'brand.name', oldValue: 'القديم', newValue: 'الجديد' },
    { label: 'مزور 2', path: 'brand.nameTr', oldValue: 'Old', newValue: 'New' },
  ];
  const canonical = canonicalizeSiteEditSubmit({
    pageId: 'evil', pageLabel: 'evil', sectionLabel: 'evil', target: 'site', op: 'set', diffs,
  });
  const result = deriveApprovedSiteValue({
    pageId: 'evil', pageLabel: 'evil', sectionLabel: 'evil', target: 'site', op: 'set', diffs,
  }, diffs, current);

  assert.equal(canonical.ok, true);
  assert.deepEqual(canonical.value.diffs.map((row) => row.label), ['الاسم', 'الاسم بالتركية']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    brand: { name: 'الجديد', nameTr: 'New' },
    footer: { phone: '111' },
  });
  assert.deepEqual(current.brand, { name: 'القديم', nameTr: 'Old' });
});

test('homepage statistic badge approval preserves free-form text and the selected icon', () => {
  const current = {
    hero: {
      badge1: { value: '12', label: 'جائزة تكريم', icon: 'Award' },
    },
  };
  const diffs = [
    { label: 'القيمة', path: 'hero.badge1.value', oldValue: '12', newValue: '+10%' },
    { label: 'الأيقونة', path: 'hero.badge1.icon', oldValue: 'Award', newValue: 'Star' },
  ];

  const result = deriveApprovedSiteValue({
    pageId: 'home', pageLabel: 'الصفحة الرئيسية', sectionLabel: 'شارة إحصائية 1',
    target: 'site', op: 'set', diffs,
  }, diffs, current);

  assert.deepEqual(result, {
    ok: true,
    value: {
      hero: {
        badge1: { value: '+10%', label: 'جائزة تكريم', icon: 'Star' },
      },
    },
  });
});

test('contact map approval accepts only its three visible scalar fields', () => {
  const current = {
    title: 'موقعنا',
    embedUrl: 'https://www.google.com/maps?q=Erzurum&output=embed',
    openUrl: 'https://www.google.com/maps?q=Erzurum',
  };
  const edit = {
    pageId: 'contact',
    pageLabel: 'اتصل بنا',
    sectionLabel: 'خريطة الموقع',
    target: 'contactMap',
    op: 'update',
    diffs: [{
      label: 'عنوان الخريطة', path: 'title', oldValue: 'موقعنا', newValue: 'مقر الاتحاد', editable: true,
    }],
  };
  assert.deepEqual(deriveApprovedSiteValue(edit, edit.diffs, current), {
    ok: true,
    value: { ...current, title: 'مقر الاتحاد' },
  });
  assert.equal(canonicalizeSiteEditSubmit({
    ...edit,
    diffs: [{ label: 'خفي', path: 'unsafeHtml', oldValue: '', newValue: '<script>' }],
  }).ok, false);
});
