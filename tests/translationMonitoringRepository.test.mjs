import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { SupabaseCmsLocalizationRepository } from '../src/services/localization/SupabaseCmsLocalizationRepository.ts';
import { computeOverallMonitoringSummary } from '../src/domain/translationMonitoring.ts';

test('1. InMemoryCmsLocalizationRepository.listMonitoringRecords returns TR/EN published and drafts in one operation', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: [{ id: '1', title: 'Taslak Etkinlik' }],
    stalePaths: [],
    manualPaths: ['*'],
  });

  await repo.saveDraft({
    target: 'events',
    locale: 'en',
    payload: [{ id: '1', title: 'Draft Event' }],
    stalePaths: [],
    manualPaths: ['*'],
  });

  await repo.savePublished({
    target: 'news',
    locale: 'tr',
    payload: [{ id: '1', title: 'Yayınlanmış Haber' }],
    stalePaths: [],
    manualPaths: ['*'],
  });

  const records = await repo.listMonitoringRecords();

  assert.equal(records.length, 3);
  const eventTrDraft = records.find((r) => r.target === 'events' && r.locale === 'tr' && r.partition === 'draft');
  const eventEnDraft = records.find((r) => r.target === 'events' && r.locale === 'en' && r.partition === 'draft');
  const newsTrPub = records.find((r) => r.target === 'news' && r.locale === 'tr' && r.partition === 'published');

  assert.ok(eventTrDraft);
  assert.ok(eventEnDraft);
  assert.ok(newsTrPub);
});

test('2. SupabaseCmsLocalizationRepository.listMonitoringRecords executes read-only query without mutations', async () => {
  let selectCalled = false;
  let inCalled = false;
  let mutationAttempted = false;

  const fakeSupabase = {
    from(table) {
      assert.equal(table, 'cms_localizations');
      return {
        select(cols) {
          selectCalled = true;
          assert.equal(cols, '*');
          return {
            in(column, values) {
              inCalled = true;
              assert.equal(column, 'locale');
              assert.deepEqual(values, ['tr', 'en']);
              return Promise.resolve({
                data: [
                  {
                    id: 'row-1',
                    target: 'site',
                    locale: 'tr',
                    partition: 'published',
                    status: 'fresh',
                    payload: { hero: { title: 'Ana Sayfa' } },
                    source_hash: 'hash-1',
                    stale_paths: [],
                    manual_paths: ['*'],
                    created_at: '2026-09-01T00:00:00Z',
                    updated_at: '2026-09-01T00:00:00Z',
                  },
                  {
                    id: 'row-2',
                    target: 'site',
                    locale: 'tr',
                    partition: 'draft',
                    status: 'draft',
                    payload: { hero: { title: 'Taslak Başlık' } },
                    source_hash: 'hash-1',
                    stale_paths: [],
                    manual_paths: ['*'],
                    created_at: '2026-09-02T00:00:00Z',
                    updated_at: '2026-09-02T00:00:00Z',
                  },
                ],
                error: null,
              });
            },
          };
        },
        insert() { mutationAttempted = true; throw new Error('Mutation forbidden'); },
        update() { mutationAttempted = true; throw new Error('Mutation forbidden'); },
        upsert() { mutationAttempted = true; throw new Error('Mutation forbidden'); },
        delete() { mutationAttempted = true; throw new Error('Mutation forbidden'); },
      };
    },
  };

  const repo = new SupabaseCmsLocalizationRepository(fakeSupabase);
  const records = await repo.listMonitoringRecords();

  assert.equal(selectCalled, true);
  assert.equal(inCalled, true);
  assert.equal(mutationAttempted, false);
  assert.equal(records.length, 2);
  assert.equal(records[0].partition, 'published');
  assert.equal(records[1].partition, 'draft');
});

test('3. computeOverallMonitoringSummary processes live repository records into health summary', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  const canonicalSite = {
    hero: {
      title: 'اتحاد شباب الأمة',
      badge: 'الريادة والتميز',
    },
  };

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: {
      hero: {
        title: 'Ümmet Gençleri Birliği',
        badge: 'Öncülük ve Mükemmellik',
      },
    },
    stalePaths: [],
    manualPaths: ['*'],
  });

  const records = await repo.listMonitoringRecords();

  const summary = computeOverallMonitoringSummary({
    canonicalTargets: {
      site: canonicalSite,
    },
    localizationRecords: records,
    targets: ['site'],
  });

  assert.equal(summary.totalFields, 2);
  assert.equal(summary.totalSlots, 4); // 2 fields * 2 locales
  assert.equal(summary.tr.fresh, 2);
  assert.equal(summary.tr.missing, 0);
  assert.equal(summary.tr.freshPercentage, 100);

  // English was not provided, so it is 100% missing
  assert.equal(summary.en.fresh, 0);
  assert.equal(summary.en.missing, 2);
  assert.equal(summary.en.freshPercentage, 0);
});
