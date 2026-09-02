import { createContext, useContext, useState, Children, cloneElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  Target, Eye, Heart, Users, GraduationCap, Award, Sparkles, BookOpen, Handshake, ShieldCheck,
  Save, CheckCircle2, Plus, Trash2, Settings, type LucideIcon,
} from 'lucide-react';
import { useApp, type AboutContent } from '../context/AppContext';
import RequiredMark from './RequiredMark';
import ManagedFileField from './ManagedFileField';
import { validateRequired, validateChecks, clearInvalid, isInvalid, fieldId, isBlank, type InvalidSetter } from '../utils/formValidation';

const iconOptions: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'Target', label: 'هدف', Icon: Target },
  { value: 'Eye', label: 'رؤية', Icon: Eye },
  { value: 'Heart', label: 'قلب', Icon: Heart },
  { value: 'Users', label: 'أعضاء', Icon: Users },
  { value: 'GraduationCap', label: 'جامعة', Icon: GraduationCap },
  { value: 'Award', label: 'جوائز', Icon: Award },
  { value: 'Sparkles', label: 'إبداع', Icon: Sparkles },
  { value: 'BookOpen', label: 'تعليم', Icon: BookOpen },
  { value: 'Handshake', label: 'تعاون', Icon: Handshake },
  { value: 'ShieldCheck', label: 'رقابة', Icon: ShieldCheck },
];

type SubTab = 'header' | 'story' | 'mission' | 'goals' | 'cta';

export default function AboutContentCMS() {
  const [subTab, setSubTab] = useState<SubTab>('header');

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'header', label: 'الترويسة' },
    { id: 'story', label: 'قصتنا' },
    { id: 'mission', label: 'القيم والرؤية' },
    { id: 'goals', label: 'الأهداف' },
    { id: 'cta', label: 'الدعوة للانضمام' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-4">
        <Settings className="h-6 w-6 text-gold-600" />
        <div>
          <h2 className="text-lg font-extrabold text-navy-900">إدارة محتوى صفحة عن الاتحاد</h2>
          <p className="text-sm text-gray-500">تحكّم في جميع أقسام صفحة "عن الاتحاد". تظهر التعديلات فورًا.</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              subTab === t.id ? 'bg-navy-800 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'header' && <HeaderTab />}
      {subTab === 'story' && <StoryTab />}
      {subTab === 'mission' && <MissionTab />}
      {subTab === 'goals' && <GoalsTab />}
      {subTab === 'cta' && <CtaTab />}
    </div>
  );
}

/* ---------- Header ---------- */
function HeaderTab() {
  const { aboutContent, updateAboutFields } = useApp();
  const [form, setForm] = useState<AboutContent>(aboutContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields = {
      headerBadge: form.header.badge,
      headerTitle: form.header.title,
      headerDesc: form.header.description,
    };
    if (!validateRequired(fields, Object.keys(fields), setInvalid)) return;
    const confirmed = await updateAboutFields([
      { path: 'header.badge', value: form.header.badge },
      { path: 'header.title', value: form.header.title },
      { path: 'header.description', value: form.header.description },
    ]);
    if (!confirmed) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <SectionTitle icon={Settings} title="الترويسة الرئيسية" />
      <FormFields invalid={invalid} setInvalid={setInvalid}>
        <Field label="الشارة (Badge)" name="headerBadge">
          <input className="input-field" value={form.header.badge} onChange={(e) => setForm({ ...form, header: { ...form.header, badge: e.target.value } })} />
        </Field>
        <Field label="العنوان الرئيسي" name="headerTitle">
          <input className="input-field" value={form.header.title} onChange={(e) => setForm({ ...form, header: { ...form.header, title: e.target.value } })} />
        </Field>
        <Field label="النص الوصفي" name="headerDesc">
          <textarea rows={3} className="input-field resize-none" value={form.header.description} onChange={(e) => setForm({ ...form, header: { ...form.header, description: e.target.value } })} />
        </Field>
      </FormFields>
      <SaveBar saved={saved} onReset={() => setForm(aboutContent)} />
    </form>
  );
}

/* ---------- Story ---------- */
function StoryTab() {
  const { aboutContent, uploadManagedFile, updateAboutFields } = useApp();
  const [form, setForm] = useState<AboutContent>(aboutContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const checks = [
      { key: 'storyBadge', ok: !isBlank(form.story.badge) },
      { key: 'storyTitle', ok: !isBlank(form.story.title) },
      ...form.story.paragraphs.map((p, i) => ({ key: `para${i}`, ok: !isBlank(p) })),
      ...form.story.images.map((img, i) => ({ key: `img${i}`, ok: !isBlank(img) })),
    ];
    if (!validateChecks(checks, setInvalid)) return;
    const confirmed = await updateAboutFields([
      { path: 'story.badge', value: form.story.badge },
      { path: 'story.title', value: form.story.title },
      { path: 'story.paragraphs', value: form.story.paragraphs },
      { path: 'story.images', value: form.story.images },
    ]);
    if (!confirmed) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateParagraph = (idx: number, val: string) => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, paragraphs: prev.story.paragraphs.map((p, i) => i === idx ? val : p) } }));
    clearInvalid(setInvalid, `para${idx}`);
  };
  const addParagraph = () => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, paragraphs: [...prev.story.paragraphs, ''] } }));
  };
  const removeParagraph = (idx: number) => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, paragraphs: prev.story.paragraphs.filter((_, i) => i !== idx) } }));
  };
  const updateImage = (idx: number, val: string) => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, images: prev.story.images.map((img, i) => i === idx ? val : img) } }));
    clearInvalid(setInvalid, `img${idx}`);
  };
  const addImage = () => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, images: [...prev.story.images, ''] } }));
  };
  const removeImage = (idx: number) => {
    setForm((prev) => ({ ...prev, story: { ...prev.story, images: prev.story.images.filter((_, i) => i !== idx) } }));
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <SectionTitle icon={BookOpen} title="قسم قصتنا" />
      <FormFields invalid={invalid} setInvalid={setInvalid}>
        <Field label="الشارة (Badge)" name="storyBadge">
          <input className="input-field" value={form.story.badge} onChange={(e) => setForm({ ...form, story: { ...form.story, badge: e.target.value } })} />
        </Field>
        <Field label="العنوان الرئيسي" name="storyTitle">
          <input className="input-field" value={form.story.title} onChange={(e) => setForm({ ...form, story: { ...form.story, title: e.target.value } })} />
        </Field>

        <div className="border-t border-gray-100 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900">الفقرات التاريخية <RequiredMark /></span>
            <button type="button" onClick={addParagraph} className="flex items-center gap-1 text-sm font-bold text-navy-700 hover:text-navy-900">
              <Plus className="h-4 w-4" /> إضافة فقرة
            </button>
          </div>
          <div className="space-y-3">
            {form.story.paragraphs.map((p, idx) => (
              <div key={idx} className="flex gap-2">
                <textarea
                  id={fieldId(`para${idx}`)}
                  required
                  rows={2}
                  className={`input-field flex-1 resize-none ${isInvalid(invalid, `para${idx}`)}`}
                  value={p}
                  onChange={(e) => updateParagraph(idx, e.target.value)}
                  placeholder={`الفقرة ${idx + 1}`}
                />
                <button type="button" onClick={() => removeParagraph(idx)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-rose-600 transition-colors hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900">الصور المرفقة <RequiredMark /></span>
            <button type="button" onClick={addImage} className="flex items-center gap-1 text-sm font-bold text-navy-700 hover:text-navy-900">
              <Plus className="h-4 w-4" /> إضافة صورة
            </button>
          </div>
          <div className="space-y-2">
            {form.story.images.map((img, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border border-gray-100 p-3">
                <ManagedFileField
                  usage="site-image"
                  label={`صورة القصة ${idx + 1}`}
                  currentUrl={img}
                  required
                  error={isInvalid(invalid, `img${idx}`) ? 'يرجى رفع الصورة.' : null}
                  onUpload={(file, onProgress) => uploadManagedFile('site-image', file, onProgress)}
                  onUploaded={(asset) => {
                    updateImage(idx, asset.publicUrl);
                    clearInvalid(setInvalid, `img${idx}`);
                  }}
                />
                <button type="button" onClick={() => removeImage(idx)} className="btn-ghost text-rose-600">
                  <Trash2 className="h-4 w-4" /> حذف الصورة
                </button>
              </div>
            ))}
          </div>
        </div>
      </FormFields>

      <SaveBar saved={saved} onReset={() => setForm(aboutContent)} />
    </form>
  );
}

/* ---------- Mission ---------- */
function MissionTab() {
  const { aboutContent, updateAboutFields } = useApp();
  const [form, setForm] = useState<AboutContent>(aboutContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const checks = [
      { key: 'missionBadge', ok: !isBlank(form.mission.badge) },
      { key: 'missionTitle', ok: !isBlank(form.mission.title) },
      ...form.mission.cards.flatMap((c, i) => [
        { key: `mCardTitle${i}`, ok: !isBlank(c.title) },
        { key: `mCardText${i}`, ok: !isBlank(c.text) },
      ]),
    ];
    if (!validateChecks(checks, setInvalid)) return;
    const confirmed = await updateAboutFields([
      { path: 'mission.badge', value: form.mission.badge },
      { path: 'mission.title', value: form.mission.title },
      { path: 'mission.cards', value: form.mission.cards },
    ]);
    if (!confirmed) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateCard = (idx: number, field: 'icon' | 'title' | 'text', val: string) => {
    setForm((prev) => ({ ...prev, mission: { ...prev.mission, cards: prev.mission.cards.map((c, i) => i === idx ? { ...c, [field]: val } : c) } }));
    if (field === 'title') clearInvalid(setInvalid, `mCardTitle${idx}`);
    if (field === 'text') clearInvalid(setInvalid, `mCardText${idx}`);
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <SectionTitle icon={Target} title="قسم القيم والرؤية والرسالة" />
      <FormFields invalid={invalid} setInvalid={setInvalid}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الشارة (Badge)" name="missionBadge">
            <input className="input-field" value={form.mission.badge} onChange={(e) => setForm({ ...form, mission: { ...form.mission, badge: e.target.value } })} />
          </Field>
          <Field label="العنوان" name="missionTitle">
            <input className="input-field" value={form.mission.title} onChange={(e) => setForm({ ...form, mission: { ...form.mission, title: e.target.value } })} />
          </Field>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-4">
          {form.mission.cards.map((c, idx) => (
            <div key={idx} className="rounded-xl border border-gray-100 p-4">
              <div className="mb-3 text-sm font-bold text-navy-900">كرت {idx + 1}</div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="الأيقونة" name={`mCardIcon${idx}`}>
                  <select className="input-field" value={c.icon} onChange={(e) => updateCard(idx, 'icon', e.target.value)}>
                    {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="العنوان" name={`mCardTitle${idx}`}>
                  <input className="input-field" value={c.title} onChange={(e) => updateCard(idx, 'title', e.target.value)} />
                </Field>
                <Field label="النص" name={`mCardText${idx}`}>
                  <input className="input-field" value={c.text} onChange={(e) => updateCard(idx, 'text', e.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </FormFields>

      <SaveBar saved={saved} onReset={() => setForm(aboutContent)} />
    </form>
  );
}

/* ---------- Goals ---------- */
function GoalsTab() {
  const { aboutContent, updateAboutFields } = useApp();
  const [form, setForm] = useState<AboutContent>(aboutContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const checks = [
      { key: 'goalsBadge', ok: !isBlank(form.goals.badge) },
      { key: 'goalsTitle', ok: !isBlank(form.goals.title) },
      ...form.goals.cards.flatMap((c, i) => [
        { key: `gCardTitle${i}`, ok: !isBlank(c.title) },
        { key: `gCardDesc${i}`, ok: !isBlank(c.desc) },
      ]),
    ];
    if (!validateChecks(checks, setInvalid)) return;
    const confirmed = await updateAboutFields([
      { path: 'goals.badge', value: form.goals.badge },
      { path: 'goals.title', value: form.goals.title },
      { path: 'goals.cards', value: form.goals.cards },
    ]);
    if (!confirmed) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateCard = (idx: number, field: 'icon' | 'title' | 'desc', val: string) => {
    setForm((prev) => ({ ...prev, goals: { ...prev.goals, cards: prev.goals.cards.map((c, i) => i === idx ? { ...c, [field]: val } : c) } }));
    if (field === 'title') clearInvalid(setInvalid, `gCardTitle${idx}`);
    if (field === 'desc') clearInvalid(setInvalid, `gCardDesc${idx}`);
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <SectionTitle icon={Award} title="قسم الأهداف" />
      <FormFields invalid={invalid} setInvalid={setInvalid}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الشارة (Badge)" name="goalsBadge">
            <input className="input-field" value={form.goals.badge} onChange={(e) => setForm({ ...form, goals: { ...form.goals, badge: e.target.value } })} />
          </Field>
          <Field label="العنوان" name="goalsTitle">
            <input className="input-field" value={form.goals.title} onChange={(e) => setForm({ ...form, goals: { ...form.goals, title: e.target.value } })} />
          </Field>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-4">
          {form.goals.cards.map((c, idx) => (
            <div key={idx} className="rounded-xl border border-gray-100 p-4">
              <div className="mb-3 text-sm font-bold text-navy-900">هدف {idx + 1}</div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="الأيقونة" name={`gCardIcon${idx}`}>
                  <select className="input-field" value={c.icon} onChange={(e) => updateCard(idx, 'icon', e.target.value)}>
                    {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="العنوان" name={`gCardTitle${idx}`}>
                  <input className="input-field" value={c.title} onChange={(e) => updateCard(idx, 'title', e.target.value)} />
                </Field>
                <Field label="الوصف" name={`gCardDesc${idx}`}>
                  <input className="input-field" value={c.desc} onChange={(e) => updateCard(idx, 'desc', e.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </FormFields>

      <SaveBar saved={saved} onReset={() => setForm(aboutContent)} />
    </form>
  );
}

/* ---------- CTA ---------- */
function CtaTab() {
  const { aboutContent, updateAboutFields } = useApp();
  const [form, setForm] = useState<AboutContent>(aboutContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields = {
      ctaTitle: form.cta.title,
      ctaDesc: form.cta.description,
      ctaButton: form.cta.buttonText,
    };
    if (!validateRequired(fields, Object.keys(fields), setInvalid)) return;
    const confirmed = await updateAboutFields([
      { path: 'cta.icon', value: form.cta.icon },
      { path: 'cta.title', value: form.cta.title },
      { path: 'cta.description', value: form.cta.description },
      { path: 'cta.buttonText', value: form.cta.buttonText },
    ]);
    if (!confirmed) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <SectionTitle icon={Award} title="الدعوة للانضمام" />
      <FormFields invalid={invalid} setInvalid={setInvalid}>
        <Field label="الأيقونة" name="ctaIcon">
          <select className="input-field" value={form.cta.icon} onChange={(e) => setForm({ ...form, cta: { ...form.cta, icon: e.target.value } })}>
            {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="العنوان" name="ctaTitle">
          <input className="input-field" value={form.cta.title} onChange={(e) => setForm({ ...form, cta: { ...form.cta, title: e.target.value } })} />
        </Field>
        <Field label="النص التحفيزي" name="ctaDesc">
          <textarea rows={2} className="input-field resize-none" value={form.cta.description} onChange={(e) => setForm({ ...form, cta: { ...form.cta, description: e.target.value } })} />
        </Field>
        <Field label="نص الزر" name="ctaButton">
          <input className="input-field" value={form.cta.buttonText} onChange={(e) => setForm({ ...form, cta: { ...form.cta, buttonText: e.target.value } })} />
        </Field>
      </FormFields>
      <SaveBar saved={saved} onReset={() => setForm(aboutContent)} />
    </form>
  );
}

/* ---------- Shared ---------- */
function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 text-navy-600" />
      <h3 className="text-base font-bold text-navy-900">{title}</h3>
    </div>
  );
}

type FieldCtxType = {
  invalid: string[];
  setInvalid: InvalidSetter;
};

const FieldCtx = createContext<FieldCtxType | null>(null);

function FormFields({ invalid, setInvalid, children }: FieldCtxType & { children: ReactNode }) {
  return <FieldCtx.Provider value={{ invalid, setInvalid }}>{children}</FieldCtx.Provider>;
}

function Field({ label, name, children }: { label: string; name: string; children: ReactElement }) {
  const ctx = useContext(FieldCtx);
  const err = ctx ? isInvalid(ctx.invalid, name) : false;
  const child = Children.only(children);
  const originalOnChange = (child.props as { onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void }).onChange;
  return (
    <div>
      <label className="label-field">{label} <RequiredMark /></label>
      {cloneElement(child as ReactElement<{ id?: string; className?: string; required?: boolean; onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void }>, {
        id: fieldId(name),
        className: `${(child.props as { className?: string }).className ?? ''} ${err ? 'input-field-error' : ''}`.trim(),
        required: true,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
          originalOnChange?.(e);
          if (ctx) clearInvalid(ctx.setInvalid, name);
        },
      })}
    </div>
  );
}

function SaveBar({ saved, onReset }: { saved: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
      {saved && (
        <span className="flex items-center gap-2 text-sm font-bold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> تم حفظ التغييرات بنجاح
        </span>
      )}
      <div className="mr-auto flex gap-2">
        <button type="button" onClick={onReset} className="btn-ghost">استعادة</button>
        <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> حفظ التغييرات</button>
      </div>
    </div>
  );
}
