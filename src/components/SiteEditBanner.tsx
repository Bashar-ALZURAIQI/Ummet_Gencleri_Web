import { AlertCircle, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';

/** Small notice shown to the media-committee head while they have pending edits on a page. */
export default function SiteEditBanner({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const { currentUser, pendingSiteEdits, editRequestsError, clearEditRequestsError } = useApp();
  if (!currentUser || currentUser.role !== 'MEDIA_HEAD' || currentUser.committee !== 'media') return null;
  const count = (pendingSiteEdits ?? []).filter(
    (e) => e?.pageId === pageId && e?.status === 'PENDING_PRESIDENT_APPROVAL'
  ).length;
  if (editRequestsError) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{editRequestsError}</span>
        <button type="button" onClick={clearEditRequestsError} aria-label={t('admin.sitePendingBanner.closeError', 'إغلاق رسالة الخطأ')}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  if (count === 0) return null;
  return (
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-4 py-2.5 text-xs font-semibold text-gold-800">
      <Clock className="h-4 w-4 shrink-0" />
      {t('admin.sitePendingBanner.banner', 'لديك {{count}} تعديل معلق على هذه الصفحة بانتظار اعتماد رئيس الاتحاد قبل النشر.', { count })}
    </div>
  );
}
