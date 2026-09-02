import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Coins, RefreshCw, Users } from 'lucide-react';
import TransientToast, { type ToastMessage } from './TransientToast';
import { resolveTaskInteraction } from '../domain/internalEconomyInteraction.ts';
import type { StudentTaskBoardItem } from '../domain/internalEconomyTypes.ts';
import {
  loadStudentTaskBoard,
  registerForInternalTask,
} from '../services/internalEconomyService';

export default function StudentTasksPanel() {
  const [items, setItems] = useState<StudentTaskBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadStudentTaskBoard();
    setLoading(false);
    if (!result.ok) {
      console.error('[internal-economy] student tasks load failed', result.error);
      setError(result.error.message);
      return;
    }
    setItems(result.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const register = async (item: StudentTaskBoardItem) => {
    setBusyId(item.taskId);
    const result = await registerForInternalTask(item.taskId);
    setBusyId(null);
    if (!result.ok) {
      console.error('[internal-economy] task registration failed', result.error);
      setToast({ id: Date.now(), type: 'error', text: result.error.message });
      await load();
      return;
    }
    await load();
    setToast({ id: Date.now(), type: 'success', text: 'تم حجز المهمة التطوعية في حسابك.' });
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-gray-500"><RefreshCw className="h-4 w-4 animate-spin" /> جارٍ تحميل المهام...</div>;

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}<button type="button" onClick={() => void load()} className="mr-3 font-bold underline">إعادة المحاولة</button></div>}
      {!error && items.length === 0 && <div className="card py-16 text-center text-sm text-gray-500">لا توجد مهام تطوعية متاحة حالياً.</div>}
      <div className="grid gap-5 md:grid-cols-2">
        {items.map((item) => {
          const state = resolveTaskInteraction({
            hasStudent: true,
            access: 'accepted',
            deadline: item.deadline,
            status: item.status,
            requiredStudents: item.requiredStudents,
            enrollmentCount: item.enrollmentCount,
            isEnrolled: item.isEnrolled,
          });
          const remaining = Math.max(0, item.requiredStudents - item.enrollmentCount);
          return (
            <article key={item.taskId} className="card flex flex-col p-6">
              <h3 className="text-lg font-extrabold text-navy-900">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-gray-500">{item.description}</p>
              <div className="mt-5 grid gap-2 text-xs sm:grid-cols-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700"><Coins className="h-4 w-4" /> {item.pointsReward} نقطة</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 font-bold text-violet-700"><Users className="h-4 w-4" /> متبقٍ {remaining}</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 font-bold text-sky-700"><Clock3 className="h-4 w-4" /> {new Date(item.deadline).toLocaleDateString('ar-EG')}</span>
              </div>
              <button
                type="button"
                disabled={!state.canRegister || busyId === item.taskId}
                onClick={() => void register(item)}
                className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                  item.isEnrolled ? 'bg-emerald-50 text-emerald-700' : state.canRegister ? 'bg-navy-800 text-white hover:bg-navy-900' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {busyId === item.taskId ? 'جارٍ الحجز...' : item.isEnrolled ? 'تم حجز المهمة' : state.reason === 'DEADLINE' ? 'انتهى التسجيل' : state.reason === 'FULL' ? 'مكتملة العدد' : 'سأنجز المهمة'}
              </button>
            </article>
          );
        })}
      </div>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
