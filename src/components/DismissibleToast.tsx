import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type DismissibleToastProps = {
  dismissKey: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  icon?: ReactNode;
  children: ReactNode;
};

export default function DismissibleToast({ dismissKey, type = 'info', icon, children }: DismissibleToastProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(dismissKey) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const close = () => {
    try {
      sessionStorage.setItem(dismissKey, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const palette = type === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : type === 'warning' || type === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-gold-300 bg-gold-50 text-gold-800';

  const toast = (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[10050] flex justify-center px-4 lg:top-20">
      <div className={`pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg shadow-black/5 backdrop-blur animate-fade-in ${palette}`}>
        {icon}
        <p className="flex-1 leading-relaxed">{children}</p>
        <button
          type="button"
          onClick={close}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/70"
          title="إغلاق التنبيه"
          aria-label="إغلاق التنبيه"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? toast : createPortal(toast, document.body);
}
