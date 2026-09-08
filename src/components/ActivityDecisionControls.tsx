import { CheckCircle2, Clock3, Coins, Lock, Users, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StudentActivityBoardItem } from '../domain/internalEconomyTypes.ts';
import {
  resolveActivityInteraction,
  type InternalEconomyAccess,
} from '../domain/internalEconomyInteraction.ts';

export default function ActivityDecisionControls({
  item,
  hasStudent,
  access,
  loading,
  busy,
  onLogin,
  onJoin,
  onDecline,
}: {
  item: StudentActivityBoardItem | null;
  hasStudent: boolean;
  access: InternalEconomyAccess;
  loading: boolean;
  busy: boolean;
  onLogin: () => void;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const { t, i18n } = useTranslation();

  const typeLabels = {
    MANDATORY: t('activities.types.mandatory', 'إلزامي'),
    OPTIONAL: t('activities.types.optional', 'اختياري'),
    PAID: t('activities.types.paid', 'حصري بالنقاط'),
  } as const;

  if (!hasStudent) {
    return <button type="button" onClick={onLogin} className="btn-gold w-full">{t('activities.registerNow', 'سجل الآن')}</button>;
  }
  if (access !== 'accepted' && !item?.canParticipate) {
    return (
      <button type="button" disabled className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-4 py-2.5 text-sm font-semibold text-gold-700 disabled:cursor-not-allowed">
        <Lock className="h-4 w-4" /> {t('activities.waitingApproval', 'انتظار قبول العضوية')}
      </button>
    );
  }
  if (loading) {
    return <button type="button" disabled className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-500">{t('activities.loadingStatus', 'جارٍ تحميل حالة التسجيل...')}</button>;
  }
  if (!item) {
    return <button type="button" disabled className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-500">{t('activities.notAvailable', 'التسجيل غير متاح لهذا النشاط')}</button>;
  }

  const state = resolveActivityInteraction({
    hasStudent,
    access,
    type: item.type,
    pointsValue: item.pointsValue,
    totalPoints: item.totalPoints,
    maxCapacity: item.maxCapacity,
    joiningCount: item.joiningCount,
    deadline: item.deadline,
    currentDecision: item.decision,
    canParticipate: item.canParticipate,
    economyExempt: item.economyExempt,
  });
  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';
  const deadline = new Date(item.deadline).toLocaleString(localeCode, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-2 font-bold text-sky-700">
          <Clock3 className="h-3.5 w-3.5" /> {t('activities.deadline', { deadline, defaultValue: `الإغلاق: ${deadline}` })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-2 font-bold text-violet-700">
          <Users className="h-3.5 w-3.5" />
          {item.maxCapacity === null
            ? t('activities.capacityOpen', 'السعة مفتوحة')
            : t('activities.remainingCapacity', { remaining: item.remainingCapacity, total: item.maxCapacity, defaultValue: `المتبقي: ${item.remainingCapacity} من ${item.maxCapacity}` })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-navy-50 px-3 py-1 text-navy-700">{typeLabels[item.type]}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
          <Coins className="h-3.5 w-3.5" />
          {item.type === 'PAID'
            ? t('activities.cost', { points: item.pointsValue, defaultValue: `التكلفة: ${item.pointsValue}` })
            : t('activities.reward', { points: item.pointsValue, defaultValue: `النقاط: ${item.pointsValue}` })}
        </span>
        {item.economyExempt ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('activities.exempt', 'معفى من نظام النقاط')}</span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('activities.yourBalance', { points: item.totalPoints, defaultValue: `رصيدك: ${item.totalPoints}` })}</span>
        )}
      </div>

      {state.reason === 'DEADLINE' && <p className="rounded-lg bg-gray-100 p-2 text-center text-xs font-bold text-gray-600">{t('activities.deadlineEnded', 'انتهى وقت التسجيل')}</p>}
      {state.reason === 'FULL' && <p className="rounded-lg bg-rose-50 p-2 text-center text-xs font-bold text-rose-700">{t('activities.full', 'مكتمل العدد')}</p>}
      {state.reason === 'POINTS' && <p className="rounded-lg bg-amber-50 p-2 text-center text-xs font-bold text-amber-800">{t('activities.insufficientPoints', 'نقاطك غير كافية')}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !state.canJoin}
          onClick={onJoin}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            item.decision === 'JOINING' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" /> {busy ? t('activities.saving', 'جارٍ الحفظ...') : t('activities.join', 'سأنضم')}
        </button>
        <button
          type="button"
          disabled={busy || !state.canDecline}
          onClick={onDecline}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            item.decision === 'DECLINING' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          }`}
        >
          <XCircle className="h-4 w-4" /> {t('activities.decline', 'لن أنضم')}
        </button>
      </div>
    </div>
  );
}
