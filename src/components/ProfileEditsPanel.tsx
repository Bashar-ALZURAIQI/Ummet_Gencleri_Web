import { useState } from 'react';
import { Check, X, Pencil, ClipboardCheck, Inbox, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { committeeMeta, type PendingProfileEdit } from '../data/mockData';
import EditDiffTable from './EditDiffTable';
import ExecutiveEditDraftEditor from './ExecutiveEditDraftEditor';
import Modal from './Modal';

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function ProfileEditsPanel() {
  const {
    pendingProfileEdits,
    approveProfileEdit,
    approveProfileEditWithChanges,
    rejectProfileEdit,
    currentUser,
    editRequestsLoading,
    editRequestsError,
  } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PendingProfileEdit | null>(null);

  if (!currentUser || currentUser.role !== 'PRESIDENT') return null;

  const pending = (pendingProfileEdits ?? []).filter((e) => e?.status === 'PENDING_APPROVAL');

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (decision === 'approve' ? approveProfileEdit(id) : rejectProfileEdit(id));
    } finally {
      setBusyId(null);
    }
  };

  const approveEdited = async (snapshot: PendingProfileEdit['snapshot']) => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const result = await approveProfileEditWithChanges(editing.id, snapshot, 'اعتمد الرئيس نسخة منقحة من الطلب.');
      if (result.ok) setEditing(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <ClipboardCheck className="h-5 w-5 text-navy-600" />
          طلبات تعديل بيانات الهيئة التنفيذية
        </h3>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
          {pending.length} طلب معلق
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
          <p className="text-sm text-gray-500">لا توجد طلبات تعديل معلقة قيد اعتماد رئيس الاتحاد حالياً.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((edit) => (
            <div key={edit?.id ?? Math.random()} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
                  {committeeMeta[edit.committeeId]?.name ?? edit.committeeId}
                </span>
                <span className="text-sm font-bold text-navy-900">{edit.submittedBy ?? 'غير محدد'}</span>
                <span className="text-xs text-gray-500">({edit.submittedByRole ?? ''})</span>
                <span className="mr-auto text-xs text-gray-400">{fmtDate(edit.createdAt ?? '')}</span>
              </div>

              <div className="mt-3">
                {edit.detailsUnavailable ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    تعذر قراءة تفاصيل هذا الطلب القديم
                  </div>
                ) : (
                  <EditDiffTable rows={edit.summary ?? []} />
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!edit.detailsUnavailable && (
                  <>
                    <button
                      onClick={() => void decide(edit.id, 'approve')}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      موافقة
                    </button>
                    <button
                      onClick={() => setEditing(edit)}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      تعديل الطلب
                    </button>
                  </>
                )}
                <button
                  onClick={() => void decide(edit.id, 'reject')}
                  disabled={busyId !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  رفض
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={editing !== null}
        onClose={() => busyId === null && setEditing(null)}
        title="تعديل الطلب قبل الموافقة"
        maxWidth="max-w-3xl"
      >
        {editing && (
          <ExecutiveEditDraftEditor
            snapshot={editing.snapshot}
            busy={busyId === editing.id}
            onCancel={() => setEditing(null)}
            onSubmit={approveEdited}
          />
        )}
      </Modal>
    </div>
  );
}
