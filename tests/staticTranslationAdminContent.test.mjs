import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const collectLeafKeys = (obj, prefix = '') => {
  const keys = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...collectLeafKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
};

test('1. AR/TR/EN admin content keys exist with required glossary', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    // Site edits
    'admin.siteEdits.title',
    'admin.siteEdits.pendingCount',
    'admin.siteEdits.loading',
    'admin.siteEdits.empty',
    'admin.siteEdits.currentData',
    'admin.siteEdits.proposedData',
    'admin.siteEdits.approveAndPublish',
    'admin.siteEdits.reject',
    'admin.siteEdits.editThenApprove',
    'admin.siteEdits.editModalTitle',
    'admin.siteEdits.editInstructions',
    'admin.siteEdits.proposedReadOnly',
    'admin.siteEdits.saveAndPublishRevised',
    'admin.siteEdits.noEditableFields',

    // Branding
    'admin.branding.title',
    'admin.branding.subtitle',
    'admin.branding.currentLogo',
    'admin.branding.previewNotice',
    'admin.branding.currentLogoAlt',
    'admin.branding.defaultLogoAria',
    'admin.branding.logoLabel',
    'admin.branding.successMessage',
    'admin.branding.uploading',

    // History
    'admin.history.title',
    'admin.history.officialCount',
    'admin.history.closeErrorAria',
    'admin.history.filters.all',
    'admin.history.filters.site',
    'admin.history.filters.profile',
    'admin.history.loading',
    'admin.history.empty',
    'admin.history.legacyNotice',
    'admin.history.legacyBadge',
    'admin.history.decisions.pending',
    'admin.history.decisions.approved',
    'admin.history.decisions.rejected',
    'admin.history.decisions.editedApproved',
    'admin.history.decisions.decision',
    'admin.history.noteLabel',
    'admin.history.detailsUnavailable',

    // Events
    'admin.events.searchPlaceholder',
    'admin.events.addEvent',
    'admin.events.viewOnly',
    'admin.events.executiveNotice',
    'admin.events.table.event',
    'admin.events.table.category',
    'admin.events.table.date',
    'admin.events.table.registration',
    'admin.events.table.status',
    'admin.events.table.actions',
    'admin.events.status.upcoming',
    'admin.events.status.past',
    'admin.events.empty',
    'admin.events.confirmDelete',
    'admin.events.savedSuccess',
    'admin.events.createFailed',
    'admin.events.editRestrictedPresident',
    'admin.events.deleteRestrictedPresident',
    'admin.events.createRestrictedExecutive',
    'admin.events.modal.addTitle',
    'admin.events.modal.editTitle',
    'admin.events.modal.titleLabel',
    'admin.events.modal.titlePlaceholder',
    'admin.events.modal.categoryLabel',
    'admin.events.modal.categorySelectPlaceholder',
    'admin.events.modal.capacityLabel',
    'admin.events.modal.activityTypeLabel',
    'admin.events.modal.activityTypes.mandatory',
    'admin.events.modal.activityTypes.optional',
    'admin.events.modal.activityTypes.paid',
    'admin.events.modal.pointsValueLabel',
    'admin.events.modal.registrationDeadlineLabel',
    'admin.events.modal.dateLabel',
    'admin.events.modal.timeLabel',
    'admin.events.modal.locationLabel',
    'admin.events.modal.locationPlaceholder',
    'admin.events.modal.descriptionLabel',
    'admin.events.modal.descriptionPlaceholder',
    'admin.events.modal.imageLabel',
    'admin.events.modal.imageError',
    'admin.events.modal.externalUrlLabel',
    'admin.events.modal.optionalTag',
    'admin.events.modal.externalUrlHint',
    'admin.events.modal.statusLabel',
    'admin.events.modal.statusSelectPlaceholder',
    'admin.events.modal.saveChanges',

    // Gallery
    'admin.gallery.countSummary',
    'admin.gallery.addAlbum',
    'admin.gallery.scopedNotice',
    'admin.gallery.editAlbumTitle',
    'admin.gallery.manageMedia',
    'admin.gallery.deleteAlbumTitle',
    'admin.gallery.confirmDeleteAlbum',
    'admin.gallery.confirmDeleteMedia',
    'admin.gallery.empty',
    'admin.gallery.albumModal.addTitle',
    'admin.gallery.albumModal.editTitle',
    'admin.gallery.albumModal.titleLabel',
    'admin.gallery.albumModal.categoryLabel',
    'admin.gallery.albumModal.categorySelectPlaceholder',
    'admin.gallery.albumModal.dateLabel',
    'admin.gallery.albumModal.locationLabel',
    'admin.gallery.albumModal.coverImageLabel',
    'admin.gallery.albumModal.coverImageError',
    'admin.gallery.albumModal.coverPreviewAlt',
    'admin.gallery.albumModal.descriptionLabel',
    'admin.gallery.albumModal.saveChanges',
    'admin.gallery.albumModal.add',
    'admin.gallery.mediaModal.addTitle',
    'admin.gallery.mediaModal.editTitle',
    'admin.gallery.mediaModal.mediaTypeLabel',
    'admin.gallery.mediaModal.photo',
    'admin.gallery.mediaModal.video',
    'admin.gallery.mediaModal.videoSourceLabel',
    'admin.gallery.mediaModal.uploadFromDevice',
    'admin.gallery.mediaModal.externalVideoLink',
    'admin.gallery.mediaModal.photoLabel',
    'admin.gallery.mediaModal.videoFileLabel',
    'admin.gallery.mediaModal.fileRequiredError',
    'admin.gallery.mediaModal.videoUrlLabel',
    'admin.gallery.mediaModal.videoThumbnailLabel',
    'admin.gallery.mediaModal.videoThumbnailError',
    'admin.gallery.mediaModal.captionLabel',
    'admin.gallery.mediaModal.postUrlLabel',
    'admin.gallery.mediaModal.photoPostHint',
    'admin.gallery.mediaModal.videoPostHint',
    'admin.gallery.mediaModal.optionalForVideo',
    'admin.gallery.mediaModal.previewAlt',
    'admin.gallery.mediaModal.saveChanges',
    'admin.gallery.mediaModal.add',

    // News
    'admin.news.addNews',
    'admin.news.pinTitle',
    'admin.news.pinned',
    'admin.news.unpinned',
    'admin.news.confirmDelete',
    'admin.news.empty',
    'admin.news.modal.addTitle',
    'admin.news.modal.editTitle',
    'admin.news.modal.titleLabel',
    'admin.news.modal.titlePlaceholder',
    'admin.news.modal.categoryLabel',
    'admin.news.modal.categoryPlaceholder',
    'admin.news.modal.dateLabel',
    'admin.news.modal.excerptLabel',
    'admin.news.modal.excerptPlaceholder',
    'admin.news.modal.fullContentLabel',
    'admin.news.modal.fullContentPlaceholder',
    'admin.news.modal.imageLabel',
    'admin.news.modal.imageError',
    'admin.news.modal.externalUrlLabel',
    'admin.news.modal.optionalTag',
    'admin.news.modal.externalUrlHint',
    'admin.news.modal.pinCheckbox',
    'admin.news.modal.saveChanges',
    'admin.news.modal.add',

    // Plans
    'admin.plans.title',
    'admin.plans.addPlan',
    'admin.plans.emptyPlans',
    'admin.plans.planPrefix',
    'admin.plans.progressLabel',
    'admin.plans.previewPdf',
    'admin.plans.confirmDeletePlan',
    'admin.plans.reportsTitle',
    'admin.plans.addReport',
    'admin.plans.emptyReports',
    'admin.plans.generalBadge',
    'admin.plans.viewReportBtn',
    'admin.plans.confirmDeleteReport',
    'admin.plans.statuses.planned',
    'admin.plans.statuses.inProgress',
    'admin.plans.statuses.completed',
    'admin.plans.planModal.addTitle',
    'admin.plans.planModal.editTitle',
    'admin.plans.planModal.titleLabel',
    'admin.plans.planModal.committeeLabel',
    'admin.plans.planModal.descriptionLabel',
    'admin.plans.planModal.statusLabel',
    'admin.plans.planModal.progressRatioLabel',
    'admin.plans.planModal.quarterLabel',
    'admin.plans.planModal.quarters.q1_2026',
    'admin.plans.planModal.quarters.q2_2026',
    'admin.plans.planModal.quarters.q3_2026',
    'admin.plans.planModal.quarters.q4_2026',
    'admin.plans.planModal.quarters.year_2026',
    'admin.plans.planModal.quarters.q1_2027',
    'admin.plans.planModal.ownerLabel',
    'admin.plans.planModal.documentLabel',
    'admin.plans.planModal.documentError',
    'admin.plans.planModal.saveChanges',
    'admin.plans.planModal.add',
    'admin.plans.reportModal.addTitle',
    'admin.plans.reportModal.editTitle',
    'admin.plans.reportModal.titleLabel',
    'admin.plans.reportModal.typeLabel',
    'admin.plans.reportModal.reportTypes.annual',
    'admin.plans.reportModal.reportTypes.quarterly',
    'admin.plans.reportModal.reportTypes.committee',
    'admin.plans.reportModal.committeeLabel',
    'admin.plans.reportModal.dateLabel',
    'admin.plans.reportModal.periodLabel',
    'admin.plans.reportModal.periodPlaceholder',
    'admin.plans.reportModal.summaryLabel',
    'admin.plans.reportModal.documentLabel',
    'admin.plans.reportModal.documentError',
    'admin.plans.reportModal.generalReportLabel',
    'admin.plans.reportModal.saveChanges',
    'admin.plans.reportModal.add',
    'admin.plans.viewModal.modalTitle',
    'admin.plans.viewModal.executiveSummaryTitle',
    'admin.plans.viewModal.downloadPdf',
    'admin.plans.viewModal.noPdfAttached',
  ];

  const getVal = (dict, keyPath) => keyPath.split('.').reduce((acc, part) => acc?.[part], dict);

  for (const k of requiredKeys) {
    assert.ok(getVal(ar, k), `Missing AR key: ${k}`);
    assert.ok(getVal(tr, k), `Missing TR key: ${k}`);
    assert.ok(getVal(en, k), `Missing EN key: ${k}`);
  }
});

test('2. Dictionary parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = collectLeafKeys(ar);
  const trKeys = collectLeafKeys(tr);
  const enKeys = collectLeafKeys(en);

  assert.deepEqual(trKeys, arKeys, 'TR keys must match AR keys exactly');
  assert.deepEqual(enKeys, arKeys, 'EN keys must match AR keys exactly');
});

test('3. SiteEditsPanel uses translations for static UI', async () => {
  const code = await read('src/components/SiteEditsPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.siteEdits\.title/);
  assert.match(code, /admin\.siteEdits\.pendingCount/);
  assert.match(code, /admin\.siteEdits\.currentData/);
  assert.match(code, /admin\.siteEdits\.proposedData/);
  assert.match(code, /admin\.siteEdits\.approveAndPublish/);
  assert.match(code, /admin\.siteEdits\.reject/);
  assert.match(code, /admin\.siteEdits\.editThenApprove/);
  assert.match(code, /admin\.siteEdits\.saveAndPublishRevised/);
});

test('4. SiteBrandingPanel uses translations for static UI', async () => {
  const code = await read('src/components/SiteBrandingPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.branding\.title/);
  assert.match(code, /admin\.branding\.subtitle/);
  assert.match(code, /admin\.branding\.currentLogo/);
  assert.match(code, /admin\.branding\.previewNotice/);
  assert.match(code, /admin\.branding\.logoLabel/);
});

test('5. EditsHistoryPanel uses translations for static UI', async () => {
  const code = await read('src/components/EditsHistoryPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.history\.title/);
  assert.match(code, /admin\.history\.officialCount/);
  assert.match(code, /admin\.history\.filters\.all/);
  assert.match(code, /admin\.history\.filters\.site/);
  assert.match(code, /admin\.history\.filters\.profile/);
  assert.match(code, /admin\.history\.decisions\./);
});

test('6. EventsTab uses translations for static UI', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.events\.searchPlaceholder/);
  assert.match(code, /admin\.events\.addEvent/);
  assert.match(code, /admin\.events\.table\.event/);
  assert.match(code, /admin\.events\.table\.category/);
  assert.match(code, /admin\.events\.modal\.addTitle/);
  assert.match(code, /admin\.events\.modal\.titleLabel/);
  assert.match(code, /admin\.events\.confirmDelete/);
});

test('7. GalleryTab uses translations for static UI', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.gallery\.countSummary/);
  assert.match(code, /admin\.gallery\.addAlbum/);
  assert.match(code, /admin\.gallery\.albumModal\.addTitle/);
  assert.match(code, /admin\.gallery\.mediaModal\.mediaTypeLabel/);
  assert.match(code, /admin\.gallery\.confirmDeleteAlbum/);
});

test('8. NewsTab uses translations for static UI', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.news\.addNews/);
  assert.match(code, /admin\.news\.pinTitle/);
  assert.match(code, /admin\.news\.pinned/);
  assert.match(code, /admin\.news\.unpinned/);
  assert.match(code, /admin\.news\.modal\.addTitle/);
  assert.match(code, /admin\.news\.confirmDelete/);
});

test('9. PlansTab uses translations for static UI', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.plans\.title/);
  assert.match(code, /admin\.plans\.addPlan/);
  assert.match(code, /admin\.plans\.reportsTitle/);
  assert.match(code, /admin\.plans\.addReport/);
  assert.match(code, /admin\.plans\.planModal\.addTitle/);
  assert.match(code, /admin\.plans\.reportModal\.addTitle/);
  assert.match(code, /admin\.plans\.viewModal\.modalTitle/);
});

test('10. Dynamic CMS values remain untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  // Event dynamic values
  assert.match(code, /e\.title/);
  assert.match(code, /e\.location/);
  assert.match(code, /e\.description/);

  // Gallery dynamic values
  assert.match(code, /album\.title/);
  assert.match(code, /album\.location/);
  assert.match(code, /album\.description/);
  assert.match(code, /m\.caption/);

  // News dynamic values
  assert.match(code, /n\.title/);
  assert.match(code, /n\.excerpt/);

  // Plan/Report dynamic values
  assert.match(code, /p\.title/);
  assert.match(code, /p\.description/);
  assert.match(code, /p\.owner/);
  assert.match(code, /r\.title/);
  assert.match(code, /r\.summary/);
});

test('11. Existing CMS approval behavior unchanged', async () => {
  const code = await read('src/components/SiteEditsPanel.tsx');

  assert.match(code, /approveSiteEdit\(id\)/);
  assert.match(code, /rejectSiteEdit\(id\)/);
  assert.match(code, /approveSiteEditWithChanges\(editingEdit\.id, diffs\)/);
});

test('12. Existing publication behavior unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /savePublishedSiteTarget\('events',/);
  assert.match(code, /createPublishedEvent\(newEvent\)/);
  assert.match(code, /savePublishedSiteTarget\('galleryAlbums',/);
  assert.match(code, /savePublishedSiteTarget\('news',/);
  assert.match(code, /savePublishedSiteTarget\('plans',/);
  assert.match(code, /savePublishedSiteTarget\('reports',/);
});

test('13. Existing role authorization unchanged', async () => {
  const dashboardCode = await read('src/pages/AdminDashboard.tsx');
  const siteEditsCode = await read('src/components/SiteEditsPanel.tsx');
  const brandingCode = await read('src/components/SiteBrandingPanel.tsx');
  const historyCode = await read('src/components/EditsHistoryPanel.tsx');

  assert.match(siteEditsCode, /if \(!currentUser \|\| currentUser\.role !== 'PRESIDENT'\) return null;/);
  assert.match(brandingCode, /if \(currentUser\?\.role !== 'PRESIDENT'\) return null;/);
  assert.match(historyCode, /if \(!currentUser \|\| currentUser\.role === 'STUDENT'\) return null;/);
  assert.match(dashboardCode, /const isPresident = currentUser\?\.role === 'PRESIDENT';/);
  assert.match(dashboardCode, /canCreateExecutiveContent\(currentUser\?\.role\)/);
});

test('14. Existing RPC/database payloads unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  // newsDiffs retains canonical payload structure
  assert.match(code, /label: 'حذف الخبر'/);
  assert.match(code, /title.*category.*date.*excerpt.*fullContent/);
  assert.match(code, /pageId: 'home', pageLabel: 'الأخبار'/);
});

test('15. No multilingual CMS persistence added', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /cms_localizations/);
  assert.doesNotMatch(code, /localization_drafts/);
  assert.doesNotMatch(code, /titleEn|titleTr|descriptionEn|descriptionTr/);
});

test('16. No machine translation API added', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /google\.translate|translate\.googleapis|deepl/i);
});

test('17. No Supabase schema changes', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /supabase\.from/);
  assert.doesNotMatch(code, /supabase\.rpc/);
});

test('18. Operational panels remain untouched for 5C3B3', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /<ExcuseReviewPanel/);
  assert.match(code, /<OversightEvaluationPanel/);
  assert.match(code, /<TaskManagementDashboard/);
  assert.match(code, /<MemberPointsAdminPanel/);
  assert.match(code, /<GuideSuggestionsPanel/);
  assert.match(code, /function ContactInboxTab/);
  assert.match(code, /function SuggestionsTab/);
});
