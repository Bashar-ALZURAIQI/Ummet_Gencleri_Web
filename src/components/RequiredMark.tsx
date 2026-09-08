import { useTranslation } from 'react-i18next';

export default function RequiredMark() {
  const { t } = useTranslation();
  return (
    <span className="text-rose-600" title={t('common.requiredField', 'حقل إجباري')} aria-hidden="true">
      *
    </span>
  );
}
