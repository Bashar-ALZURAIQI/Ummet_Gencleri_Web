import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mail, Phone, MapPin, Send, CheckCircle2, Clock, MessageSquare,
  Edit3, Save, Navigation,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import SiteEditBanner from '../components/SiteEditBanner';
import RequiredMark from '../components/RequiredMark';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { normalizeGoogleMapsInput } from '../domain/contactMap';
import type { ContactCardData } from '../data/mockData';

const iconMap: Record<string, typeof Mail> = {
  Mail, Phone, MapPin, Clock,
};

export default function ContactPage() {
  const {
    currentUser, addContactMessage, contactCards, contactMap, submitSiteEdit, savePublishedSiteTarget,
  } = useApp();
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', subject: '', body: '' });
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Card edit modal
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ContactCardData | null>(null);
  const [cardForm, setCardForm] = useState({ title: '', value: '', sub: '' });
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapForm, setMapForm] = useState({ title: contactMap.title, source: contactMap.embedUrl });
  const [mapError, setMapError] = useState('');

  const isPresidentOrMedia =
    currentUser &&
    (currentUser.role === 'PRESIDENT' || currentUser.role === 'MEDIA_HEAD');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const empty: string[] = [];
    if (form.name.trim().length < 2) { errs.name = t('contact.errors.nameMin'); empty.push('name'); }
    if (!form.email.trim()) { errs.email = t('contact.errors.emailRequired'); empty.push('email'); }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { errs.email = t('contact.errors.emailInvalid'); empty.push('email'); }
    if (form.subject.trim().length < 2) { errs.subject = t('contact.errors.subjectMin'); empty.push('subject'); }
    if (form.body.trim().length < 5) { errs.body = t('contact.errors.bodyMin'); empty.push('body'); }
    setErrors(errs);
    if (empty.length) {
      setInvalid(empty);
      const el = document.getElementById(fieldId(empty[0]));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      alert(t('contact.errors.fillRequired'));
      return;
    }
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    const result = await addContactMessage(form);
    setSubmitting(false);
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, submit: result.error ?? t('contact.errors.sendFailed') }));
      return;
    }
    setForm({ name: '', email: '', subject: '', body: '' });
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  };

  const openEditCard = (card: ContactCardData) => {
    setEditingCard(card);
    setCardForm({ title: card.title, value: card.value, sub: card.sub });
    setCardModalOpen(true);
  };

  const mediaNotice = () => undefined;

  const saveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    if (!validateRequired(cardForm, ['title', 'value', 'sub'], setInvalid)) return;
    const next: ContactCardData = { ...editingCard, ...cardForm };
    if (currentUser?.role === 'MEDIA_HEAD') {
      const diffs = ([
        ['العنوان', 'title', editingCard.title, next.title, true],
        ['القيمة', 'value', editingCard.value, next.value, true],
        ['الوصف الفرعي', 'sub', editingCard.sub, next.sub, true],
      ] as [string, string, string, string, boolean][])
        .filter((row) => row[2] !== row[3])
        .map((row) => ({
          label: row[0], path: row[1],
          oldValue: row[2], newValue: row[3], editable: row[4],
        }));
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'contact', pageLabel: 'اتصل بنا', sectionLabel: next.title,
          target: 'contactCards', op: 'update', recordId: editingCard.id, recordValue: next, diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setCardModalOpen(false);
      return;
    }
    const saved = await savePublishedSiteTarget(
      'contactCards',
      contactCards.map((c) => c.id === editingCard.id ? next : c),
    );
    if (!saved.ok) { alert(saved.error); return; }
    setCardModalOpen(false);
  };

  const openEditMap = () => {
    setMapForm({ title: contactMap.title, source: contactMap.embedUrl });
    setMapError('');
    setMapModalOpen(true);
  };

  const saveMap = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeGoogleMapsInput(mapForm.source);
    if (!mapForm.title.trim()) { setMapError('عنوان الخريطة مطلوب.'); return; }
    if (!normalized.ok) { setMapError(normalized.error); return; }
    const next = { title: mapForm.title.trim(), embedUrl: normalized.embedUrl, openUrl: normalized.openUrl };
    if (currentUser?.role === 'MEDIA_HEAD') {
      const fields = [
        ['عنوان الخريطة', 'title', contactMap.title, next.title],
        ['رابط تضمين الخريطة', 'embedUrl', contactMap.embedUrl, next.embedUrl],
        ['رابط فتح الخريطة', 'openUrl', contactMap.openUrl, next.openUrl],
      ] as const;
      const diffs = fields.filter((row) => row[2] !== row[3]).map((row) => ({
        label: row[0], path: row[1], oldValue: row[2], newValue: row[3], editable: true,
      }));
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'contact', pageLabel: 'اتصل بنا', sectionLabel: 'خريطة الموقع',
          target: 'contactMap', op: 'update', diffs,
        });
        if (!submitted) return;
      }
    } else {
      const saved = await savePublishedSiteTarget('contactMap', next);
      if (!saved.ok) { setMapError(saved.error ?? 'تعذر حفظ الخريطة.'); return; }
    }
    setMapModalOpen(false);
  };

  return (
    <div className="animate-fade-in pt-16 lg:pt-20">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 py-16 text-center lg:py-20">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="container-app relative">
          <span className="text-sm font-bold uppercase tracking-wider text-gold-300">{t('contact.badge')}</span>
          <h1 className="mt-3 text-4xl font-extrabold text-white lg:text-5xl">{t('contact.title')}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-300">
            {t('contact.description')}
          </p>
        </div>
      </section>

      <section className="container-app py-14">
        <SiteEditBanner pageId="contact" />
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Contact info cards */}
          <div className="space-y-4">
            {contactCards.map((c) => {
              const Icon = iconMap[c.icon] ?? Mail;
              return (
                <div key={c.id} className="group/card card relative flex items-start gap-4 p-5 transition-all hover:shadow-md">
                  {isPresidentOrMedia && (
                    <button
                      onClick={() => openEditCard(c)}
                      className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-navy-700 opacity-0 shadow ring-1 ring-gray-200 transition-opacity hover:bg-navy-50 group-hover/card:opacity-100"
                      title={t('common.edit')}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{c.title}</div>
                    <div className="mt-1 font-bold text-navy-900" dir={c.ltr ? 'ltr' : undefined}>{c.value}</div>
                    <div className="text-xs text-gray-500">{c.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            <div className="card p-6 lg:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-800 text-white">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-navy-900">{t('contact.sendMessage')}</h2>
                  <p className="text-sm text-gray-500">{t('contact.responseNotice')}</p>
                </div>
              </div>

              {sent && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 animate-fade-in-fast">
                  <CheckCircle2 className="h-5 w-5" />
                  {t('contact.successMessage')}
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={fieldId('name')} className="label-field">{t('contact.fullName')} <RequiredMark /></label>
                    <input
                      id={fieldId('name')}
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => { setForm({ ...form, name: e.target.value }); clearInvalid(setInvalid, 'name'); setErrors((prev) => ({ ...prev, name: '' })); }}
                      className={`input-field ${isInvalid(invalid, 'name')}`}
                      placeholder={t('contact.namePlaceholder')}
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor={fieldId('email')} className="label-field">{t('contact.email')} <RequiredMark /></label>
                    <input
                      id={fieldId('email')}
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => { setForm({ ...form, email: e.target.value }); clearInvalid(setInvalid, 'email'); setErrors((prev) => ({ ...prev, email: '' })); }}
                      className={`input-field ${isInvalid(invalid, 'email')}`}
                      placeholder="example@email.com"
                      dir="ltr"
                    />
                    {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor={fieldId('subject')} className="label-field">{t('contact.subject')} <RequiredMark /></label>
                  <input
                    id={fieldId('subject')}
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => { setForm({ ...form, subject: e.target.value }); clearInvalid(setInvalid, 'subject'); setErrors((prev) => ({ ...prev, subject: '' })); }}
                    className={`input-field ${isInvalid(invalid, 'subject')}`}
                    placeholder={t('contact.subjectPlaceholder')}
                  />
                  {errors.subject && <p className="mt-1 text-xs text-red-500">{errors.subject}</p>}
                </div>
                <div>
                  <label htmlFor={fieldId('body')} className="label-field">{t('contact.message')} <RequiredMark /></label>
                  <textarea
                    id={fieldId('body')}
                    required
                    value={form.body}
                    onChange={(e) => { setForm({ ...form, body: e.target.value }); clearInvalid(setInvalid, 'body'); setErrors((prev) => ({ ...prev, body: '' })); }}
                    rows={5}
                    className={`input-field resize-none ${isInvalid(invalid, 'body')}`}
                    placeholder={t('contact.messagePlaceholder')}
                  />
                  {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body}</p>}
                </div>
                {errors.submit && <p className="text-sm font-semibold text-red-600">{errors.submit}</p>}
                <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60 sm:w-auto">
                  <Send className="h-4 w-4" />
                  {submitting ? t('contact.sending') : t('contact.sendButton')}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Interactive map - Erzurum / Atatürk University */}
        <div className="relative mt-10 overflow-hidden rounded-3xl border border-gray-100 shadow-md">
          {isPresidentOrMedia && (
            <button type="button" onClick={openEditMap} className="absolute left-3 top-2 z-10 btn-ghost bg-white/95 text-xs">
              <Edit3 className="h-3.5 w-3.5" /> تعديل الخريطة
            </button>
          )}
          <div className="flex items-center justify-between bg-navy-800 px-5 py-3">
            <div className="flex items-center gap-2 text-white">
              <Navigation className="h-4 w-4 text-gold-400" />
              <span className="text-sm font-bold">{contactMap.title}</span>
            </div>
            <a
              href={contactMap.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-gold-300 hover:text-gold-200"
            >
              {t('contact.openInGoogleMaps')}
            </a>
          </div>
          <iframe
            title="موقع الاتحاد - جامعة أتاتورك أرضروم"
            src={contactMap.embedUrl}
            className="h-80 w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      {/* Card edit modal */}
      <Modal open={cardModalOpen} onClose={() => setCardModalOpen(false)} title="تعديل بطاقة التواصل" maxWidth="max-w-sm">
        <form onSubmit={saveCard} className="space-y-4">
          <div>
            <label htmlFor={fieldId('title')} className="label-field">العنوان <RequiredMark /></label>
            <input id={fieldId('title')} required className={`input-field ${isInvalid(invalid, 'title')}`} value={cardForm.title} onChange={(e) => { setCardForm({ ...cardForm, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} />
          </div>
          <div>
            <label htmlFor={fieldId('value')} className="label-field">القيمة <RequiredMark /></label>
            <input id={fieldId('value')} required className={`input-field ${isInvalid(invalid, 'value')}`} dir={editingCard?.ltr ? 'ltr' : undefined} value={cardForm.value} onChange={(e) => { setCardForm({ ...cardForm, value: e.target.value }); clearInvalid(setInvalid, 'value'); }} />
          </div>
          <div>
            <label htmlFor={fieldId('sub')} className="label-field">الوصف الفرعي <RequiredMark /></label>
            <input id={fieldId('sub')} required className={`input-field ${isInvalid(invalid, 'sub')}`} value={cardForm.sub} onChange={(e) => { setCardForm({ ...cardForm, sub: e.target.value }); clearInvalid(setInvalid, 'sub'); }} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCardModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={mapModalOpen} onClose={() => setMapModalOpen(false)} title="تعديل خريطة الموقع" maxWidth="max-w-lg">
        <form onSubmit={saveMap} className="space-y-4">
          <div>
            <label className="label-field">عنوان الخريطة <RequiredMark /></label>
            <input className="input-field" value={mapForm.title} onChange={(e) => { setMapForm({ ...mapForm, title: e.target.value }); setMapError(''); }} />
          </div>
          <div>
            <label className="label-field">رابط Google Maps أو كود iframe <RequiredMark /></label>
            <textarea dir="ltr" rows={4} className="input-field resize-none" value={mapForm.source} onChange={(e) => { setMapForm({ ...mapForm, source: e.target.value }); setMapError(''); }} />
            <p className="mt-1 text-xs text-gray-500">يمكن لصق رابط التضمين أو كود iframe من Google Maps.</p>
          </div>
          {mapError && <p className="text-sm font-semibold text-red-600">{mapError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMapModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> حفظ</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
