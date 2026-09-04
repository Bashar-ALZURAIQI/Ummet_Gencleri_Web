import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import UserAvatar from './UserAvatar';
import TransientToast, { type ToastMessage } from './TransientToast';
import type { PendingMandatoryExcuse } from '../domain/internalEconomyTypes.ts';
import { loadPendingExcuses, reviewExcuse } from '../services/phaseThreeEconomyService.ts';

export default function ExcuseReviewPanel() {
  const [rows, setRows] = useState<PendingMandatoryExcuse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (type: ToastMessage['type'], text: string) => setToast({ id: Date.now(), type, text });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    const result = await loadPendingExcuses();
    setLoading(false);
    if (!result.ok) { setError(result.error.message); console.error('phase-three excuses load failed', result.error); return; }
    setRows(result.data);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (row: PendingMandatoryExcuse, status: 'ACCEPTED' | 'PARTIAL' | 'REJECTED') => {
    setBusyId(row.enrollmentId);
    const result = await reviewExcuse(row.enrollmentId, status);
    setBusyId(null);
    if (!result.ok) { console.error('phase-three excuse review failed', result.error); notify('error', result.error.message); return; }
    setRows((current) => current.filter((item) => item.enrollmentId !== row.enrollmentId));
    notify('success', 'تم اعتماد تقييم العذر وحفظ حركة النقاط في السجل.');
  };

  return <section className="card p-6">
    <TransientToast message={toast} onClose={() => setToast(null)} />
    <div className="mb-5 flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-extrabold text-navy-900">إدارة الأعذار</h2><p className="text-sm text-gray-500">أعذار الأنشطة الإلزامية التي تنتظر القرار.</p></div>
      <button type="button" onClick={() => void refresh()} className="btn-secondary" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث</button>
    </div>
    {error && <div className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
    {!loading && !error && rows.length === 0 && <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">لا توجد أعذار معلقة حالياً.</div>}
    <div className="space-y-4">{rows.map((row) => <article key={row.enrollmentId} className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3"><UserAvatar name={row.studentName} avatarPath={row.avatarPath} className="h-11 w-11" /><div><h3 className="font-bold text-navy-900">{row.studentName}</h3><p className="text-sm text-gray-500">{row.activityTitle}</p></div><span className="mr-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"><Clock3 className="h-3.5 w-3.5" /> قيد الانتظار</span></div>
      <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-700">{row.excuseText}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busyId===row.enrollmentId} onClick={() => void decide(row,'ACCEPTED')} className="btn-primary bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> عذر مقنع</button>
        <button disabled={busyId===row.enrollmentId} onClick={() => void decide(row,'PARTIAL')} className="btn-secondary"><ShieldCheck className="h-4 w-4" /> مقنع جزئياً (-5)</button>
        <button disabled={busyId===row.enrollmentId} onClick={() => void decide(row,'REJECTED')} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white"><XCircle className="h-4 w-4" /> غير مقنع (-15)</button>
      </div>
    </article>)}</div>
  </section>;
}
