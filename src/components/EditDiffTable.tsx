import { useTranslation } from 'react-i18next';
import { buildEditDiffTableModel, type ExecutiveEditDiffRow } from '../domain/executiveEditWorkflow';

interface EditDiffTableProps {
  rows: Array<Pick<ExecutiveEditDiffRow, 'label' | 'oldValue' | 'newValue'> & { key?: string }>;
}

export default function EditDiffTable({ rows }: EditDiffTableProps) {
  const { t } = useTranslation();
  const model = buildEditDiffTableModel(rows);
  if (model.rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="hidden grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] bg-gray-50 text-xs font-bold text-gray-500 sm:grid">
        <div className="px-4 py-3">{t('admin.profileEdits.diffTable.field', 'اسم الحقل')}</div>
        <div className="border-r border-gray-200 px-4 py-3">{t('admin.profileEdits.diffTable.original', 'النص الأصلي')}</div>
        <div className="border-r border-gray-200 px-4 py-3">{t('admin.profileEdits.diffTable.proposed', 'النص المقترح/الجديد')}</div>
      </div>
      {model.rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-0 sm:px-0 sm:py-0"
        >
          <div className="font-bold text-navy-900 sm:px-4 sm:py-4">{row.label}</div>
          <div className="rounded-lg bg-rose-50 px-3 py-3 text-sm leading-relaxed text-rose-700 sm:rounded-none sm:border-r sm:border-gray-100 sm:bg-rose-50/60 sm:px-4 sm:py-4">
            <span className="mb-1 block text-[11px] font-bold text-rose-500 sm:hidden">{t('admin.profileEdits.diffTable.original', 'النص الأصلي')}</span>
            <span className="whitespace-pre-line break-words">{row.oldValue}</span>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold leading-relaxed text-emerald-700 sm:rounded-none sm:border-r sm:border-gray-100 sm:bg-emerald-50/60 sm:px-4 sm:py-4">
            <span className="mb-1 block text-[11px] font-bold text-emerald-600 sm:hidden">{t('admin.profileEdits.diffTable.proposed', 'النص المقترح/الجديد')}</span>
            <span className="whitespace-pre-line break-words">{row.newValue}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
