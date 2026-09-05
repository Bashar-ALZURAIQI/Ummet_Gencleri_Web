import { useTranslation } from 'react-i18next';
import { AlertTriangle, Edit3 } from 'lucide-react';
import type {
  CanonicalCmsLocale,
  LocalizedCmsLocale,
  CmsTarget,
} from '../../domain/cmsLocalization.ts';
import type { CmsFieldKind } from '../../domain/cmsTranslatableFields.ts';

export interface LocalizedFieldEditorProps {
  target: CmsTarget | string;
  locale: LocalizedCmsLocale | CanonicalCmsLocale;
  path: string;
  label: string;
  value: string;
  kind?: CmsFieldKind;
  isStale?: boolean;
  isManual?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (newValue: string) => void;
}

export function LocalizedFieldEditor({
  target,
  locale,
  path,
  label,
  value,
  kind,
  isStale = false,
  isManual = false,
  disabled = false,
  placeholder = '',
  onChange,
}: LocalizedFieldEditorProps) {
  const { t } = useTranslation();

  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const fieldId = `field-${target}-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}-${locale}`;
  const isMultiline = kind === 'description' || kind === 'richText';

  const baseInputClasses =
    'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500';
  const normalClasses =
    'border-navy-200 bg-white text-navy-900 focus:border-navy-500 focus:ring-navy-500/20';
  const staleClasses =
    'border-amber-400 bg-amber-50/30 text-navy-900 focus:border-amber-500 focus:ring-amber-500/20';

  const inputClasses = `${baseInputClasses} ${isStale ? staleClasses : normalClasses}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="block text-xs font-semibold text-navy-800">
          {label}
        </label>
        {isManual && (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
            <Edit3 className="h-3 w-3" />
            {t('cmsLocalization.manualEditBadge')}
          </span>
        )}
      </div>

      {isMultiline ? (
        <textarea
          id={fieldId}
          dir={dir}
          rows={4}
          className={`${inputClasses} resize-none`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={fieldId}
          type="text"
          dir={dir}
          className={inputClasses}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      )}

      {isStale && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>{t('cmsLocalization.needsUpdateNotice')}</span>
        </div>
      )}
    </div>
  );
}
