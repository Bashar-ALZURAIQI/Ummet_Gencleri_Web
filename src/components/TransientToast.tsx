import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

export default function TransientToast({
  message,
  onClose,
}: {
  message: ToastMessage | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message || typeof document === 'undefined') return null;
  const success = message.type === 'success';
  const toast = (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-[10000] flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
      <span className="leading-6">{message.text}</span>
      <button type="button" onClick={onClose} className="mr-auto rounded-lg p-1 hover:bg-black/5" aria-label={t('common.closeNotice', 'إغلاق الإشعار')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
  return createPortal(toast, document.body);
}
