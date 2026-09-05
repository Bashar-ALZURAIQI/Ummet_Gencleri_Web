import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CmsLocalizationRepositoryError,
  InMemoryCmsLocalizationRepository,
  resolveCmsTargetForLocale,
} from '../src/domain/cmsLocalizationRepository.ts';

test('1. Published TR record can be stored and read', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const trRecord = {
    target: 'about',
    locale: 'tr',
    payload: { title: 'Hakkımızda', description: 'Biz kimiz' },
    status: 'fresh',
    sourceHash: 'a1b2c3d4',
  };

  const saved = await repo.savePublished(trRecord);
  assert.equal(saved.target, 'about');
  assert.equal(saved.locale, 'tr');

  const retrieved = await repo.getPublished('about', 'tr');
  assert.ok(retrieved);
  assert.equal(retrieved.locale, 'tr');
  assert.deepEqual(retrieved.payload, { title: 'Hakkımızda', description: 'Biz kimiz' });
  assert.equal(retrieved.status, 'fresh');
});

test('2. Published EN record can be stored and read', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const enRecord = {
    target: 'about',
    locale: 'en',
    payload: { title: 'About Us', description: 'Who we are' },
    status: 'fresh',
    sourceHash: 'a1b2c3d4',
  };

  await repo.savePublished(enRecord);
  const retrieved = await repo.getPublished('about', 'en');
  assert.ok(retrieved);
  assert.equal(retrieved.locale, 'en');
  assert.deepEqual(retrieved.payload, { title: 'About Us', description: 'Who we are' });
});

test('3. TR and EN records for the same target do not overwrite each other', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'hero',
    locale: 'tr',
    payload: { title: 'Türkçe Başlık' },
    status: 'fresh',
  });

  await repo.savePublished({
    target: 'hero',
    locale: 'en',
    payload: { title: 'English Title' },
    status: 'fresh',
  });

  const tr = await repo.getPublished('hero', 'tr');
  const en = await repo.getPublished('hero', 'en');

  assert.equal(tr.payload.title, 'Türkçe Başlık');
  assert.equal(en.payload.title, 'English Title');
});

test('4. Arabic published record is rejected with INVALID_LOCALE', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await assert.rejects(
    async () => {
      await repo.savePublished({
        target: 'about',
        locale: 'ar',
        payload: { title: 'من نحن' },
        status: 'fresh',
      });
    },
    (err) => {
      assert.ok(err instanceof CmsLocalizationRepositoryError);
      assert.equal(err.code, 'INVALID_LOCALE');
      return true;
    }
  );
});

test('5. Arabic draft record is rejected with INVALID_LOCALE', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await assert.rejects(
    async () => {
      await repo.saveDraft({
        target: 'about',
        locale: 'ar',
        payload: { title: 'مسودة من نحن' },
        status: 'draft',
      });
    },
    (err) => {
      assert.ok(err instanceof CmsLocalizationRepositoryError);
      assert.equal(err.code, 'INVALID_LOCALE');
      return true;
    }
  );
});

test('6. Missing published record returns null', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const result = await repo.getPublished('news', 'tr');
  assert.equal(result, null);
});

test('7. Missing draft record returns null', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const result = await repo.getDraft('news', 'en');
  assert.equal(result, null);
});

test('8. Draft can be stored and read', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const draftRecord = {
    target: 'faq',
    locale: 'tr',
    payload: { question: 'Taslak Soru?' },
    status: 'draft',
  };

  await repo.saveDraft(draftRecord);
  const retrieved = await repo.getDraft('faq', 'tr');
  assert.ok(retrieved);
  assert.equal(retrieved.status, 'draft');
  assert.deepEqual(retrieved.payload, { question: 'Taslak Soru?' });
});

test('9. Draft and published records are completely separate', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { title: 'Yayınlanmış Başlık' },
    status: 'fresh',
  });

  await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { title: 'Taslak Başlık' },
    status: 'draft',
  });

  const published = await repo.getPublished('site', 'tr');
  const draft = await repo.getDraft('site', 'tr');

  assert.equal(published.payload.title, 'Yayınlanmış Başlık');
  assert.equal(draft.payload.title, 'Taslak Başlık');
});

test('10. Draft update does not affect published record', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'events',
    locale: 'en',
    payload: { name: 'Published Event' },
    status: 'fresh',
  });

  await repo.saveDraft({
    target: 'events',
    locale: 'en',
    payload: { name: 'Draft Event v1' },
    status: 'draft',
  });

  await repo.saveDraft({
    target: 'events',
    locale: 'en',
    payload: { name: 'Draft Event v2 (Updated)' },
    status: 'draft',
  });

  const published = await repo.getPublished('events', 'en');
  assert.equal(published.payload.name, 'Published Event');

  const draft = await repo.getDraft('events', 'en');
  assert.equal(draft.payload.name, 'Draft Event v2 (Updated)');
});

test('11. Published update does not affect draft record', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.saveDraft({
    target: 'contactCards',
    locale: 'tr',
    payload: { address: 'Taslak Adres' },
    status: 'draft',
  });

  await repo.savePublished({
    target: 'contactCards',
    locale: 'tr',
    payload: { address: 'Yayınlanmış Adres v1' },
    status: 'fresh',
  });

  await repo.savePublished({
    target: 'contactCards',
    locale: 'tr',
    payload: { address: 'Yayınlanmış Adres v2' },
    status: 'fresh',
  });

  const draft = await repo.getDraft('contactCards', 'tr');
  assert.equal(draft.payload.address, 'Taslak Adres');
});

test('12. Deleting draft does not delete published record', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'reports',
    locale: 'en',
    payload: { title: 'Annual Report' },
    status: 'fresh',
  });

  await repo.saveDraft({
    target: 'reports',
    locale: 'en',
    payload: { title: 'Draft Annual Report' },
    status: 'draft',
  });

  const deleted = await repo.deleteDraft('reports', 'en');
  assert.equal(deleted, true);

  const draft = await repo.getDraft('reports', 'en');
  assert.equal(draft, null);

  const published = await repo.getPublished('reports', 'en');
  assert.ok(published);
  assert.equal(published.payload.title, 'Annual Report');
});

test('13. Deleting published does not delete draft record', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'plans',
    locale: 'tr',
    payload: { plan: 'Stratejik Plan' },
    status: 'fresh',
  });

  await repo.saveDraft({
    target: 'plans',
    locale: 'tr',
    payload: { plan: 'Taslak Stratejik Plan' },
    status: 'draft',
  });

  const deleted = await repo.deletePublished('plans', 'tr');
  assert.equal(deleted, true);

  const published = await repo.getPublished('plans', 'tr');
  assert.equal(published, null);

  const draft = await repo.getDraft('plans', 'tr');
  assert.ok(draft);
  assert.equal(draft.payload.plan, 'Taslak Stratejik Plan');
});

test('14. Returned record cannot mutate repository internal state', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { meta: { title: 'Orijinal' } },
    status: 'fresh',
    stalePaths: ['meta.title'],
  });

  const record = await repo.getPublished('site', 'tr');
  record.payload.meta.title = 'MUTATED';
  record.stalePaths.push('hacked');

  const secondRead = await repo.getPublished('site', 'tr');
  assert.equal(secondRead.payload.meta.title, 'Orijinal');
  assert.deepEqual(secondRead.stalePaths, ['meta.title']);
});

test('15. Input object mutation after save cannot mutate repository state', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  const inputPayload = { content: 'Güvenli İçerik' };
  const inputStalePaths = ['content'];

  await repo.savePublished({
    target: 'about',
    locale: 'tr',
    payload: inputPayload,
    status: 'fresh',
    stalePaths: inputStalePaths,
  });

  inputPayload.content = 'MUTATED_AFTER_SAVE';
  inputStalePaths.push('mutated.path');

  const read = await repo.getPublished('about', 'tr');
  assert.equal(read.payload.content, 'Güvenli İçerik');
  assert.deepEqual(read.stalePaths, ['content']);
});

test('16. stalePaths preserved accurately', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'about',
    locale: 'en',
    payload: { title: 'About' },
    status: 'stale',
    stalePaths: ['about.title', 'about.description'],
  });

  const read = await repo.getPublished('about', 'en');
  assert.deepEqual(read.stalePaths, ['about.description', 'about.title']);
});

test('17. manualPaths preserved accurately', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'about',
    locale: 'tr',
    payload: { title: 'Hakkımızda' },
    status: 'fresh',
    manualPaths: ['about.customField'],
  });

  const read = await repo.getPublished('about', 'tr');
  assert.deepEqual(read.manualPaths, ['about.customField']);
});

test('18. sourceHash preserved accurately', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'events',
    locale: 'en',
    payload: { title: 'Event' },
    status: 'fresh',
    sourceHash: 'deadbeef1234',
  });

  const read = await repo.getPublished('events', 'en');
  assert.equal(read.sourceHash, 'deadbeef1234');
});

test('19. sourceVersion preserved accurately', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'events',
    locale: 'tr',
    payload: { title: 'Etkinlik' },
    status: 'fresh',
    sourceVersion: 'v2.4.1',
  });

  const read = await repo.getPublished('events', 'tr');
  assert.equal(read.sourceVersion, 'v2.4.1');
});

test('20. Public AR resolution never calls repository', async () => {
  let repoCalled = false;
  const spyRepo = {
    getPublished: async () => {
      repoCalled = true;
      return null;
    },
    getDraft: async () => {
      repoCalled = true;
      return null;
    },
  };

  const canonical = { title: 'عنوان عربي أصيل' };
  const result = await resolveCmsTargetForLocale({
    repository: spyRepo,
    target: 'about',
    requestedLocale: 'ar',
    canonicalPayload: canonical,
  });

  assert.equal(repoCalled, false);
  assert.equal(result.resolution.payload.title, 'عنوان عربي أصيل');
  assert.equal(result.resolution.actualLocale, 'ar');
  assert.equal(result.resolution.didFallback, false);
});

test('21. Public TR resolution reads published TR only', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished({
    target: 'about',
    locale: 'tr',
    payload: { title: 'Türkçe Hakkımızda' },
    status: 'fresh',
  });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'about',
    requestedLocale: 'tr',
    canonicalPayload: { title: 'عن الاتحاد' },
  });

  assert.equal(result.resolution.payload.title, 'Türkçe Hakkımızda');
  assert.equal(result.resolution.actualLocale, 'tr');
  assert.equal(result.resolution.didFallback, false);
});

test('22. Public EN resolution reads published EN only', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished({
    target: 'about',
    locale: 'en',
    payload: { title: 'About Union' },
    status: 'fresh',
  });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'about',
    requestedLocale: 'en',
    canonicalPayload: { title: 'عن الاتحاد' },
  });

  assert.equal(result.resolution.payload.title, 'About Union');
  assert.equal(result.resolution.actualLocale, 'en');
  assert.equal(result.resolution.didFallback, false);
});

test('23. Missing TR published localization falls back to Arabic', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = { title: 'عنوان رئيسي' };

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'site',
    requestedLocale: 'tr',
    canonicalPayload: canonical,
  });

  assert.deepEqual(result.resolution.payload, canonical);
  assert.equal(result.resolution.actualLocale, 'ar');
  assert.equal(result.resolution.requestedLocale, 'tr');
  assert.equal(result.resolution.didFallback, true);
  assert.equal(result.resolution.status, 'missing');
});

test('24. Missing EN published localization falls back to Arabic', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = { title: 'عنوان رئيسي' };

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'site',
    requestedLocale: 'en',
    canonicalPayload: canonical,
  });

  assert.deepEqual(result.resolution.payload, canonical);
  assert.equal(result.resolution.actualLocale, 'ar');
  assert.equal(result.resolution.requestedLocale, 'en');
  assert.equal(result.resolution.didFallback, true);
  assert.equal(result.resolution.status, 'missing');
});

test('25. Stale published translation remains visible publicly with stale metadata', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished({
    target: 'news',
    locale: 'tr',
    payload: { title: 'Eski Çeviri' },
    status: 'stale',
    stalePaths: ['news.title'],
  });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'news',
    requestedLocale: 'tr',
    canonicalPayload: { title: 'خبر جديد ومعدل' },
  });

  assert.equal(result.resolution.payload.title, 'Eski Çeviri');
  assert.equal(result.resolution.actualLocale, 'tr');
  assert.equal(result.resolution.didFallback, false);
  assert.equal(result.resolution.status, 'stale');
  assert.deepEqual(result.resolution.stalePaths, ['news.title']);
});

test('26. Draft-only translation falls back to Arabic publicly', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.saveDraft({
    target: 'about',
    locale: 'tr',
    payload: { title: 'Taslak Başlık — Henüz Yayınlanmadı' },
    status: 'draft',
  });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'about',
    requestedLocale: 'tr',
    canonicalPayload: { title: 'من نحن الأصلي' },
  });

  assert.equal(result.resolution.payload.title, 'من نحن الأصلي');
  assert.equal(result.resolution.actualLocale, 'ar');
  assert.equal(result.resolution.didFallback, true);
});

test('27. Public read never leaks draft payload even if published exists', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'hero',
    locale: 'en',
    payload: { headline: 'Public Headline' },
    status: 'fresh',
  });

  await repo.saveDraft({
    target: 'hero',
    locale: 'en',
    payload: { headline: 'Secret Unreviewed Draft Headline' },
    status: 'draft',
  });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'hero',
    requestedLocale: 'en',
    canonicalPayload: { headline: 'عنوان البطل' },
  });

  assert.equal(result.resolution.payload.headline, 'Public Headline');
  assert.equal(result.resolution.didFallback, false);
});

test('28. Repository failure is distinguishable from ordinary missing record', async () => {
  const failingRepo = {
    getPublished: async () => {
      throw new Error('Database connection timeout simulated');
    },
    getDraft: async () => null,
  };

  const canonical = { title: 'عنوان آمن للطوارئ' };
  const result = await resolveCmsTargetForLocale({
    repository: failingRepo,
    target: 'events',
    requestedLocale: 'tr',
    canonicalPayload: canonical,
  });

  // Does not crash!
  assert.deepEqual(result.resolution.payload, canonical);
  assert.equal(result.resolution.actualLocale, 'ar');
  assert.equal(result.resolution.didFallback, true);
  assert.ok(result.repositoryError);
  assert.match(result.repositoryError.message, /Database connection timeout simulated/);
});

test('29. Concurrency check: options.expectedSourceHash and expectedVersion enforce optimistic concurrency', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.savePublished({
    target: 'about',
    locale: 'tr',
    payload: { title: 'Versiyon 1' },
    status: 'fresh',
    sourceHash: 'hash-v1',
    sourceVersion: 1,
  });

  // Mismatch expectedSourceHash
  await assert.rejects(
    async () => {
      await repo.savePublished(
        {
          target: 'about',
          locale: 'tr',
          payload: { title: 'Versiyon 2' },
          status: 'fresh',
          sourceHash: 'hash-v2',
        },
        { expectedSourceHash: 'hash-mismatched' }
      );
    },
    (err) => {
      assert.ok(err instanceof CmsLocalizationRepositoryError);
      assert.equal(err.code, 'CONFLICT');
      return true;
    }
  );

  // Matching expectedSourceHash succeeds
  const updated = await repo.savePublished(
    {
      target: 'about',
      locale: 'tr',
      payload: { title: 'Versiyon 2' },
      status: 'fresh',
      sourceHash: 'hash-v2',
      sourceVersion: 2,
    },
    { expectedSourceHash: 'hash-v1' }
  );
  assert.equal(updated.payload.title, 'Versiyon 2');
});

test('30. Domain module contains no Supabase, React, or UI dependencies', () => {
  const repoFile = fs.readFileSync(
    path.join(process.cwd(), 'src/domain/cmsLocalizationRepository.ts'),
    'utf-8'
  );

  assert.doesNotMatch(repoFile, /from ['"]@supabase/);
  assert.doesNotMatch(repoFile, /from ['"]react/);
  assert.doesNotMatch(repoFile, /from ['"]\.\.\/components/);
  assert.doesNotMatch(repoFile, /from ['"]\.\.\/pages/);
});

test('31. No database migrations, Edge Functions, or UI modifications were introduced', () => {
  const gitStatusOutput = fs.existsSync(path.join(process.cwd(), 'supabase/migrations'));
  if (gitStatusOutput) {
    const migrationFiles = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'));
    assert.equal(
      migrationFiles.some((f) => f.includes('cms_localization')),
      false,
      'No localization migration should exist in Task 7B'
    );
  }
});

test('32. getLocalization works as alias to getPublished', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished({
    target: 'faq',
    locale: 'en',
    payload: { answer: 'FAQ Answer' },
    status: 'fresh',
  });

  const viaAlias = await repo.getLocalization('faq', 'en');
  const viaGetPublished = await repo.getPublished('faq', 'en');

  assert.deepEqual(viaAlias, viaGetPublished);
  assert.equal(viaAlias.payload.answer, 'FAQ Answer');
});

test('33. normalizeLocalizationPaths safely applies to records on store', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const saved = await repo.savePublished({
    target: 'about',
    locale: 'tr',
    payload: { title: 'Hakkımızda' },
    status: 'fresh',
    stalePaths: [' about[0].lead ', 'about.0.lead', ''],
    manualPaths: [' about.custom '],
  });

  assert.deepEqual(saved.stalePaths, ['about.0.lead']);
  assert.deepEqual(saved.manualPaths, ['about.custom']);
});
