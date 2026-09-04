import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Lightbulb, Send } from 'lucide-react';
import Modal from './Modal';
import RequiredMark from './RequiredMark';
import {
  validateGuideSuggestionInput,
  type GuideSuggestionField,
  type GuideSuggestionInput,
} from '../domain/guideSuggestionPolicy.ts';
import { submitGuideSuggestion } from '../services/guideSuggestionService.ts';

const EMPTY_FORM: GuideSuggestionInput = { studentName: '', subject: '', description: '' };

export default function GuideSuggestionCallout() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GuideSuggestionInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<GuideSuggestionField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [sent, setSent] = useState(false);

  const updateField = (field: GuideSuggestionField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError('');
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setErrors({});
    setServerError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const validation = validateGuideSuggestionInput(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      const firstField = (Object.keys(validation.errors) as GuideSuggestionField[])[0];
      document.getElementById(`guide-suggestion-${firstField}`)?.focus();
      return;
    }

    setSubmitting(true);
    setServerError('');
    const result = await submitGuideSuggestion(validation.value);
    setSubmitting(false);

    if (!result.ok) {
      console.error('Guide suggestion submission failed:', result.error);
      setServerError(result.error.message || t('errors.generic'));
      return;
    }

    setForm(EMPTY_FORM);
    setErrors({});
    setOpen(false);
    setSent(true);
  };

  return (
    <>
      <section className="mb-8 overflow-hidden rounded-2xl border border-gold-200 bg-gradient-to-l from-gold-50 to-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-navy-900">{t('guide.suggestion.title', 'ساعدنا في تطوير دليل الطالب')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{t('guide.suggestion.subtitle', 'هل لديك إضافة أو تصحيح؟ اقترح تعديلاً')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(true); setSent(false); }}
          className="btn-primary mt-4 w-full justify-center sm:mt-0 sm:w-auto sm:shrink-0"
        >
          <Lightbulb className="h-4 w-4" />
          {t('guide.suggestion.button', 'تقديم اقتراح')}
        </button>
      </section>

      {sent && (
        <div role="status" className="mb-8 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          {t('guide.suggestion.success', 'شكراً لك، تم إرسال اقتراحك بنجاح. سيتم مراجعته قريباً.')}
        </div>
      )}

      <Modal open={open} onClose={close} title={t('guide.suggestion.modalTitle', 'اقتراح تعديل على دليل الطالب')} maxWidth="max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="guide-suggestion-studentName" className="label-field">{t('guide.suggestion.studentName', 'اسم الطالب')} <RequiredMark /></label>
            <input
              id="guide-suggestion-studentName"
              required
              maxLength={120}
              className={`input-field ${errors.studentName ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`}
              value={form.studentName}
              onChange={(event) => updateField('studentName', event.target.value)}
              aria-invalid={Boolean(errors.studentName)}
              aria-describedby={errors.studentName ? 'guide-suggestion-studentName-error' : undefined}
            />
            {errors.studentName && <p id="guide-suggestion-studentName-error" className="mt-1 text-xs font-semibold text-rose-600">{errors.studentName}</p>}
          </div>

          <div>
            <label htmlFor="guide-suggestion-subject" className="label-field">{t('guide.suggestion.subject', 'موضوع الاقتراح')} <RequiredMark /></label>
            <input
              id="guide-suggestion-subject"
              required
              maxLength={200}
              className={`input-field ${errors.subject ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`}
              value={form.subject}
              onChange={(event) => updateField('subject', event.target.value)}
              aria-invalid={Boolean(errors.subject)}
              aria-describedby={errors.subject ? 'guide-suggestion-subject-error' : undefined}
            />
            {errors.subject && <p id="guide-suggestion-subject-error" className="mt-1 text-xs font-semibold text-rose-600">{errors.subject}</p>}
          </div>

          <div>
            <label htmlFor="guide-suggestion-description" className="label-field">{t('guide.suggestion.description', 'الشرح أو التفاصيل')} <RequiredMark /></label>
            <textarea
              id="guide-suggestion-description"
              required
              maxLength={4000}
              rows={6}
              className={`input-field resize-y ${errors.description ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`}
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'guide-suggestion-description-error' : undefined}
            />
            <div className="mt-1 flex justify-between gap-3">
              {errors.description ? <p id="guide-suggestion-description-error" className="text-xs font-semibold text-rose-600">{errors.description}</p> : <span />}
              <span className="text-xs text-gray-400">{form.description.length}/4000</span>
            </div>
          </div>

          {serverError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} disabled={submitting} className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting} className="btn-primary min-w-32 justify-center disabled:cursor-wait disabled:opacity-70">
              <Send className="h-4 w-4" />
              {submitting ? t('common.sending', 'جاري الإرسال...') : t('guide.suggestion.submit', 'إرسال الاقتراح')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
