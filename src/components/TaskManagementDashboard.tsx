import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  ManagedTaskSummary,
  TaskCompletionStatus,
  TaskEvaluationRow,
} from '../domain/internalEconomyTypes.ts';
import {
  finalizeTaskEvaluation,
  loadManagedTaskEnrollments,
  loadManagedTasks,
  saveTaskCompletion,
} from '../services/phaseThreeEconomyService.ts';
import TransientToast, { type ToastMessage } from './TransientToast';
import UserAvatar from './UserAvatar';

const busyKey = (taskId: string, studentId: string) => `${taskId}:${studentId}`;

export default function TaskManagementDashboard() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ManagedTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<TaskEvaluationRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const completionLabels: Record<Exclude<TaskCompletionStatus, 'PENDING'>, string> = useMemo(() => ({
    PERFECT: t('admin.tasks.evaluations.perfect', 'إنجاز متقن (100%)'),
    PARTIAL: t('admin.tasks.evaluations.partial', 'إنجاز جزئي (50%)'),
    FAILED: t('admin.tasks.evaluations.failed', 'لم ينجز (0%)'),
  }), [t]);

  const notify = (type: ToastMessage['type'], text: string) => {
    setToast({ id: Date.now(), type, text });
  };

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const refreshTasks = useCallback(async () => {
    setLoadingTasks(true);
    setError(null);
    const result = await loadManagedTasks();
    setLoadingTasks(false);
    if (!result.ok) {
      console.error('managed tasks load failed', result.error);
      setError(result.error.message);
      return;
    }
    setTasks(result.data);
    setSelectedTaskId((current) => (
      current && result.data.some((task) => task.taskId === current) ? current : null
    ));
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const openTask = async (task: ManagedTaskSummary) => {
    setSelectedTaskId(task.taskId);
    setEnrollments([]);
    setLoadingEnrollments(true);
    const result = await loadManagedTaskEnrollments(task.taskId);
    setLoadingEnrollments(false);
    if (!result.ok) {
      console.error('managed task enrollments load failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setEnrollments(result.data);
  };

  const saveCompletion = async (
    row: TaskEvaluationRow,
    status: Exclude<TaskCompletionStatus, 'PENDING'>,
  ) => {
    const rowBusyKey = busyKey(row.taskId, row.studentId);
    setBusy(rowBusyKey);
    const result = await saveTaskCompletion(row.taskId, row.studentId, status);
    setBusy(null);
    if (!result.ok) {
      console.error('managed task completion save failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setEnrollments((current) => current.map((item) => (
      item.taskId === row.taskId && item.studentId === row.studentId
        ? { ...item, completionStatus: status }
        : item
    )));
    notify('success', t('admin.tasks.evaluationSaved', 'تم حفظ تقييم الطالب.'));
  };

  const closeTask = async () => {
    if (!selectedTask) return;
    if (enrollments.some((row) => row.completionStatus === 'PENDING')) {
      notify('error', t('admin.tasks.mustEvaluateAll', 'يجب تقييم جميع الطلاب قبل إغلاق المهمة.'));
      return;
    }
    if (!confirm(t('admin.tasks.confirmClose', 'سيتم إغلاق المهمة وتوزيع النقاط نهائياً. هل تريد المتابعة؟'))) return;

    setBusy(selectedTask.taskId);
    const result = await finalizeTaskEvaluation(selectedTask.taskId);
    setBusy(null);
    if (!result.ok) {
      console.error('managed task finalization failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setTasks((current) => current.filter((task) => task.taskId !== selectedTask.taskId));
    setSelectedTaskId(null);
    setEnrollments([]);
    notify('success', t('admin.tasks.taskFinalized', 'تم إغلاق المهمة وأرشفتها وتوزيع النقاط بنجاح.'));
  };

  return (
    <section className="space-y-5">
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">{t('admin.tasks.title', 'إدارة المهام')}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {t('admin.tasks.subtitle', 'راجع مهامك النشطة، قيّم المسجلين، ثم أغلق المهمة لتوزيع النقاط.')}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => void refreshTasks()} disabled={loadingTasks}>
            <RefreshCw className={`h-4 w-4 ${loadingTasks ? 'animate-spin' : ''}`} />
            {t('admin.tasks.refresh', 'تحديث')}
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!error && !loadingTasks && tasks.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
            {t('admin.tasks.empty', 'لا توجد مهام نشطة ضمن صلاحياتك حالياً.')}
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              onClick={() => void openTask(task)}
              className={`rounded-2xl border p-4 text-right transition-all ${
                selectedTaskId === task.taskId
                  ? 'border-gold-400 bg-gold-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-navy-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-extrabold text-navy-900">{task.title}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  task.status === 'FULL'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {task.status === 'FULL' ? t('admin.tasks.status.full', 'مكتملة المقاعد') : t('admin.tasks.status.open', 'مفتوحة')}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-500">{task.description}</p>
              <div className="mt-4 space-y-1.5 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-navy-500" />
                  {t('admin.tasks.enrolledCount', '{{count}} / {{total}} مسجل', { count: task.enrollmentCount, total: task.requiredStudents })}
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-navy-500" />
                  {t('admin.tasks.deadline', 'الإغلاق: {{deadline}}', { deadline: new Date(task.deadline).toLocaleString('ar-EG') })}
                </div>
                <div>{t('admin.tasks.reward', 'المكافأة: {{points}} نقطة', { points: task.pointsReward })}</div>
                <div>{t('admin.tasks.createdBy', 'أنشأها: {{name}}', { name: task.createdByName })}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedTask && (
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-gold-700">
                <ClipboardCheck className="h-4 w-4" />
                {t('admin.tasks.evaluationSectionTitle', 'تقييم المسجلين')}
              </div>
              <h3 className="mt-1 text-lg font-extrabold text-navy-900">{selectedTask.title}</h3>
            </div>
            <button
              className="btn-primary"
              disabled={
                loadingEnrollments
                || busy === selectedTask.taskId
                || enrollments.some((row) => row.completionStatus === 'PENDING')
              }
              onClick={() => void closeTask()}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('admin.tasks.closeTaskButton', 'إغلاق وأرشفة المهمة')}
            </button>
          </div>

          {loadingEnrollments ? (
            <div className="py-10 text-center text-sm text-gray-500">{t('admin.tasks.loadingEnrollments', 'جارٍ تحميل المسجلين...')}</div>
          ) : enrollments.length === 0 ? (
            <div className="mt-5 rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
              {t('admin.tasks.noEnrollments', 'لا يوجد طلاب مسجلون في هذه المهمة. يمكنك إغلاقها وأرشفتها دون توزيع نقاط.')}
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {enrollments.map((row) => (
                <div
                  key={row.studentId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <UserAvatar
                    name={row.studentName}
                    avatarPath={row.avatarPath}
                    className="h-10 w-10"
                  />
                  <span className="min-w-40 flex-1 font-semibold text-navy-900">{row.studentName}</span>
                  <select
                    value={row.completionStatus}
                    disabled={busy === busyKey(row.taskId, row.studentId)}
                    onChange={(event) => void saveCompletion(
                      row,
                      event.target.value as Exclude<TaskCompletionStatus, 'PENDING'>,
                    )}
                    className="input-field max-w-xs"
                  >
                    <option value="PENDING" disabled>{t('admin.tasks.selectEvaluation', 'اختر التقييم')}</option>
                    {Object.entries(completionLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
