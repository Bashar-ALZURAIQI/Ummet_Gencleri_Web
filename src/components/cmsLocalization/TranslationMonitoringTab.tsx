import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  FileEdit,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  Globe2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCmsLocalizationRepository } from '../../context/CmsLocalizationContext.tsx';
import {
  computeOverallMonitoringSummary,
  type TranslationMonitoringSummary,
  type TranslationTargetHealth,
  type TranslationFieldHealth,
  type TranslationMonitoringStatus,
} from '../../domain/translationMonitoring.ts';
import { resolveCmsEditDestination } from '../../domain/translationNavigation.ts';
import { type CmsLocalizationRecord, type JsonValue, CMS_TARGETS } from '../../domain/cmsLocalization.ts';

export default function TranslationMonitoringTab() {
  const { t } = useTranslation();
  const {
    navigate,
    siteContent,
    canonicalSiteContent,
    aboutContent,
    canonicalAboutContent,
    programsContent,
    canonicalProgramsContent,
    events,
    canonicalEvents,
    galleryAlbums,
    canonicalGalleryAlbums,
    galleryCategories,
    canonicalGalleryCategories,
    guideSections,
    canonicalGuideSections,
    guideQuickInfo,
    canonicalGuideQuickInfo,
    faqCategories,
    canonicalFaqCategories,
    contactCards,
    canonicalContactCards,
    contactMap,
    canonicalContactMap,
    news,
    canonicalNews,
    plans,
    canonicalPlans,
    reports,
    canonicalReports,
    committees,
    canonicalCommittees,
  } = useApp();

  const repository = useCmsLocalizationRepository();

  const [records, setRecords] = useState<CmsLocalizationRecord<JsonValue>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state: expanded targets set
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  // UI state: per-target "show all fields" toggle (default is problematic only)
  const [showAllFieldsMap, setShowAllFieldsMap] = useState<Record<string, boolean>>({});

  // Map canonical inputs
  const canonicalMap = useMemo(() => {
    return {
      site: canonicalSiteContent ?? siteContent,
      about: canonicalAboutContent ?? aboutContent,
      programsContent: canonicalProgramsContent ?? programsContent,
      events: canonicalEvents ?? events,
      galleryAlbums: canonicalGalleryAlbums ?? galleryAlbums,
      galleryCategories: canonicalGalleryCategories ?? galleryCategories,
      guideSections: canonicalGuideSections ?? guideSections,
      guideQuickInfo: canonicalGuideQuickInfo ?? guideQuickInfo,
      faqCategories: canonicalFaqCategories ?? faqCategories,
      contactCards: canonicalContactCards ?? contactCards,
      contactMap: canonicalContactMap ?? contactMap,
      news: canonicalNews ?? news,
      plans: canonicalPlans ?? plans,
      reports: canonicalReports ?? reports,
      committees: canonicalCommittees ?? committees,
    };
  }, [
    canonicalSiteContent, siteContent,
    canonicalAboutContent, aboutContent,
    canonicalProgramsContent, programsContent,
    canonicalEvents, events,
    canonicalGalleryAlbums, galleryAlbums,
    canonicalGalleryCategories, galleryCategories,
    canonicalGuideSections, guideSections,
    canonicalGuideQuickInfo, guideQuickInfo,
    canonicalFaqCategories, faqCategories,
    canonicalContactCards, contactCards,
    canonicalContactMap, contactMap,
    canonicalNews, news,
    canonicalPlans, plans,
    canonicalReports, reports,
    canonicalCommittees, committees,
  ]);

  const loadMonitoringData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await repository.listMonitoringRecords();
      setRecords(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.translationMonitoring.error', 'تعذر تحميل بيانات مراقبة الترجمة'));
    } finally {
      setLoading(false);
    }
  }, [repository, t]);

  useEffect(() => {
    void loadMonitoringData();
  }, [loadMonitoringData]);

  // Compute overall summary and target healths
  const summary: TranslationMonitoringSummary = useMemo(() => {
    return computeOverallMonitoringSummary({
      canonicalMap,
      records,
      targets: CMS_TARGETS,
    });
  }, [canonicalMap, records]);

  const toggleTargetExpanded = (target: string) => {
    setExpandedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  const toggleShowAllFields = (target: string) => {
    setShowAllFieldsMap((prev) => ({
      ...prev,
      [target]: !prev[target],
    }));
  };

  const handleGoToEdit = (target: string, path: string, entityId?: string) => {
    const destination = resolveCmsEditDestination(target, path, entityId);
    navigate(destination);
  };

  const renderStatusBadge = (status: TranslationMonitoringStatus) => {
    switch (status) {
      case 'fresh':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {t('admin.translationMonitoring.fresh', 'محدث')}
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <FileEdit className="w-3 h-3 text-sky-600" />
            {t('admin.translationMonitoring.draft', 'مسودة')}
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            {t('admin.translationMonitoring.stale', 'قديم')}
          </span>
        );
      case 'missing':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            {t('admin.translationMonitoring.missing', 'ناقص')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {t('admin.translationMonitoring.title', 'مراقبة الترجمة')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {t('admin.translationMonitoring.subtitle', 'متابعة حالة ترجمات المحتوى باللغتين التركية والإنجليزية وتحديد الحقول الناقصة أو القديمة أو قيد المسودة.')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadMonitoringData()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-300 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          {t('admin.translationMonitoring.refresh', 'تحديث البيانات')}
        </button>
      </div>

      {/* Loading state */}
      {loading && records.length === 0 && (
        <div className="p-12 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
          <RefreshCw className="w-8 h-8 mx-auto text-emerald-600 animate-spin mb-3" />
          <p className="text-gray-600 font-medium">
            {t('admin.translationMonitoring.loading', 'جارٍ تحميل بيانات الترجمة...')}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl shadow-sm text-rose-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">{t('admin.translationMonitoring.error', 'تعذر تحميل بيانات مراقبة الترجمة')}</h3>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadMonitoringData()}
            className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded hover:bg-rose-700 transition"
          >
            {t('admin.translationMonitoring.retry', 'إعادة المحاولة')}
          </button>
        </div>
      )}

      {/* Positive 100% All-Fresh Alert */}
      {!loading && !error && summary.freshPercentage === 100 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-900 shadow-sm">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold">{t('admin.translationMonitoring.allUpToDate', 'جميع الترجمات محدثة')}</span>
            <p className="text-xs text-emerald-700 mt-0.5">
              {t('admin.translationMonitoring.allUpToDateDesc', 'جميع الحقول القابلة للترجمة محدثة بالكامل ولا توجد مسودات معلقة أو حقول ناقصة.')}
            </p>
          </div>
        </div>
      )}

      {/* Top Summary Cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Fresh Card */}
          <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="text-sm font-semibold">{t('admin.translationMonitoring.fresh', 'محدث')}</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-gray-900">{summary.fresh}</span>
              <span className="text-lg font-bold text-emerald-600">{summary.freshPercentage}%</span>
            </div>
          </div>

          {/* Missing Card */}
          <div className="bg-white p-5 rounded-xl border border-rose-200 shadow-sm">
            <div className="flex items-center justify-between text-rose-700">
              <span className="text-sm font-semibold">{t('admin.translationMonitoring.missing', 'ناقص')}</span>
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-gray-900">{summary.missing}</span>
              <span className="text-lg font-bold text-rose-600">{summary.missingPercentage}%</span>
            </div>
          </div>

          {/* Stale Card */}
          <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-sm font-semibold">{t('admin.translationMonitoring.stale', 'قديم')}</span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-gray-900">{summary.stale}</span>
              <span className="text-lg font-bold text-amber-600">{summary.stalePercentage}%</span>
            </div>
          </div>

          {/* Draft Card */}
          <div className="bg-white p-5 rounded-xl border border-sky-200 shadow-sm">
            <div className="flex items-center justify-between text-sky-700">
              <span className="text-sm font-semibold">{t('admin.translationMonitoring.draft', 'مسودة')}</span>
              <FileEdit className="w-5 h-5 text-sky-600" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-gray-900">{summary.draft}</span>
              <span className="text-lg font-bold text-sky-600">{summary.draftPercentage}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Language Breakdown Bars */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-800">
                  {t('admin.translationMonitoring.turkish', 'التركية')} (TR)
                </span>
                <span className="text-lg font-extrabold text-emerald-600">{summary.tr.freshPercentage}% Fresh</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full"
                  style={{ width: `${summary.tr.freshPercentage}%` }}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span>{t('admin.translationMonitoring.fresh', 'محدث')}: <b className="text-emerald-700">{summary.tr.fresh}</b></span>
              <span>{t('admin.translationMonitoring.missing', 'ناقص')}: <b className="text-rose-700">{summary.tr.missing}</b></span>
              <span>{t('admin.translationMonitoring.stale', 'قديم')}: <b className="text-amber-700">{summary.tr.stale}</b></span>
              <span>{t('admin.translationMonitoring.draft', 'مسودة')}: <b className="text-sky-700">{summary.tr.draft}</b></span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-800">
                  {t('admin.translationMonitoring.english', 'الإنجليزية')} (EN)
                </span>
                <span className="text-lg font-extrabold text-emerald-600">{summary.en.freshPercentage}% Fresh</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full"
                  style={{ width: `${summary.en.freshPercentage}%` }}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span>{t('admin.translationMonitoring.fresh', 'محدث')}: <b className="text-emerald-700">{summary.en.fresh}</b></span>
              <span>{t('admin.translationMonitoring.missing', 'ناقص')}: <b className="text-rose-700">{summary.en.missing}</b></span>
              <span>{t('admin.translationMonitoring.stale', 'قديم')}: <b className="text-amber-700">{summary.en.stale}</b></span>
              <span>{t('admin.translationMonitoring.draft', 'مسودة')}: <b className="text-sky-700">{summary.en.draft}</b></span>
            </div>
          </div>
        </div>
      )}

      {/* Target Level Summaries */}
      {!loading && !error && (
        <div className="space-y-4">
          {summary.targets.map((targetHealth: TranslationTargetHealth) => {
            const isExpanded = expandedTargets.has(targetHealth.target);
            const showAllFields = Boolean(showAllFieldsMap[targetHealth.target]);

            // Group fields by path
            const fieldsByPath = new Map<string, { tr?: TranslationFieldHealth; en?: TranslationFieldHealth }>();
            for (const f of targetHealth.fields) {
              const cur = fieldsByPath.get(f.path) ?? {};
              if (f.locale === 'tr') cur.tr = f;
              if (f.locale === 'en') cur.en = f;
              fieldsByPath.set(f.path, cur);
            }

            // Filter fields
            const pathEntries = Array.from(fieldsByPath.entries());
            const displayEntries = showAllFields
              ? pathEntries
              : pathEntries.filter(([, pair]) => {
                  const trProb = pair.tr?.status && pair.tr.status !== 'fresh';
                  const enProb = pair.en?.status && pair.en.status !== 'fresh';
                  return trProb || enProb;
                });

            const hasProblematicFields = pathEntries.some(([, pair]) => {
              return (pair.tr?.status && pair.tr.status !== 'fresh') || (pair.en?.status && pair.en.status !== 'fresh');
            });

            return (
              <div
                key={targetHealth.target}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-shadow hover:shadow"
              >
                {/* Section Header Card */}
                <div
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none bg-white hover:bg-gray-50/75 transition"
                  onClick={() => toggleTargetExpanded(targetHealth.target)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-gray-200/60 text-gray-500 transition"
                      aria-label="Toggle section"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">
                        {t(`admin.translationMonitoring.targets.${targetHealth.target}`, targetHealth.target)}
                      </h2>
                      <span className="text-xs text-gray-500 font-mono">
                        {targetHealth.target} · {targetHealth.tr.totalFields} {t('admin.translationMonitoring.totalFields', 'حقول')}
                      </span>
                    </div>
                  </div>

                  {/* Metrics Badges */}
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    {/* TR badge */}
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">TR</span>
                      <span className="font-bold text-gray-800">{targetHealth.tr.freshPercentage}%</span>
                      {targetHealth.tr.missing > 0 && (
                        <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          {targetHealth.tr.missing} {t('admin.translationMonitoring.missing', 'ناقص')}
                        </span>
                      )}
                      {targetHealth.tr.stale > 0 && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {targetHealth.tr.stale} {t('admin.translationMonitoring.stale', 'قديم')}
                        </span>
                      )}
                      {targetHealth.tr.draft > 0 && (
                        <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
                          {targetHealth.tr.draft} {t('admin.translationMonitoring.draft', 'مسودة')}
                        </span>
                      )}
                    </div>

                    {/* EN badge */}
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">EN</span>
                      <span className="font-bold text-gray-800">{targetHealth.en.freshPercentage}%</span>
                      {targetHealth.en.missing > 0 && (
                        <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          {targetHealth.en.missing} {t('admin.translationMonitoring.missing', 'ناقص')}
                        </span>
                      )}
                      {targetHealth.en.stale > 0 && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {targetHealth.en.stale} {t('admin.translationMonitoring.stale', 'قديم')}
                        </span>
                      )}
                      {targetHealth.en.draft > 0 && (
                        <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
                          {targetHealth.en.draft} {t('admin.translationMonitoring.draft', 'مسودة')}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-emerald-700 font-semibold underline">
                      {isExpanded
                        ? t('admin.translationMonitoring.collapseDetails', 'إخفاء التفاصيل')
                        : t('admin.translationMonitoring.expandDetails', 'عرض التفاصيل')}
                    </span>
                  </div>
                </div>

                {/* Expanded Field Details Table */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50/50 p-4 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 font-medium">
                        {showAllFields
                          ? `${pathEntries.length} ${t('admin.translationMonitoring.totalFields', 'حقول')}`
                          : `${displayEntries.length} ${t('admin.translationMonitoring.showIssuesOnly', 'حقول تتطلب اهتماماً')}`}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleShowAllFields(targetHealth.target);
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                      >
                        {showAllFields
                          ? t('admin.translationMonitoring.showIssuesOnly', 'إظهار المشاكل فقط')
                          : t('admin.translationMonitoring.showAllFields', 'إظهار جميع الحقول')}
                      </button>
                    </div>

                    {displayEntries.length === 0 ? (
                      <div className="p-6 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-600">
                        {hasProblematicFields ? (
                          <span>{t('admin.translationMonitoring.noProblematicFields', 'لا توجد حقول تتطلب إجراءً.')}</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {t('admin.translationMonitoring.noProblematicFields', 'جميع ترجمات هذا القسم محدثة بالكامل.')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs">
                        <table className="w-full text-left text-sm text-gray-600 divide-y divide-gray-200">
                          <thead className="bg-gray-100 text-xs font-bold text-gray-700 uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3">{t('admin.translationMonitoring.field', 'الحقل')}</th>
                              <th className="px-4 py-3">{t('admin.translationMonitoring.canonicalArabic', 'المصدر (عربي)')}</th>
                              <th className="px-4 py-3">{t('admin.translationMonitoring.turkish', 'التركية')} (TR)</th>
                              <th className="px-4 py-3">{t('admin.translationMonitoring.english', 'الإنجليزية')} (EN)</th>
                              <th className="px-4 py-3 text-center">{t('admin.translationMonitoring.goToEdit', 'الإجراء')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 font-normal">
                            {displayEntries.map(([path, pair]) => {
                              const canon = pair.tr?.canonicalValue ?? pair.en?.canonicalValue ?? '';
                              const entityId = pair.tr?.entityId ?? pair.en?.entityId;

                              return (
                                <tr key={path} className="hover:bg-gray-50/80 transition">
                                  {/* Field path */}
                                  <td className="px-4 py-3 font-mono text-xs text-gray-800 align-top">
                                    <div className="font-semibold text-gray-900">{path}</div>
                                    {entityId && <div className="text-[10px] text-gray-400">ID: {entityId}</div>}
                                  </td>

                                  {/* Canonical text snippet */}
                                  <td className="px-4 py-3 text-xs text-gray-700 align-top max-w-xs truncate" title={canon}>
                                    {canon || '—'}
                                  </td>

                                  {/* TR Status & Preview */}
                                  <td className="px-4 py-3 align-top max-w-xs">
                                    <div className="flex flex-col items-start gap-1">
                                      {pair.tr ? renderStatusBadge(pair.tr.status) : '—'}
                                      {pair.tr?.publishedValue && (
                                        <span className="text-[11px] text-gray-500 truncate max-w-[200px]" title={pair.tr.publishedValue}>
                                          {pair.tr.publishedValue}
                                        </span>
                                      )}
                                      {pair.tr?.hasDraft && pair.tr.draftValue && (
                                        <span className="text-[10px] text-sky-600 bg-sky-50 px-1 rounded truncate max-w-[200px]" title={pair.tr.draftValue}>
                                          Draft: {pair.tr.draftValue}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* EN Status & Preview */}
                                  <td className="px-4 py-3 align-top max-w-xs">
                                    <div className="flex flex-col items-start gap-1">
                                      {pair.en ? renderStatusBadge(pair.en.status) : '—'}
                                      {pair.en?.publishedValue && (
                                        <span className="text-[11px] text-gray-500 truncate max-w-[200px]" title={pair.en.publishedValue}>
                                          {pair.en.publishedValue}
                                        </span>
                                      )}
                                      {pair.en?.hasDraft && pair.en.draftValue && (
                                        <span className="text-[10px] text-sky-600 bg-sky-50 px-1 rounded truncate max-w-[200px]" title={pair.en.draftValue}>
                                          Draft: {pair.en.draftValue}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Action Go To Edit */}
                                  <td className="px-4 py-3 text-center align-top whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleGoToEdit(targetHealth.target, path, entityId)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-md transition shadow-2xs"
                                    >
                                      <span>{t('admin.translationMonitoring.goToEdit', 'اذهب للتعديل')}</span>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
