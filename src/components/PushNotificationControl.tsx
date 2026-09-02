import { Bell, BellOff, CheckCircle2, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { useAcceptedStudentPush } from '../hooks/useAcceptedStudentPush.ts';

export default function PushNotificationControl() {
  const { state, enable, disable } = useAcceptedStudentPush(true);
  if (state.kind === 'hidden') return null;

  const busy = state.kind === 'checking' || state.kind === 'enabling' || state.kind === 'disabling';
  const message = state.kind === 'unsupported'
    || state.kind === 'ios-install-required'
    || state.kind === 'denied'
    ? state.reason
    : state.kind === 'error'
      ? state.message
      : state.kind === 'enabled'
        ? 'الإشعارات مفعّلة على هذا الجهاز، وستصلك الأخبار والفعاليات والألبومات الجديدة.'
        : state.kind === 'checking'
          ? 'جارٍ التحقق من إعدادات الإشعارات...'
          : 'فعّل الإشعارات لتصلك أخبار وفعاليات الاتحاد حتى عندما يكون الموقع مغلقاً.';

  return (
    <section className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-5" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            {state.kind === 'enabled'
              ? <CheckCircle2 className="h-6 w-6" />
              : state.kind === 'ios-install-required'
                ? <Smartphone className="h-6 w-6" />
                : <Bell className="h-6 w-6" />}
          </div>
          <div>
            <h2 className="font-extrabold text-navy-900">إشعارات الاتحاد</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{message}</p>
          </div>
        </div>

        <div className="shrink-0">
          {busy ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-sky-700 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ التنفيذ...
            </span>
          ) : state.kind === 'enabled' ? (
            <button type="button" onClick={() => void disable()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <BellOff className="h-4 w-4" />
              إيقاف الإشعارات
            </button>
          ) : state.kind === 'ready' || state.kind === 'error' ? (
            <button type="button" onClick={() => void enable()} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-sky-700">
              {state.kind === 'error' ? <RefreshCw className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {state.kind === 'error' ? 'إعادة المحاولة' : 'تفعيل الإشعارات'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
