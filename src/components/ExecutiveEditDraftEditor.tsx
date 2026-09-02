import { useState } from 'react';
import { Save } from 'lucide-react';
import {
  applyExecutiveTextRevision,
  type ExecutiveContentSnapshot,
} from '../domain/executiveEditWorkflow';

interface ExecutiveEditDraftEditorProps {
  snapshot: ExecutiveContentSnapshot;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (snapshot: ExecutiveContentSnapshot) => Promise<void> | void;
}

export default function ExecutiveEditDraftEditor({
  snapshot,
  busy = false,
  onCancel,
  onSubmit,
}: ExecutiveEditDraftEditorProps) {
  const [responsibilities, setResponsibilities] = useState(snapshot.responsibilities.join('\n'));
  const [stats, setStats] = useState(snapshot.stats.map((item) => ({ ...item })));
  const [members, setMembers] = useState(snapshot.members.map((item) => ({ name: item.name, position: item.position })));
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const revision = applyExecutiveTextRevision(snapshot, {
      responsibilities: responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
      stats: stats.map((item) => ({ label: item.label.trim(), value: item.value.trim() })),
      members: members.map((item, index) => ({
        id: snapshot.members[index].id,
        name: item.name.trim(),
        position: item.position.trim(),
        photo: snapshot.members[index].photo,
      })),
    });
    if (!revision.ok) {
      setError(revision.error);
      return;
    }
    setError(null);
    await onSubmit(revision.value);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="label-field" htmlFor="executive-edit-responsibilities">المهام والمسؤوليات</label>
        <textarea
          id="executive-edit-responsibilities"
          rows={6}
          className="input-field resize-y"
          value={responsibilities}
          onChange={(event) => setResponsibilities(event.target.value)}
          placeholder="مهمة واحدة في كل سطر"
        />
        <p className="mt-1 text-xs text-gray-400">اكتب مهمة واحدة في كل سطر.</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-navy-900">الإحصائيات</legend>
        {stats.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-2">
            <input
              className="input-field"
              aria-label={`قيمة الإحصائية ${index + 1}`}
              value={item.value}
              onChange={(event) => setStats((current) => current.map((row, rowIndex) => (
                rowIndex === index ? { ...row, value: event.target.value } : row
              )))}
              placeholder="القيمة"
            />
            <input
              className="input-field"
              aria-label={`مسمى الإحصائية ${index + 1}`}
              value={item.label}
              onChange={(event) => setStats((current) => current.map((row, rowIndex) => (
                rowIndex === index ? { ...row, label: event.target.value } : row
              )))}
              placeholder="المسمى"
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-navy-900">أعضاء اللجنة</legend>
        <p className="text-xs text-gray-400">يمكن تعديل الاسم والمسؤولية فقط؛ المعرّفات والصور محمية.</p>
        {members.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-2">
            <input
              className="input-field"
              aria-label={`اسم عضو اللجنة ${index + 1}`}
              value={item.name}
              onChange={(event) => setMembers((current) => current.map((row, rowIndex) => (
                rowIndex === index ? { ...row, name: event.target.value } : row
              )))}
              placeholder="الاسم"
            />
            <input
              className="input-field"
              aria-label={`مسؤولية عضو اللجنة ${index + 1}`}
              value={item.position}
              onChange={(event) => setMembers((current) => current.map((row, rowIndex) => (
                rowIndex === index ? { ...row, position: event.target.value } : row
              )))}
              placeholder="المسؤولية"
            />
          </div>
        ))}
      </fieldset>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? 'جاري الاعتماد...' : 'اعتماد النسخة المعدلة'}
        </button>
      </div>
    </form>
  );
}
