import { useState } from 'react';
import { Check, X, Pencil, Inbox, Save, ClipboardCheck, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { PendingSiteEdit } from '../data/mockData';
import Modal from './Modal';

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const technicalIdentity = (edit: PendingSiteEdit) => (
  `target=${edit.target} | path=${edit.diffs.map((row) => row.path ?? '-').join(',')} | recordId=${edit.recordId ?? '-'} | parentField=${edit.nested?.parentField ?? '-'} | itemId=${edit.nested?.itemId ?? '-'}`
);

export default function SiteEditsPanel() {
  const {
    pendingSiteEdits,
    approveSiteEdit,
    rejectSiteEdit,
    approveSiteEditWithChanges,
    currentUser,
    editRequestsLoading,
    editRequestsError,
  } = useApp();
  const [editingEdit, setEditingEdit] = useState<PendingSiteEdit | null>(null);
  const [revised, setRevised] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== 'PRESIDENT') return null;

  const pending = (pendingSiteEdits ?? []).filter((e) => e?.status === 'PENDING_PRESIDENT_APPROVAL');

  const openEdit = (edit: PendingSiteEdit) => {
    const init: Record<string, string> = {};
    (edit.diffs ?? []).forEach((d, i) => { init[String(i)] = d.newValue; });
    setRevised(init);
    setEditingEdit(edit);
  };

  const saveRevised = async () => {
    if (!editingEdit) return;
    const diffs = (editingEdit.diffs ?? []).map((d, i) =>
      d.editable === false ? d : { ...d, newValue: revised[String(i)] ?? d.newValue }
    );
    setBusyId(editingEdit.id);
    const result = await approveSiteEditWithChanges(editingEdit.id, diffs);
    setBusyId(null);
    if (result.ok) setEditingEdit(null);
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (decision === 'approve' ? approveSiteEdit(id) : rejectSiteEdit(id));
    } finally {
      setBusyId(null);
    }
  };

  const editableCount = (editingEdit?.diffs ?? []).filter((d) => d.editable !== false).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <ClipboardCheck className="h-5 w-5 text-navy-600" />
          مراجعة تعديلات الموقع
        </h3>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
          {pending.length} تعديل معلق
        </span>
      </div>

      {editRequestsError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {editRequestsError}
        </div>
      )}

      {editRequestsLoading && pending.length === 0 ? (
        <div className="py-14 text-center text-sm text-gray-500">جارٍ تحميل الطلبات...</div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">لا توجد تعديلات محتوى معلقة قيد اعتماد رئيس الاتحاد حالياً.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((edit) => (
            <div key={edit?.id ?? Math.random()} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
                  {edit.pageLabel}
                </span>
                <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
                  {edit.sectionLabel}
                </span>
                <span className="text-sm font-bold text-navy-900">{edit.submittedBy ?? 'غير محدد'}</span>
                <span className="text-xs text-gray-500">({edit.submittedByRole ?? ''})</span>
                <span className="mr-auto text-xs text-gray-400">{fmtDate(edit.createdAt ?? '')}</span>
              </div>
              <div dir="ltr" className="mt-2 break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
                {technicalIdentity(edit)}
              </div>

              <div className="mt-3 space-y-2">
                {(edit.diffs ?? []).map((row, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                    <div className="mb-1.5 font-bold text-navy-900">{row.label}</div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-[11px] text-gray-400">البيانات الحالية</div>
                        <div className="mt-0.5 break-words text-xs leading-relaxed text-rose-500 line-through">
                          {row.oldValue || '—'}
                        </div>
                      </div>
                      <div className="mt-4 select-none text-base text-gray-300">←</div>
                      <div className="flex-1">
                        <div className="text-[11px] text-gray-400">البيانات المقترحة</div>
                        <div className="mt-0.5 break-words text-xs leading-relaxed font-semibold text-emerald-600">
                          {row.newValue || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void decide(edit.id, 'approve')}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" />
                  اعتماد ونشر 🟢
                </button>
                <button
                  onClick={() => void decide(edit.id, 'reject')}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700"
                >
                  <X className="h-4 w-4" />
                  رفض الطلب 🔴
                </button>
                <button
                  onClick={() => openEdit(edit)}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-800"
                >
                  <Pencil className="h-4 w-4" />
                  تعديل ثم اعتماد ✏️🟢
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit-then-approve modal */}
      <Modal
        open={!!editingEdit}
        onClose={() => setEditingEdit(null)}
        title={`تعديل ثم اعتماد: ${editingEdit?.sectionLabel ?? ''}`}
        maxWidth="max-w-2xl"
      >
        {editingEdit && (
          <div className="space-y-4">
            <p className="rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs leading-relaxed text-gold-800">
              عدّل القيم المقترحة ثم اعتمدها لتُنشر فورًا على الموقع. الحقول غير قابلة للتعديل تظهر للاطلاع فقط.
            </p>
            <div dir="ltr" className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
              {technicalIdentity(editingEdit)}
            </div>
            {(editingEdit.diffs ?? []).map((d, i) => (
              <div key={i}>
                <label className="label-field">{d.label}</label>
                {d.editable === false || !d.path ? (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    <div className="text-[11px] text-gray-400">القيمة المقترحة (غير قابلة للتعديل)</div>
                    <div className="mt-1 break-words font-semibold text-emerald-700">{d.newValue || '—'}</div>
                  </div>
                ) : (
                  <textarea
                    rows={2}
                    className="input-field resize-none"
                    value={revised[String(i)] ?? d.newValue}
                    onChange={(e) => setRevised({ ...revised, [String(i)]: e.target.value })}
                    dir="auto"
                  />
                )}
              </div>
            ))}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingEdit(null)} className="btn-ghost">
                <X className="h-4 w-4" /> إلغاء
              </button>
              <button
                type="button"
                onClick={() => void saveRevised()}
                disabled={busyId === editingEdit.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" />
                حفظ ونشر التعديل المعدل
              </button>
            </div>
            {editableCount === 0 && (
              <p className="text-center text-xs text-gray-400">
                هذا التعديل لا يحتوي حقولًا قابلة للتحرير — ستُعتمده القيم كما اقترحتها اللجنة الإعلامية.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
