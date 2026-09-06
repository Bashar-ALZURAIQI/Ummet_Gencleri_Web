import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Globe, Info } from 'lucide-react';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  type LocalizationStatus,
  type JsonValue,
  computeSourceHash,
} from '../../domain/cmsLocalization.ts';
import type { CmsFieldKind } from '../../domain/cmsTranslatableFields.ts';
import {
  recordManualPath,
  isTranslatableLocationValue,
} from '../../domain/cmsLocalizationEditor.ts';
import { useCmsLocalizationRepository } from '../../context/CmsLocalizationContext.tsx';
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
}

const createInitialStatusState = (): LocaleStatusState => ({
  status: 'missing',
  isStale: false,
  isManual: false,
  manualPaths: [],
  saving: false,
  saveError: null,
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
          item =
            (activeRecord.payload.find(
              (el) => el && typeof el === 'object' && (el as Record<string, unknown>).id === recordId,
            ) as Record<string, unknown>) ?? null;
          if (!item) {
            for (const el of activeRecord.payload) {
              if (el && typeof el === 'object') {
                const candidate = el as Record<string, unknown>;
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
        } else if (
          activeRecord.payload &&
          typeof activeRecord.payload === 'object'
        ) {
          const payloadObj = activeRecord.payload as Record<string, unknown>;
          if (
            payloadObj.id === recordId ||
            (!payloadObj.id && (!recordId || recordId === 'map' || recordId === 'contactMap'))
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
    if (!canEdit || (!recordId && target !== 'contactMap' && target !== 'site')) return;
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
        if (!found && recordId) {
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
          (!obj.id && (!recordId || recordId === 'map' || recordId === 'contactMap'))
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

  return (
    <div className="space-y-4">
      {/* Tabs Header */}
      <div className="flex items-center gap-1 rounded-xl bg-navy-50/70 p-1 border border-navy-100">
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
            {!recordId && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {t(
                  'cmsLocalization.bindNotice',
                  'سيتم ربط المسودة بهوية العنصر عند الحفظ الأساسي',
                )}
              </span>
            )}
          </div>

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
                disabled={!canEdit || (activeTab === 'tr' ? trStatus.saving : enStatus.saving)}
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
