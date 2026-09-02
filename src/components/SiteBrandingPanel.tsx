import { useState } from 'react';
import { Image as ImageIcon, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ManagedFileField from './ManagedFileField';
import TransientToast, { type ToastMessage } from './TransientToast';

export default function SiteBrandingPanel() {
  const { currentUser, siteContent, replaceSiteLogo } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  if (currentUser?.role !== 'PRESIDENT') return null;

  const uploadLogo = async (file: File, onProgress: (percentage: number) => void) => {
    setProgress(0);
    const result = await replaceSiteLogo(file, (percentage) => {
      setProgress(percentage);
      onProgress(percentage);
    });
    if (!result.ok) {
      setProgress(null);
      const rollbackWarnings = 'warnings' in result && Array.isArray(result.warnings)
        ? result.warnings.filter((warning): warning is string => typeof warning === 'string')
        : [];
      const errorText = result.committed
        ? result.error.message
        : rollbackWarnings.length > 0
          ? `${result.error.message} ${rollbackWarnings.join(' ')}`
          : result.error.message;
      setToast({ id: Date.now(), type: 'error', text: errorText });
      console.error('[site-branding] replace failed', result.error);
      if (rollbackWarnings.length > 0) {
        console.warn('[site-branding] rollback warnings', rollbackWarnings);
      }
      return result;
    }
    setProgress(100);
    if (result.data.warnings.length > 0) {
      console.warn('[site-branding] replace warnings', result.data.warnings);
    }
    const warningText = result.data.warnings.length > 0 ? ` ${result.data.warnings.join(' ')}` : '';
    setToast({
      id: Date.now(),
      type: 'success',
      text: `تم تحديث شعار الاتحاد بنجاح.${warningText}`,
    });
    return result;
  };

  return (
    <section className="card space-y-6 p-6" dir="rtl">
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <div>
        <h2 className="text-xl font-extrabold text-navy-900">هوية الاتحاد</h2>
        <p className="mt-1 text-sm text-gray-500">حدّث الشعار الرسمي المنشور في الموقع.</p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-50 ring-1 ring-gray-200">
          {siteContent.brand.logoUrl ? (
            <img
              src={siteContent.brand.logoUrl}
              alt="الشعار الحالي للاتحاد"
              className="h-full w-full object-contain"
            />
          ) : (
            <Users className="h-12 w-12 text-navy-700" aria-label="أيقونة الشعار الافتراضية" />
          )}
        </div>
        <div>
          <p className="font-bold text-navy-900">الشعار الحالي</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <ImageIcon className="h-4 w-4" /> تظهر المعاينة الجديدة قبل بدء الرفع.
          </p>
        </div>
      </div>

      <ManagedFileField
        usage="site-logo"
        label="شعار الاتحاد"
        currentUrl={siteContent.brand.logoUrl}
        successMessage="تم تحديث شعار الاتحاد بنجاح."
        onUpload={uploadLogo}
        onUploaded={() => setProgress(null)}
      />

      {progress !== null && progress < 100 && (
        <p role="status" className="text-sm font-semibold text-navy-700">
          جاري الرفع... {progress}%
        </p>
      )}
    </section>
  );
}
