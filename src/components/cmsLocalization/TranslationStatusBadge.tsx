import { useTranslation } from 'react-i18next';
import type { LocalizationStatus } from '../../domain/cmsLocalization.ts';

export interface TranslationStatusBadgeProps {
  status: LocalizationStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function TranslationStatusBadge({
  status,
  size = 'sm',
  className = '',
}: TranslationStatusBadgeProps) {
  const { t } = useTranslation();

  const styleMap: Record<LocalizationStatus, string> = {
    fresh: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    stale: 'bg-amber-100 text-amber-800 border-amber-300',
    draft: 'bg-sky-100 text-sky-800 border-sky-300',
    missing: 'bg-gray-100 text-gray-700 border-gray-300',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${styleMap[status]} ${sizeClasses} ${className}`}
    >
      {t(`cmsLocalization.status.${status}`)}
    </span>
  );
}
