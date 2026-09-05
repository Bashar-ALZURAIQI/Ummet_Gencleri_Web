import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Save, Globe } from 'lucide-react';
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
  deriveFieldLocalizationState,
  recordManualPath,
  updateNestedPayload,
  resolveDraftBasePayload,
} from '../../domain/cmsLocalizationEditor.ts';
import { useCmsLocalizationRepository } from '../../context/CmsLocalizationContext.tsx';
import { TranslationStatusBadge } from './TranslationStatusBadge.tsx';
import { LocalizedFieldEditor } from './LocalizedFieldEditor.tsx';

export interface CmsTranslationSectionProps {
  target: CmsTarget | string;
  path: string;
  label: string;
  kind?: CmsFieldKind;
  canonicalValue: string;
  canonicalPayload: JsonValue;
  canEdit: boolean;
  onDraftSaved?: (locale: LocalizedCmsLocale) => void;
  onPublished?: (locale: LocalizedCmsLocale) => void;
}

interface LocaleFieldState {
  value: string;
  status: LocalizationStatus;
  isStale: boolean;
  isManual: boolean;
  isDirty: boolean;
  manualPaths: readonly string[];
  record: CmsLocalizationRecord | null;
  draftRecord: CmsLocalizationRecord | null;
  publishedRecord: CmsLocalizationRecord | null;
  saving: boolean;
  saveError: string | null;
}

const createInitialLocaleState = (): LocaleFieldState => ({
  value: '',
  status: 'missing',
  isStale: false,
  isManual: false,
  isDirty: false,
  manualPaths: [],
  record: null,
  draftRecord: null,
  publishedRecord: null,
  saving: false,
  saveError: null,
});

export function CmsTranslationSection({
  target,
  path,
  label,
  kind,
  canonicalValue: _canonicalValue,
  canonicalPayload,
  canEdit,
  onDraftSaved,
  onPublished: _onPublished,
}: CmsTranslationSectionProps) {
  const { t } = useTranslation();
  const repository = useCmsLocalizationRepository();

  const [isExpanded, setIsExpanded] = useState(false);
  const [trState, setTrState] = useState<LocaleFieldState>(createInitialLocaleState);
  const [enState, setEnState] = useState<LocaleFieldState>(createInitialLocaleState);

  // Load existing draft or published records on mount / target-path change
  useEffect(() => {
    let cancelled = false;

    async function loadLocale(locale: LocalizedCmsLocale): Promise<LocaleFieldState> {
      try {
        const [draftRecord, publishedRecord] = await Promise.all([
          repository.getDraft(target, locale),
          repository.getPublished(target, locale),
        ]);

        // Precedence: draftRecord > publishedRecord
        const activeRecord = draftRecord ?? publishedRecord;
        if (!activeRecord) {
          return createInitialLocaleState();
        }

        const derived = deriveFieldLocalizationState(path, activeRecord);
        return {
          value: derived.value,
          status: derived.status,
          isStale: derived.isStale,
          isManual: derived.isManual,
          isDirty: false,
          manualPaths: activeRecord.manualPaths ?? [],
          record: activeRecord,
          draftRecord,
          publishedRecord,
          saving: false,
          saveError: null,
        };
      } catch {
        return createInitialLocaleState();
      }
    }

    async function loadAll() {
      const [trLoaded, enLoaded] = await Promise.all([
        loadLocale('tr'),
        loadLocale('en'),
      ]);
      if (cancelled) return;
      setTrState(trLoaded);
      setEnState(enLoaded);
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [target, path, repository]);

  const handleFieldChange = (locale: LocalizedCmsLocale, newValue: string) => {
    const updater = locale === 'tr' ? setTrState : setEnState;
    updater((prev) => {
      const updatedManualPaths = recordManualPath(prev.manualPaths, path);
      return {
        ...prev,
        value: newValue,
        isDirty: true,
        isManual: true,
        manualPaths: updatedManualPaths,
        saveError: null,
      };
    });
  };

  const handleSaveDraft = async (locale: LocalizedCmsLocale) => {
    if (!canEdit) return;
    const currentState = locale === 'tr' ? trState : enState;
    const updater = locale === 'tr' ? setTrState : setEnState;

    updater((prev) => ({ ...prev, saving: true, saveError: null }));

    try {
      const [latestDraft, latestPublished] = await Promise.all([
        repository.getDraft(target, locale),
        repository.getPublished(target, locale),
      ]);

      const basePayload = resolveDraftBasePayload(
        latestDraft,
        latestPublished,
        canonicalPayload,
      );
      const updatedPayload = updateNestedPayload(basePayload, path, currentState.value);

      const latestActive = latestDraft ?? latestPublished ?? currentState.record;
      const mergedManualPaths = [
        ...(latestActive?.manualPaths ?? []),
        ...currentState.manualPaths,
      ];
      const updatedManualPaths = recordManualPath(mergedManualPaths, path);

      const recordToSave: CmsLocalizationRecord = {
        target,
        locale,
        payload: updatedPayload,
        status: 'draft',
        manualPaths: updatedManualPaths,
        stalePaths: latestActive?.stalePaths ?? currentState.record?.stalePaths ?? [],
        sourceHash: computeSourceHash(canonicalPayload),
        sourceVersion: latestActive?.sourceVersion ?? currentState.record?.sourceVersion,
        updatedAt: new Date().toISOString(),
      };

      const saved = await repository.saveDraft(recordToSave);

      updater((prev) => ({
        ...prev,
        saving: false,
        isDirty: false,
        status: 'draft',
        record: saved,
        draftRecord: saved,
        saveError: null,
      }));

      onDraftSaved?.(locale);
    } catch {
      updater((prev) => ({
        ...prev,
        saving: false,
        saveError: t('cmsLocalization.saveFailed'),
      }));
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-navy-100 bg-navy-50/40 p-2.5">
      {/* Accordion Toggle Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between text-start transition-colors hover:text-navy-900"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-navy-600" />
          <span className="text-xs font-bold text-navy-800">
            {t('cmsLocalization.translations')}
          </span>
          <div className="flex items-center gap-1.5 ms-2">
            <span className="text-[11px] font-semibold text-gray-500">TR</span>
            <TranslationStatusBadge status={trState.status} size="sm" />
            <span className="text-[11px] font-semibold text-gray-500 ms-1">EN</span>
            <TranslationStatusBadge status={enState.status} size="sm" />
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Expanded Translation Body */}
      {isExpanded && (
        <div className="mt-3 space-y-3 pt-2.5 border-t border-navy-100">
          {/* Turkish Editor Card */}
          <div className="rounded-md border border-gray-200 bg-white p-2.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
              <span className="text-xs font-bold text-navy-900">Türkçe</span>
              <TranslationStatusBadge status={trState.status} size="sm" />
            </div>
            <LocalizedFieldEditor
              target={target}
              locale="tr"
              path={path}
              label={label}
              value={trState.value}
              kind={kind}
              isStale={trState.isStale}
              isManual={trState.isManual}
              disabled={!canEdit || trState.saving}
              onChange={(val) => handleFieldChange('tr', val)}
            />
            {trState.saveError && (
              <div role="alert" className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 border border-rose-200">
                {trState.saveError}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleSaveDraft('tr')}
                disabled={!canEdit || trState.saving}
                className="inline-flex items-center gap-1 rounded bg-navy-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3 w-3" />
                {trState.saving ? t('cmsLocalization.saving') : t('cmsLocalization.saveDraft')}
              </button>
            </div>
          </div>

          {/* English Editor Card */}
          <div className="rounded-md border border-gray-200 bg-white p-2.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
              <span className="text-xs font-bold text-navy-900">English</span>
              <TranslationStatusBadge status={enState.status} size="sm" />
            </div>
            <LocalizedFieldEditor
              target={target}
              locale="en"
              path={path}
              label={label}
              value={enState.value}
              kind={kind}
              isStale={enState.isStale}
              isManual={enState.isManual}
              disabled={!canEdit || enState.saving}
              onChange={(val) => handleFieldChange('en', val)}
            />
            {enState.saveError && (
              <div role="alert" className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 border border-rose-200">
                {enState.saveError}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleSaveDraft('en')}
                disabled={!canEdit || enState.saving}
                className="inline-flex items-center gap-1 rounded bg-navy-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3 w-3" />
                {enState.saving ? t('cmsLocalization.saving') : t('cmsLocalization.saveDraft')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
