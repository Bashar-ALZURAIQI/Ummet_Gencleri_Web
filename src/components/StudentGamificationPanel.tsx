import { useEffect, useState } from 'react';
import { Award, History, Medal, RefreshCw, Trophy, UserRoundCheck } from 'lucide-react';
import type { OwnGamificationSummary } from '../domain/internalEconomyTypes.ts';
import { ledgerCreatorPresentation, tierPresentation } from '../domain/phaseThreeEconomy.ts';
import { loadOwnGamificationSummary } from '../services/phaseThreeEconomyService.ts';

export default function StudentGamificationPanel() {
  const [summary, setSummary] = useState<OwnGamificationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const result = await loadOwnGamificationSummary();
    setLoading(false);
    if (!result.ok) {
      console.error('gamification summary failed', result.error);
      setError(result.error.message);
      return;
    }
    setSummary(result.data);
  };

  useEffect(() => { void refresh(); }, []);

  if (loading) return <div className="card p-6 text-center text-gray-500">جارٍ تحميل رتبتك ونقاطك...</div>;
  if (error) {
    return (
      <div className="card p-6 text-center text-rose-700">
        <p>{error}</p>
        <button onClick={() => void refresh()} className="btn-secondary mt-3">
          <RefreshCw className="h-4 w-4" />
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (!summary) return null;

  const tier = tierPresentation(summary.totalPoints);
  return (
    <section className="grid gap-4 lg:grid-cols-3" dir="rtl">
      <div className="card bg-gradient-to-l from-navy-800 to-navy-950 p-6 text-white">
        <Award className="h-7 w-7 text-gold-300" />
        <div className="mt-3 text-3xl font-extrabold">{summary.totalPoints}</div>
        <p className="text-sm text-gray-300">رصيد نقاطك الحالي</p>
      </div>
      <div className="card p-6">
        <Trophy className="h-7 w-7 text-gold-500" />
        <div className="mt-3 text-3xl font-extrabold text-navy-900">#{summary.rank}</div>
        <p className="text-sm text-gray-500">ترتيبك بين الأعضاء {summary.isTopTen && '· ضمن أفضل 10'}</p>
      </div>
      <div className="card p-6">
        <Medal className="h-7 w-7 text-amber-500" />
        <div className="mt-3 text-xl font-extrabold text-navy-900">{tier.medal} {tier.label}</div>
        <p className="text-sm text-gray-500">وسام العضوية الحالي</p>
      </div>

      <div className="card p-6 lg:col-span-3">
        <h3 className="mb-4 flex items-center gap-2 font-extrabold text-navy-900">
          <History className="h-5 w-5" />
          سجل النقاط
        </h3>
        {summary.recentLedger.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد حركات نقاط بعد.</p>
        ) : (
          <div className="divide-y">
            {summary.recentLedger.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">السبب: {entry.reason}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <UserRoundCheck className="h-4 w-4 shrink-0" />
                    بواسطة: {ledgerCreatorPresentation(entry)}
                  </p>
                  <time className="mt-1 block text-xs text-gray-400">
                    {new Date(entry.createdAt).toLocaleString('ar')}
                  </time>
                </div>
                <span className={`shrink-0 text-lg font-extrabold ${entry.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {entry.amount > 0 ? '+' : ''}{entry.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
