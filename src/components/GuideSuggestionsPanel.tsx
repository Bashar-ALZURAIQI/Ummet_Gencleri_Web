import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, Search, Trash2 } from 'lucide-react';
import { canManageGuideSuggestions, type GuideSuggestionStatus } from '../domain/guideSuggestionPolicy.ts';
import {
  deleteGuideSuggestion,
  listGuideSuggestions,
  updateGuideSuggestionStatus,
  type GuideSuggestion,
} from '../services/guideSuggestionService.ts';

type Filter = 'ALL' | GuideSuggestionStatus;

const STATUS_META: Record<GuideSuggestionStatus, { label: string; className: string }> = {
  PENDING: { label: 'قيد الانتظار', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  REVIEWING: { label: 'قيد المراجعة', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  IMPLEMENTED: { label: 'تم التنفيذ', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'مرفوض', className: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: STATUS_META.PENDING.label },
  { value: 'REVIEWING', label: STATUS_META.REVIEWING.label },
  { value: 'IMPLEMENTED', label: STATUS_META.IMPLEMENTED.label },
  { value: 'REJECTED', label: STATUS_META.REJECTED.label },
];

export default function GuideSuggestionsPanel({ role }: { role: string | null | undefined }) {
  const authorized = canManageGuideSuggestions(role);
  const [suggestions, setSuggestions] = useState<GuideSuggestion[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    if (!authorized) {
      setSuggestions([]);
      setLoading(false);
      setError('ليس لديك صلاحية لعرض اقتراحات الدليل.');
      return;
    }

    setLoading(true);
    setError('');
    const result = await listGuideSuggestions();
    setLoading(false);
    if (!result.ok) {
      console.error('Guide suggestions load failed:', result.error);
      setError(result.error.message || 'تعذر تحميل اقتراحات الدليل.');
      return;
    }
    setSuggestions(result.data);
  }, [authorized]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ar');
    return suggestions.filter((suggestion) => {
      if (filter !== 'ALL' && suggestion.status !== filter) return false;
      if (!needle) return true;
      return [suggestion.studentName, suggestion.subject, suggestion.description]
        .some((value) => value.toLocaleLowerCase('ar').includes(needle));
    });
  }, [filter, query, suggestions]);

  const updateStatus = async (suggestion: GuideSuggestion, status: GuideSuggestionStatus) => {
    if (!authorized || busyId || suggestion.status === status) return;
    setBusyId(suggestion.id);
    setError('');
    setFeedback('');
    const result = await updateGuideSuggestionStatus(suggestion.id, status);
    setBusyId(null);
    if (!result.ok) {
      console.error('Guide suggestion status update failed:', result.error);
      setError(result.error.message || 'تعذر تحديث حالة الاقتراح.');
      return;
    }
    setSuggestions((rows) => rows.map((row) => row.id === suggestion.id ? { ...row, status } : row));
    setFeedback(`تم تحديث حالة الاقتراح إلى «${STATUS_META[status].label}».`);
  };

  const remove = async (suggestion: GuideSuggestion) => {
    if (!authorized || busyId) return;
    if (!window.confirm(`هل تريد حذف اقتراح «${suggestion.subject}» نهائياً؟`)) return;
    setBusyId(suggestion.id);
    setError('');
    setFeedback('');
    const result = await deleteGuideSuggestion(suggestion.id);
    setBusyId(null);
    if (!result.ok) {
      console.error('Guide suggestion deletion failed:', result.error);
      setError(result.error.message || 'تعذر حذف الاقتراح.');
      return;
    }
    setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
    setFeedback('تم حذف الاقتراح.');
  };

  if (!authorized) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ليس لديك صلاحية لعرض اقتراحات الدليل.</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">اقتراحات دليل الطالب</h2>
          <p className="mt-1 text-sm text-gray-500">راجع الإضافات والتصحيحات الواردة من الطلاب والزوار وحدّث حالة كل اقتراح.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost justify-center disabled:cursor-wait disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${filter === item.value ? 'bg-navy-800 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <span className="sr-only">البحث في اقتراحات الدليل</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input-field pr-9" placeholder="ابحث بالاسم أو الموضوع..." />
        </label>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      {feedback && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{feedback}</div>}

      {loading ? (
        <div className="card flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-gray-500"><RefreshCw className="h-5 w-5 animate-spin" /> جاري تحميل الاقتراحات...</div>
      ) : filtered.length === 0 ? (
        <div className="card flex min-h-48 flex-col items-center justify-center text-center">
          <Clock3 className="h-10 w-10 text-gray-300" />
          <p className="mt-3 font-bold text-navy-900">لا توجد اقتراحات مطابقة</p>
          <p className="mt-1 text-sm text-gray-500">ستظهر الاقتراحات الجديدة هنا فور وصولها.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((suggestion) => {
            const busy = busyId === suggestion.id;
            const meta = STATUS_META[suggestion.status];
            return (
              <article key={suggestion.id} className="card flex flex-col p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-navy-900">{suggestion.subject}</h3>
                    <p className="mt-1 text-xs text-gray-500">مقدم من: <span className="font-bold text-gray-700">{suggestion.studentName}</span></p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-700">{suggestion.description}</p>
                <div className="mt-4 text-xs text-gray-400">
                  {new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(suggestion.createdAt))}
                </div>
                <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                  <label className="flex flex-1 items-center gap-2 text-xs font-bold text-gray-600">
                    الحالة
                    <select
                      value={suggestion.status}
                      disabled={busy}
                      onChange={(event) => void updateStatus(suggestion, event.target.value as GuideSuggestionStatus)}
                      className="input-field py-2 text-sm"
                    >
                      {(Object.keys(STATUS_META) as GuideSuggestionStatus[]).map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void remove(suggestion)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> حذف
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
