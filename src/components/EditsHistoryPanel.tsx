import { useState } from 'react';
import { FileText, Inbox, CheckCircle2, XCircle, Pencil, Users, Clock, AlertCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EDIT_DECISION_LABEL, type EditHistoryDecision } from '../data/mockData';
import { buildEditAuditViewModel } from '../domain/editAuditView';
import EditDiffTable from './EditDiffTable';

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

type FinalEditDecision = Exclude<EditHistoryDecision, 'PENDING'>;

const decisionStyle: Record<FinalEditDecision, { chip: string; icon: typeof CheckCircle2 }> = {
  APPROVED: { chip: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  REJECTED: { chip: 'bg-rose-100 text-rose-700', icon: XCircle },
  EDITED_APPROVED: { chip: 'bg-sky-100 text-sky-700', icon: Pencil },
};

const typeFilters: { id: 'all' | 'site' | 'profile'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'site', label: 'تعديلات الموقع' },
  { id: 'profile', label: 'تعديلات الهيئة' },
];

export default function EditsHistoryPanel() {
  const {
    editsHistory,
    currentUser,
    editRequestsLoading,
    editRequestsError,
    clearEditRequestsError,
  } = useApp();
  const [typeFilter, setTypeFilter] = useState<'all' | 'site' | 'profile'>('all');

  if (!currentUser || currentUser.role === 'STUDENT') return null;

  const list = buildEditAuditViewModel(editsHistory ?? []).entries;
  const typed = typeFilter === 'all' ? list : list.filter((e) => e?.type === typeFilter);
  const officialHistory = typed.filter((entry) => !entry.isLegacy);
  const legacyHistory = currentUser.role === 'PRESIDENT'
    ? typed.filter((entry) => entry.isLegacy)
    : [];
  const filtered = [...officialHistory, ...legacyHistory];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <FileText className="h-5 w-5 text-navy-600" />
          سجل التعديلات والقرارات
        </h3>
        <span className="rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
          {officialHistory.length} طلب رسمي مسجّل
        </span>
      </div>

      {editRequestsError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{editRequestsError}</span>
          <button type="button" onClick={clearEditRequestsError} aria-label="إغلاق رسالة الخطأ">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {typeFilters.map((f) => (
          <button
            key={f.id}
            onClick={() => setTypeFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              typeFilter === f.id ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {editRequestsLoading && filtered.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
          <Clock className="h-5 w-5 animate-pulse" /> جارٍ تحميل السجل المصرح لك به...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">لا توجد طلبات أو قرارات مسجلة ضمن صلاحيتك بعد.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((entry) => {
            const style = decisionStyle[entry?.decision ?? 'APPROVED'] ?? { chip: 'bg-gray-100 text-gray-600', icon: FileText };
            const { chip, icon: DecisionIcon } = style;
            return (
              <div key={entry?.id ?? Math.random()}>
                {entry.isLegacy && entry === legacyHistory[0] && (
                  <div className="mb-3 mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                    سجل قديم غير موثّق — ظاهر للرئيس فقط، وغير محتسب ضمن الطلبات الرسمية. لا تُعتمد منه هوية المرسل أو المراجع.
                  </div>
                )}
                <div className={`rounded-xl border p-4 ${entry.isLegacy ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.isLegacy && (
                    <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900">
                      قديم وغير موثّق
                    </span>
                  )}
                  <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${chip}`}>
                    <DecisionIcon className="h-3.5 w-3.5" />
                    {EDIT_DECISION_LABEL[entry.decision] ?? entry.decision ?? 'قرار'}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
                    {entry.type === 'profile' ? <Users className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    {entry.editType ?? ''}
                  </span>
                  <span className="mr-auto text-xs text-gray-400">{fmtDate(entry.decisionDate ?? '')}</span>
                </div>

                {entry.decisionNote && entry.decision !== 'EDITED_APPROVED' && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
                    <span className="font-bold">ملاحظة القرار: </span>{entry.decisionNote}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-bold text-navy-900">{entry.applicantName ?? 'غير محدد'}</span>
                  <span className="text-xs text-gray-500">({entry.applicantRole ?? ''})</span>
                  <span className="text-xs text-gray-400">— {entry.committee ?? ''}</span>
                </div>

                <div className="mt-3">
                  {entry.detailsUnavailable ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      تعذر قراءة تفاصيل هذا الطلب القديم
                    </div>
                  ) : (
                    <EditDiffTable rows={entry.diffs} />
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
