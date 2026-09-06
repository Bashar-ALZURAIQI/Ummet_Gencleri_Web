import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Globe, Info, Sparkles } from 'lucide-react';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  type LocalizationStatus,
  type JsonValue,
  computeSourceHash,
  isLocalizationPathManual,
} from '../../domain/cmsLocalization.ts';
import type { CmsFieldKind } from '../../domain/cmsTranslatableFields.ts';
import {
  recordManualPath,
  isTranslatableLocationValue,
} from '../../domain/cmsLocalizationEditor.ts';
import {
  useCmsLocalizationRepository,
  useCmsTranslationProvider,
} from '../../context/CmsLocalizationContext.tsx';
import { TranslationStatusBadge } from './TranslationStatusBadge.tsx';
import { LocalizedFieldEditor } from './LocalizedFieldEditor.tsx';

export interface CmsEntityFieldConfig {
  name: string;
  label: string;
  kind: CmsFieldKind;
  canonicalValue: string;
  placeholder?: string;
  isLocation?: boolean;
}

export interface CmsEntityTranslationTabsProps {
  target: CmsTarget | string;
  recordId: string | null;
  canonicalPayload: unknown;
  fields: CmsEntityFieldConfig[];
  canEdit: boolean;
  translations: Record<LocalizedCmsLocale, Record<string, string>>;
  onTranslationChange: (locale: LocalizedCmsLocale, fieldName: string, value: string) => void;
  onDraftSaved?: (locale: LocalizedCmsLocale) => void;
  children: ReactNode;
}

interface LocaleStatusState {
  status: LocalizationStatus;
  isStale: boolean;
  isManual: boolean;
  manualPaths: readonly string[];
  saving: boolean;
  saveError: string | null;
  translating: boolean;
  translateError: string | null;
}

const createInitialStatusState = (): LocaleStatusState => ({
  status: 'missing',
  isStale: false,
  isManual: false,
  manualPaths: [],
  saving: false,
  saveError: null,
  translating: false,
  translateError: null,
});

function getFieldOrNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  if (path in obj && typeof obj[path] === 'string') {
    return obj[path] as string;
  }
  if (!path.includes('.')) {
    return undefined;
  }
  const parts = path.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    if (Array.isArray(curr)) {
      const idx = parseInt(part, 10);
      if (isNaN(idx)) return undefined;
      curr = curr[idx];
    } else if (typeof curr === 'object') {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof curr === 'string' ? curr : undefined;
}

function applyFieldTranslations(
  targetObj: Record<string, unknown>,
  translations: Record<string, string>,
) {
  for (const [key, val] of Object.entries(translations)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let curr: Record<string, unknown> | unknown[] = targetObj;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        const nextP = parts[i + 1];
        const isNextIndex = /^\d+$/.test(nextP);
        if (Array.isArray(curr)) {
          const idx = parseInt(p, 10);
          if (!curr[idx] || typeof curr[idx] !== 'object') {
            curr[idx] = isNextIndex ? [] : {};
          }
          curr = curr[idx] as Record<string, unknown> | unknown[];
        } else {
          const obj = curr as Record<string, unknown>;
          if (obj[p] === undefined || obj[p] === null || typeof obj[p] !== 'object') {
            obj[p] = isNextIndex ? [] : {};
          }
          curr = obj[p] as Record<string, unknown> | unknown[];
        }
      }
      const last = parts[parts.length - 1];
      if (Array.isArray(curr)) {
        const idx = parseInt(last, 10);
        curr[idx] = val;
      } else {
        (curr as Record<string, unknown>)[last] = val;
      }
    } else {
      targetObj[key] = val;
    }
  }
}

export function CmsEntityTranslationTabs({
  target,
  recordId,
  canonicalPayload,
  fields,
  canEdit,
  translations,
  onTranslationChange,
  onDraftSaved,
  children,
}: CmsEntityTranslationTabsProps) {
  const { t } = useTranslation();
  const repository = useCmsLocalizationRepository();
  const translationProvider = useCmsTranslationProvider();

  const [activeTab, setActiveTab] = useState<'ar' | LocalizedCmsLocale>('ar');
  const [trStatus, setTrStatus] = useState<LocaleStatusState>(createInitialStatusState);
  const [enStatus, setEnStatus] = useState<LocaleStatusState>(createInitialStatusState);

  // Load existing translations for recordId on mount / recordId change
  useEffect(() => {
    let cancelled = false;

    async function loadLocale(locale: LocalizedCmsLocale): Promise<{
      statusState: LocaleStatusState;
      loadedFields: Record<string, string>;
    }> {
      try {
        const [draftRecord, publishedRecord] = await Promise.all([
          repository.getDraft(target, locale),
          repository.getPublished(target, locale),
        ]);

        const activeRecord = draftRecord ?? publishedRecord;
        if (!activeRecord || !recordId) {
          return { statusState: createInitialStatusState(), loadedFields: {} };
        }

        // Find item in payload
        let item: Record<string, unknown> | null = null;
        if (Array.isArray(activeRecord.payload)) {
          if (recordId && recordId.includes('.stats.')) {
            const [commId, , sIdx] = recordId.split('.');
            const comm = (activeRecord.payload as Record<string, unknown>[]).find(
              (c) => c && c.id === commId,
            );
            if (comm && Array.isArray(comm.stats)) {
              item = comm.stats[parseInt(sIdx, 10)] as Record<string, unknown>;
            }
          } else {
            item = (activeRecord.payload as Record<string, unknown>[]).find(
              (el) => el && typeof el === 'object' && el.id === recordId,
            ) ?? null;
            if (!item) {
              for (const candidate of activeRecord.payload as Record<string, unknown>[]) {
                if (candidate && typeof candidate === 'object') {
                  for (const key of ['items', 'members', 'media'] as const) {
                    if (Array.isArray(candidate[key])) {
                      const nested = (candidate[key] as Record<string, unknown>[]).find(
                        (n) => n && typeof n === 'object' && n.id === recordId,
                      );
                      if (nested) {
                        item = nested;
                        break;
                      }
                    }
                  }
                  if (item) break;
                }
              }
            }
          }
        } else if (
          activeRecord.payload &&
          typeof activeRecord.payload === 'object'
        ) {
          const payloadObj = activeRecord.payload as Record<string, unknown>;
          if (
            payloadObj.id === recordId ||
            (!payloadObj.id && (!recordId || recordId === 'map' || recordId === 'contactMap' || recordId === 'header' || target === 'programsContent' || target === 'site' || target === 'about' || target === 'generalInfo'))
          ) {
            item = payloadObj;
          } else {
            for (const key of ['items', 'members', 'media'] as const) {
              if (Array.isArray(payloadObj[key])) {
                const nested = (payloadObj[key] as Record<string, unknown>[]).find(
                  (n) => n && typeof n === 'object' && n.id === recordId,
                );
                if (nested) {
                  item = nested;
                  break;
                }
              }
            }
            if (!item && recordId && payloadObj[recordId] && typeof payloadObj[recordId] === 'object') {
              item = payloadObj[recordId] as Record<string, unknown>;
            }
          }
        }

        const loadedFields: Record<string, string> = {};
        if (item) {
          for (const f of fields) {
            const val = getFieldOrNestedValue(item, f.name);
            if (typeof val === 'string') {
              loadedFields[f.name] = val;
            }
          }
        }

        const hasAnyContent = Object.values(loadedFields).some((v) => v.trim().length > 0);
        const derivedStatus: LocalizationStatus = hasAnyContent
          ? activeRecord.status
          : 'missing';

        return {
          statusState: {
            status: derivedStatus,
            isStale: activeRecord.status === 'stale',
            isManual: (activeRecord.manualPaths ?? []).length > 0,
            manualPaths: activeRecord.manualPaths ?? [],
            saving: false,
            saveError: null,
            translating: false,
            translateError: null,
          },
          loadedFields,
        };
      } catch {
        return { statusState: createInitialStatusState(), loadedFields: {} };
      }
    }

    async function loadAll() {
      const [trLoaded, enLoaded] = await Promise.all([
        loadLocale('tr'),
        loadLocale('en'),
      ]);
      if (cancelled) return;

      setTrStatus(trLoaded.statusState);
      setEnStatus(enLoaded.statusState);

      // Populate translations for existing record if not already modified
      for (const [k, v] of Object.entries(trLoaded.loadedFields)) {
        if (!translations.tr[k]) {
          onTranslationChange('tr', k, v);
        }
      }
      for (const [k, v] of Object.entries(enLoaded.loadedFields)) {
        if (!translations.en[k]) {
          onTranslationChange('en', k, v);
        }
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, recordId, repository]);

  const handleSaveDraft = async (locale: LocalizedCmsLocale) => {
    if (!canEdit || (!recordId && target !== 'contactMap' && target !== 'site' && target !== 'programsContent' && target !== 'about' && target !== 'generalInfo')) return;
    const updater = locale === 'tr' ? setTrStatus : setEnStatus;
    const localeTranslations = translations[locale];

    updater((prev) => ({ ...prev, saving: true, saveError: null }));

    try {
      const [latestDraft, latestPublished] = await Promise.all([
        repository.getDraft(target, locale),
        repository.getPublished(target, locale),
      ]);

      const baseCandidate = latestDraft?.payload ?? latestPublished?.payload ?? canonicalPayload;
      let nextPayload: JsonValue;

      if (Array.isArray(baseCandidate)) {
        const list: Record<string, unknown>[] = JSON.parse(JSON.stringify(baseCandidate));
        let found = false;
        if (recordId && recordId.includes('.stats.')) {
          const [commId, , sIdx] = recordId.split('.');
          const comm = list.find((c) => c && c.id === commId);
          if (comm) {
            if (!Array.isArray(comm.stats)) comm.stats = [];
            const statsList = comm.stats as Record<string, unknown>[];
            const sIndex = parseInt(sIdx, 10);
            if (!statsList[sIndex]) statsList[sIndex] = {};
            applyFieldTranslations(statsList[sIndex], localeTranslations);
            found = true;
          }
        } else {
          const idx = list.findIndex((el) => el && el.id === recordId);
          if (idx >= 0) {
            applyFieldTranslations(list[idx], localeTranslations);
            found = true;
          } else {
            // Check nested in items, members, or media
            for (const el of list) {
              if (el && typeof el === 'object') {
                for (const key of ['items', 'members', 'media'] as const) {
                  if (Array.isArray(el[key])) {
                    const nestedList = el[key] as Record<string, unknown>[];
                    const nIdx = nestedList.findIndex((n) => n && n.id === recordId);
                    if (nIdx >= 0) {
                      applyFieldTranslations(nestedList[nIdx], localeTranslations);
                      found = true;
                      break;
                    }
                  }
                }
                if (found) break;
              }
            }
          }
        }
        if (!found && recordId && !recordId.includes('.stats.')) {
          const newItem: Record<string, unknown> = { id: recordId };
          applyFieldTranslations(newItem, localeTranslations);
          list.push(newItem);
        }
        nextPayload = list as unknown as JsonValue;
      } else {
        const obj: Record<string, unknown> =
          baseCandidate && typeof baseCandidate === 'object'
            ? JSON.parse(JSON.stringify(baseCandidate))
            : {};
        let found = false;
        if (
          obj.id === recordId ||
          (!obj.id && (!recordId || recordId === 'map' || recordId === 'contactMap' || recordId === 'header' || target === 'programsContent' || target === 'site' || target === 'about' || target === 'generalInfo'))
        ) {
          applyFieldTranslations(obj, localeTranslations);
          found = true;
        } else {
          for (const key of ['items', 'members', 'media'] as const) {
            if (Array.isArray(obj[key])) {
              const nestedList = obj[key] as Record<string, unknown>[];
              const nIdx = nestedList.findIndex((n) => n && n.id === recordId);
              if (nIdx >= 0) {
                applyFieldTranslations(nestedList[nIdx], localeTranslations);
                found = true;
                break;
              }
            }
          }
        }
        if (!found && recordId) {
          const targetNested = ((obj[recordId] as Record<string, unknown>) ?? {});
          applyFieldTranslations(targetNested, localeTranslations);
          obj[recordId] = targetNested;
        }
        nextPayload = obj as unknown as JsonValue;
      }

      const activeRecord = latestDraft ?? latestPublished;
      let updatedManual = activeRecord?.manualPaths ? [...activeRecord.manualPaths] : [];
      for (const f of fields) {
        if (localeTranslations[f.name]?.trim()) {
          const pathToAdd = recordId ? `${recordId}.${f.name}` : f.name;
          updatedManual = recordManualPath(updatedManual, pathToAdd);
        }
      }

      const recordToSave: CmsLocalizationRecord = {
        target,
        locale,
        payload: nextPayload,
        status: 'draft',
        manualPaths: updatedManual,
        stalePaths: activeRecord?.stalePaths ?? [],
        sourceHash: computeSourceHash(canonicalPayload),
        sourceVersion: activeRecord?.sourceVersion,
        updatedAt: new Date().toISOString(),
      };

      await repository.saveDraft(recordToSave);

      updater((prev) => ({
        ...prev,
        saving: false,
        status: 'draft',
        saveError: null,
      }));

      onDraftSaved?.(locale);
    } catch {
      updater((prev) => ({
        ...prev,
        saving: false,
        saveError: t('cmsLocalization.saveFailed', 'تعذر حفظ المسودة.'),
      }));
    }
  };

  const handleAutoTranslate = async (locale: LocalizedCmsLocale) => {
    if (!canEdit) return;
    const currentStatus = locale === 'tr' ? trStatus : enStatus;
    const updater = locale === 'tr' ? setTrStatus : setEnStatus;
    const currentTranslations = translations[locale];

    // Determine eligible candidate fields
    const candidateFields: Record<string, string> = {};
    const manualPaths = currentStatus.manualPaths ?? [];

    for (const f of fields) {
      if (f.isLocation && !isTranslatableLocationValue(f.canonicalValue)) {
        continue;
      }
      if (!f.canonicalValue || !f.canonicalValue.trim()) {
        continue;
      }

      const fieldPath = recordId ? `${recordId}.${f.name}` : f.name;
      // Protect human manual edits
      if (isLocalizationPathManual(fieldPath, manualPaths) || isLocalizationPathManual(f.name, manualPaths)) {
        continue;
      }

      const existingVal = currentTranslations[f.name];
      if (currentStatus.status === 'stale') {
        candidateFields[f.name] = f.canonicalValue;
      } else {
        if (!existingVal || !existingVal.trim()) {
          candidateFields[f.name] = f.canonicalValue;
        }
      }
    }

    if (Object.keys(candidateFields).length === 0) {
      updater((prev) => ({
        ...prev,
        translateError: t('cmsLocalization.noChangesToTranslate', 'لا توجد تغييرات تتطلب الترجمة'),
      }));
      return;
    }

    updater((prev) => ({ ...prev, translating: true, translateError: null }));

    try {
      const result = await translationProvider.translate({
        sourceLocale: 'ar',
        targetLocale: locale,
        fields: candidateFields,
      });

      const translatedEntries = result.translations;

      // Update parent translation form state immediately
      for (const [key, val] of Object.entries(translatedEntries)) {
        onTranslationChange(locale, key, val);
      }

      // Persist draft into repository if target allows record persistence
      if (recordId || target === 'contactMap' || target === 'site' || target === 'programsContent' || target === 'about' || target === 'generalInfo') {
        const [latestDraft, latestPublished] = await Promise.all([
          repository.getDraft(target, locale),
          repository.getPublished(target, locale),
        ]);

        const baseCandidate = latestDraft?.payload ?? latestPublished?.payload ?? canonicalPayload;
        let nextPayload: JsonValue;

        const combinedTranslations = {
          ...currentTranslations,
          ...translatedEntries,
        };

        if (Array.isArray(baseCandidate)) {
          const list: Record<string, unknown>[] = JSON.parse(JSON.stringify(baseCandidate));
          let found = false;
          if (recordId && recordId.includes('.stats.')) {
            const [commId, , sIdx] = recordId.split('.');
            const comm = list.find((c) => c && c.id === commId);
            if (comm) {
              if (!Array.isArray(comm.stats)) comm.stats = [];
              const statsList = comm.stats as Record<string, unknown>[];
              const sIndex = parseInt(sIdx, 10);
              if (!statsList[sIndex]) statsList[sIndex] = {};
              applyFieldTranslations(statsList[sIndex], combinedTranslations);
              found = true;
            }
          } else {
            const idx = list.findIndex((el) => el && el.id === recordId);
            if (idx >= 0) {
              applyFieldTranslations(list[idx], combinedTranslations);
              found = true;
            } else {
              for (const el of list) {
                if (el && typeof el === 'object') {
                  for (const key of ['items', 'members', 'media'] as const) {
                    if (Array.isArray(el[key])) {
                      const nestedList = el[key] as Record<string, unknown>[];
                      const nIdx = nestedList.findIndex((n) => n && n.id === recordId);
                      if (nIdx >= 0) {
                        applyFieldTranslations(nestedList[nIdx], combinedTranslations);
                        found = true;
                        break;
                      }
                    }
                  }
                  if (found) break;
                }
              }
            }
          }
          if (!found && recordId && !recordId.includes('.stats.')) {
            const newItem: Record<string, unknown> = { id: recordId };
            applyFieldTranslations(newItem, combinedTranslations);
            list.push(newItem);
          }
          nextPayload = list as unknown as JsonValue;
        } else {
          const obj: Record<string, unknown> =
            baseCandidate && typeof baseCandidate === 'object'
              ? JSON.parse(JSON.stringify(baseCandidate))
              : {};
          let found = false;
          if (
            obj.id === recordId ||
            (!obj.id && (!recordId || recordId === 'map' || recordId === 'contactMap' || recordId === 'header' || target === 'programsContent' || target === 'site' || target === 'about' || target === 'generalInfo'))
          ) {
            applyFieldTranslations(obj, combinedTranslations);
            found = true;
          } else {
            for (const key of ['items', 'members', 'media'] as const) {
              if (Array.isArray(obj[key])) {
                const nestedList = obj[key] as Record<string, unknown>[];
                const nIdx = nestedList.findIndex((n) => n && n.id === recordId);
                if (nIdx >= 0) {
                  applyFieldTranslations(nestedList[nIdx], combinedTranslations);
                  found = true;
                  break;
                }
              }
            }
          }
          if (!found && recordId) {
            const targetNested = ((obj[recordId] as Record<string, unknown>) ?? {});
            applyFieldTranslations(targetNested, combinedTranslations);
            obj[recordId] = targetNested;
          }
          nextPayload = obj as unknown as JsonValue;
        }

        const activeRecord = latestDraft ?? latestPublished;
        // Strictly preserve manual paths without adding machine-translated fields
        const preservedManual = activeRecord?.manualPaths ? [...activeRecord.manualPaths] : [];

        // Clear refreshed paths from stalePaths
        const refreshedKeys = new Set(Object.keys(translatedEntries));
        const updatedStalePaths = (activeRecord?.stalePaths ?? []).filter((p) => {
          const key = p.includes('.') ? p.split('.').pop()! : p;
          return !refreshedKeys.has(key);
        });

        const recordToSave: CmsLocalizationRecord = {
          target,
          locale,
          payload: nextPayload,
          status: 'draft',
          manualPaths: preservedManual,
          stalePaths: updatedStalePaths,
          sourceHash: computeSourceHash(canonicalPayload),
          sourceVersion: activeRecord?.sourceVersion,
          updatedAt: new Date().toISOString(),
        };

        await repository.saveDraft(recordToSave);
        onDraftSaved?.(locale);
      }

      updater((prev) => ({
        ...prev,
        translating: false,
        status: 'draft',
        isStale: false,
        translateError: null,
      }));
    } catch {
      updater((prev) => ({
        ...prev,
        translating: false,
        translateError: t('cmsLocalization.translationFailed', 'فشلت الترجمة'),
      }));
    }
  };

  const handleTranslateBoth = async () => {
    if (!canEdit) return;
    await Promise.allSettled([
      handleAutoTranslate('tr'),
      handleAutoTranslate('en'),
    ]);
  };

  return (
    <div className="space-y-4">
      {/* Tabs Header */}
      <div className="flex items-center justify-between gap-1 rounded-xl bg-navy-50/70 p-1 border border-navy-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ar')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'ar'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-navy-500" />
            <span>{t('cmsLocalization.tabs.arabic', 'العربية (المصدر)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tr')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'tr'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <span>Türkçe</span>
            <TranslationStatusBadge status={trStatus.status} size="sm" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('en')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'en'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <span>English</span>
            <TranslationStatusBadge status={enStatus.status} size="sm" />
          </button>
        </div>

        {(trStatus.status === 'missing' || trStatus.status === 'stale' || enStatus.status === 'missing' || enStatus.status === 'stale') && (
          <button
            type="button"
            onClick={() => void handleTranslateBoth()}
            disabled={!canEdit || trStatus.translating || enStatus.translating}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-primary-700 bg-primary-50/80 hover:bg-primary-100 border border-primary-200 transition-colors disabled:opacity-50"
            title={t('cmsLocalization.translateBoth', 'ترجمة للتركية والإنجليزية')}
          >
            <Sparkles className="h-3 w-3" />
            <span>{t('cmsLocalization.translateBoth', 'TR + EN')}</span>
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {activeTab === 'ar' ? (
        <div dir="rtl" className="space-y-4">
          {children}
        </div>
      ) : (
        <div className="space-y-3.5 rounded-xl border border-navy-100 bg-navy-50/30 p-3.5">
          <div className="flex items-center justify-between border-b border-navy-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-navy-900">
                {activeTab === 'tr' ? 'Türkçe Çeviri' : 'English Translation'}
              </span>
              <TranslationStatusBadge
                status={activeTab === 'tr' ? trStatus.status : enStatus.status}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {(activeTab === 'tr' ? trStatus.status : enStatus.status) === 'missing' && (
                <button
                  type="button"
                  onClick={() => void handleAutoTranslate(activeTab)}
                  disabled={!canEdit || (activeTab === 'tr' ? trStatus.translating : enStatus.translating)}
                  className="inline-flex items-center gap-1 rounded bg-primary-50 text-primary-700 hover:bg-primary-100 px-2.5 py-1 text-xs font-semibold border border-primary-200 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {(activeTab === 'tr' ? trStatus.translating : enStatus.translating)
                    ? t('cmsLocalization.translating', 'جارٍ الترجمة...')
                    : t('cmsLocalization.translate', 'ترجمة')}
                </button>
              )}
              {(activeTab === 'tr' ? trStatus.status : enStatus.status) === 'stale' && (
                <button
                  type="button"
                  onClick={() => void handleAutoTranslate(activeTab)}
                  disabled={!canEdit || (activeTab === 'tr' ? trStatus.translating : enStatus.translating)}
                  className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 px-2.5 py-1 text-xs font-semibold border border-amber-200 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {(activeTab === 'tr' ? trStatus.translating : enStatus.translating)
                    ? t('cmsLocalization.translating', 'جارٍ الترجمة...')
                    : t('cmsLocalization.translateChanges', 'ترجمة التغييرات')}
                </button>
              )}
              {!recordId && (
                <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {t(
                    'cmsLocalization.bindNotice',
                    'سيتم ربط المسودة بهوية العنصر عند الحفظ الأساسي',
                  )}
                </span>
              )}
            </div>
          </div>

          {(activeTab === 'tr' ? trStatus.translateError : enStatus.translateError) && (
            <div
              role="alert"
              className="rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 border border-amber-200"
            >
              {activeTab === 'tr' ? trStatus.translateError : enStatus.translateError}
            </div>
          )}

          {fields.map((f) => {
            // Value-aware location guard
            if (f.isLocation && !isTranslatableLocationValue(f.canonicalValue)) {
              return (
                <div
                  key={f.name}
                  className="rounded-lg border border-gray-200 bg-gray-50/80 p-2.5 text-xs text-gray-600 flex items-start gap-2"
                >
                  <Info className="h-4 w-4 shrink-0 text-gray-500 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-700">{f.label}</div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {t(
                        'cmsLocalization.technicalLocationExcluded',
                        'الموقع الحالي رابط أو إحداثيات تقنية؛ لا يتم تضمينه في الترجمة التحريرية.',
                      )}
                    </p>
                  </div>
                </div>
              );
            }

            const currentVal = translations[activeTab]?.[f.name] ?? '';

            return (
              <LocalizedFieldEditor
                key={f.name}
                target={target}
                locale={activeTab}
                path={`${recordId ?? 'new'}.${f.name}`}
                label={f.label}
                value={currentVal}
                kind={f.kind}
                placeholder={f.placeholder}
                disabled={!canEdit}
                onChange={(newVal) => onTranslationChange(activeTab, f.name, newVal)}
              />
            );
          })}

          {(activeTab === 'tr' ? trStatus.saveError : enStatus.saveError) && (
            <div
              role="alert"
              className="rounded bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 border border-rose-200"
            >
              {activeTab === 'tr' ? trStatus.saveError : enStatus.saveError}
            </div>
          )}

          {recordId && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleSaveDraft(activeTab)}
                disabled={!canEdit || (activeTab === 'tr' ? trStatus.saving : enStatus.saving) || (activeTab === 'tr' ? trStatus.translating : enStatus.translating)}
                className="inline-flex items-center gap-1 rounded bg-navy-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {(activeTab === 'tr' ? trStatus.saving : enStatus.saving)
                  ? t('cmsLocalization.saving', 'جارٍ الحفظ...')
                  : t('cmsLocalization.saveDraft', 'حفظ كمسودة')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
