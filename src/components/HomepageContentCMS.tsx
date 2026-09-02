import { createContext, useContext, useState, Children, cloneElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  Plus, Trash2, Edit3, CheckCircle2, Save, Eye, EyeOff,
  Users, CalendarDays, GraduationCap, HeartHandshake, Target, BookOpen, Sparkles,
  TrendingUp, Award, Crown, UserCog, Megaphone, ShieldCheck, Wallet, Network,
  Star, Zap, Globe, Mail, Phone, MapPin, Clock, FileText,
  Heart, Handshake, type LucideIcon, Settings,
} from 'lucide-react';
import { useApp, type SiteContent } from '../context/AppContext';
import Modal from '../components/Modal';
import { categoryLabels, type EventCategory, type UEvent, type NewsItem, type SiteEditDiff } from '../data/mockData';
import RequiredMark from './RequiredMark';
import ManagedFileField from './ManagedFileField';
import { validateRequired, clearInvalid, isInvalid, fieldId, type InvalidSetter } from '../utils/formValidation';

const iconOptions: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'Users', label: 'أعضاء', Icon: Users },
  { value: 'CalendarDays', label: 'فعاليات', Icon: CalendarDays },
  { value: 'GraduationCap', label: 'جامعات', Icon: GraduationCap },
  { value: 'HeartHandshake', label: 'متطوعون', Icon: HeartHandshake },
  { value: 'Target', label: 'رؤية', Icon: Target },
  { value: 'BookOpen', label: 'تعليم', Icon: BookOpen },
  { value: 'Sparkles', label: 'إبداع', Icon: Sparkles },
  { value: 'TrendingUp', label: 'نمو', Icon: TrendingUp },
  { value: 'Award', label: 'جوائز', Icon: Award },
  { value: 'Crown', label: 'رئاسة', Icon: Crown },
  { value: 'UserCog', label: 'إدارة', Icon: UserCog },
  { value: 'Megaphone', label: 'إعلام', Icon: Megaphone },
  { value: 'ShieldCheck', label: 'رقابة', Icon: ShieldCheck },
  { value: 'Wallet', label: 'مالية', Icon: Wallet },
  { value: 'Network', label: 'شراكات', Icon: Network },
  { value: 'Star', label: 'نجمة', Icon: Star },
  { value: 'Zap', label: 'إنجاز', Icon: Zap },
  { value: 'Globe', label: 'عالمي', Icon: Globe },
  { value: 'Mail', label: 'بريد', Icon: Mail },
  { value: 'Phone', label: 'اتصال', Icon: Phone },
  { value: 'MapPin', label: 'موقع', Icon: MapPin },
  { value: 'CheckCircle2', label: 'اعتماد', Icon: CheckCircle2 },
  { value: 'Clock', label: 'وقت', Icon: Clock },
  { value: 'FileText', label: 'ملف', Icon: FileText },
  { value: 'Eye', label: 'مشاهدة', Icon: Eye },
  { value: 'Heart', label: 'محبة', Icon: Heart },
  { value: 'Handshake', label: 'تعاون', Icon: Handshake },
];

const committeeIdOptions = [
  { value: 'presidency', label: 'الرئاسة' },
  { value: 'vice-presidency', label: 'نائب الرئيس' },
  { value: 'media', label: 'اللجنة الإعلامية' },
  { value: 'academic', label: 'اللجنة الأكاديمية' },
  { value: 'supervisory', label: 'لجنة الرقابة' },
  { value: 'activities', label: 'لجنة الأنشطة' },
  { value: 'finance', label: 'اللجنة المالية' },
];

type SubTab = 'brand' | 'hero' | 'stats' | 'about' | 'events' | 'news' | 'board';

// Success is announced only by AppContext after Supabase confirms the request.
const mediaNotice = () => undefined;

type FlatDiff = {
  label: string;
  path: string;
  oldValue: string;
  newValue: string;
  editable: boolean;
  value: unknown;
};

const HOME_FIELD_LABELS: Record<string, string> = {
  name: 'اسم الاتحاد', nameTr: 'الاسم الإنجليزي', phone: 'الهاتف', email: 'البريد الإلكتروني',
  address: 'العنوان الجغرافي', copyright: 'نص حقوق النشر',
  facebook: 'فيسبوك', twitter: 'تويتر / X', instagram: 'انستغرام', youtube: 'يوتيوب',
  badge: 'نص الشارة', title: 'العنوان', subtitle: 'العنوان الفرعي', description: 'الوصف',
  primaryBtn: 'زر رئيسي', secondaryBtn: 'زر ثانوي', tertiaryBtn: 'زر ثالث', image: 'رابط الصورة',
  value: 'الرقم / القيمة', label: 'الوصف', icon: 'الأيقونة', memberIds: 'الأعضاء الظاهرون',
};

const fieldLabel = (path: string): string => {
  const parts = path.split('.');
  const numIdx = parts.findIndex((p) => !Number.isNaN(Number(p)));
  let prefix = '';
  if (numIdx > 0) {
    const base = parts[numIdx - 1] === 'stats' ? 'إحصائية' : parts[numIdx - 1] === 'features' ? 'كرت' : 'عنصر';
    prefix = `${base} ${Number(parts[numIdx]) + 1} — `;
  }
  return prefix + (HOME_FIELD_LABELS[parts[parts.length - 1]] ?? parts[parts.length - 1]);
};

/** Flattens the changed fields between two section slices into per-field diffs. */
const collectSectionDiffs = (sections: string[], prev: SiteContent, next: SiteContent): FlatDiff[] => {
  const out: FlatDiff[] = [];
  const walk = (path: string, a: unknown, b: unknown) => {
    if (Array.isArray(b)) {
      if (Array.isArray(a) && a.length === b.length) {
        for (let i = 0; i < b.length; i++) walk(`${path}.${i}`, a[i], b[i]);
        return;
      }
      const changed = a === undefined ? true : JSON.stringify(a) !== JSON.stringify(b);
      if (changed) {
        out.push({
          label: fieldLabel(path), path,
          oldValue: a === undefined ? '' : JSON.stringify(a),
          newValue: JSON.stringify(b),
          editable: false,
          value: b,
        });
      }
      return;
    }
    if (b !== null && typeof b === 'object') {
      for (const k of Object.keys(b)) {
        walk(`${path}.${k}`, (a as Record<string, unknown> | undefined)?.[k], (b as Record<string, unknown>)[k]);
      }
      return;
    }
    if (String(a ?? '') === String(b ?? '')) return;
    out.push({ label: fieldLabel(path), path, oldValue: String(a ?? ''), newValue: String(b ?? ''), editable: true, value: b });
  };
  for (const section of sections) {
    walk(section, (prev as unknown as Record<string, unknown>)?.[section], (next as unknown as Record<string, unknown>)[section]);
  }
  return out;
};

const toDiff = (d: FlatDiff): SiteEditDiff => ({
  label: d.label, path: d.path, oldValue: d.oldValue, newValue: d.newValue, editable: d.editable,
});

/** Queues the changed homepage fields of a form tab for MEDIA_HEAD approval. */
const useFormSubmit = () => {
  const { currentUser, submitSiteEdit } = useApp();
  const submitForm = async (
    sectionLabel: string,
    sections: string[],
    prev: SiteContent,
    next: SiteContent,
  ): Promise<{ handled: boolean; confirmed: boolean }> => {
    if (currentUser?.role !== 'MEDIA_HEAD') return { handled: false, confirmed: false };
    const diffs = collectSectionDiffs(sections, prev, next);
    if (diffs.length) {
      for (const d of diffs) {
        const submitted = await submitSiteEdit({
          pageId: 'home', pageLabel: 'الصفحة الرئيسية', sectionLabel,
          target: 'site', op: 'set', path: d.path, fieldValue: d.value,
          diffs: [toDiff(d)],
        });
        if (!submitted) return { handled: true, confirmed: false };
      }
      mediaNotice();
    }
    return { handled: true, confirmed: true };
  };
  return { submitForm };
};

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') return String(JSON.stringify(v));
  return String(v);
};

export default function HomepageContentCMS() {
  const [subTab, setSubTab] = useState<SubTab>('brand');

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'brand', label: 'الشعار والتذييل' },
    { id: 'hero', label: 'القسم الترحيبي' },
    { id: 'stats', label: 'الإحصائيات' },
    { id: 'about', label: 'الرؤية والرسالة' },
    { id: 'events', label: 'الفعاليات' },
    { id: 'news', label: 'الأخبار' },
    { id: 'board', label: 'الهيئة التنفيذية' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-4">
        <Settings className="h-6 w-6 text-gold-600" />
        <div>
          <h2 className="text-lg font-extrabold text-navy-900">إدارة محتوى الصفحة الرئيسية</h2>
          <p className="text-sm text-gray-500">تحكّم في جميع أقسام الصفحة الرئيسية. تظهر التعديلات فورًا على الموقع.</p>
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

      {subTab === 'brand' && <BrandTab />}
      {subTab === 'hero' && <HeroTab />}
      {subTab === 'stats' && <StatsTab />}
      {subTab === 'about' && <AboutTab />}
      {subTab === 'events' && <EventsCMSTab />}
      {subTab === 'news' && <NewsCMSTab />}
      {subTab === 'board' && <BoardPreviewTab />}
    </div>
  );
}

/* ---------- Brand & Footer ---------- */
function BrandTab() {
  const { siteContent, savePublishedSiteTarget } = useApp();
  const { submitForm } = useFormSubmit();
  const [form, setForm] = useState(siteContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validateRequired({
      name: form.brand.name, nameTr: form.brand.nameTr,
      phone: form.footer.phone, email: form.footer.email,
      address: form.footer.address, copyright: form.footer.copyright,
      facebook: form.footer.social.facebook, twitter: form.footer.social.twitter,
      instagram: form.footer.social.instagram, youtube: form.footer.social.youtube,
    }, ['name', 'nameTr', 'phone', 'email', 'address', 'copyright', 'facebook', 'twitter', 'instagram', 'youtube'], setInvalid);
    if (!ok) return;
    const submitted = await submitForm('الشعار والتذييل', ['brand', 'footer'], siteContent, form);
    if (submitted.handled) {
      if (!submitted.confirmed) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    const savedResult = await savePublishedSiteTarget('site', form);
    if (!savedResult.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <FormFields invalid={invalid} setInvalid={setInvalid}>
      <SectionTitle icon={Settings} title="الشعار واسم الاتحاد" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="اسم الاتحاد (عربي)">
          <input className="input-field" value={form.brand.name} onChange={(e) => setForm({ ...form, brand: { ...form.brand, name: e.target.value } })} />
        </Field>
        <Field name="nameTr" label="اسم الاتحاد (إنجليزي)">
          <input className="input-field" value={form.brand.nameTr} onChange={(e) => setForm({ ...form, brand: { ...form.brand, nameTr: e.target.value } })} dir="ltr" />
        </Field>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <SectionTitle icon={Users} title="بيانات التذييل" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="رقم الهاتف">
            <input className="input-field" value={form.footer.phone} onChange={(e) => setForm({ ...form, footer: { ...form.footer, phone: e.target.value } })} dir="ltr" />
          </Field>
          <Field name="email" label="البريد الإلكتروني">
            <input className="input-field" value={form.footer.email} onChange={(e) => setForm({ ...form, footer: { ...form.footer, email: e.target.value } })} dir="ltr" />
          </Field>
        </div>
        <Field name="address" label="العنوان الجغرافي">
          <input className="input-field" value={form.footer.address} onChange={(e) => setForm({ ...form, footer: { ...form.footer, address: e.target.value } })} />
        </Field>
        <Field name="copyright" label="نص حقوق النشر">
          <input className="input-field" value={form.footer.copyright} onChange={(e) => setForm({ ...form, footer: { ...form.footer, copyright: e.target.value } })} />
        </Field>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <SectionTitle icon={Network} title="روابط شبكات التواصل الاجتماعي" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="facebook" label="فيسبوك">
            <input className="input-field" value={form.footer.social.facebook} onChange={(e) => setForm({ ...form, footer: { ...form.footer, social: { ...form.footer.social, facebook: e.target.value } } })} dir="ltr" />
          </Field>
          <Field name="twitter" label="تويتر / X">
            <input className="input-field" value={form.footer.social.twitter} onChange={(e) => setForm({ ...form, footer: { ...form.footer, social: { ...form.footer.social, twitter: e.target.value } } })} dir="ltr" />
          </Field>
          <Field name="instagram" label="انستغرام">
            <input className="input-field" value={form.footer.social.instagram} onChange={(e) => setForm({ ...form, footer: { ...form.footer, social: { ...form.footer.social, instagram: e.target.value } } })} dir="ltr" />
          </Field>
          <Field name="youtube" label="يوتيوب">
            <input className="input-field" value={form.footer.social.youtube} onChange={(e) => setForm({ ...form, footer: { ...form.footer, social: { ...form.footer.social, youtube: e.target.value } } })} dir="ltr" />
          </Field>
        </div>
      </div>

      <SaveBar saved={saved} onReset={() => setForm(siteContent)} />
      </FormFields>
    </form>
  );
}

/* ---------- Hero ---------- */
function HeroTab() {
  const { siteContent, uploadManagedFile, savePublishedSiteTarget } = useApp();
  const { submitForm } = useFormSubmit();
  const [form, setForm] = useState(siteContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validateRequired({
      badge: form.hero.badge, title: form.hero.title, subtitle: form.hero.subtitle,
      description: form.hero.description, primaryBtn: form.hero.primaryBtn,
      secondaryBtn: form.hero.secondaryBtn, tertiaryBtn: form.hero.tertiaryBtn,
      image: form.hero.image, badge1Value: form.hero.badge1.value,
      badge1Label: form.hero.badge1.label, badge1Icon: form.hero.badge1.icon ?? 'Award',
      badge2Value: form.hero.badge2.value, badge2Label: form.hero.badge2.label,
      badge2Icon: form.hero.badge2.icon ?? 'TrendingUp',
    }, ['badge', 'title', 'subtitle', 'description', 'primaryBtn', 'secondaryBtn', 'tertiaryBtn', 'image', 'badge1Value', 'badge1Label', 'badge1Icon', 'badge2Value', 'badge2Label', 'badge2Icon'], setInvalid);
    if (!ok) return;
    const submitted = await submitForm('القسم الترحيبي', ['hero'], siteContent, form);
    if (submitted.handled) {
      if (!submitted.confirmed) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    const savedResult = await savePublishedSiteTarget('site', form);
    if (!savedResult.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const h = form.hero;

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <FormFields invalid={invalid} setInvalid={setInvalid}>
      <SectionTitle icon={Sparkles} title="القسم الترحيبي الرئيسي" />

      <Field name="badge" label="نص الشارة (Badge)">
        <input className="input-field" value={h.badge} onChange={(e) => setForm({ ...form, hero: { ...h, badge: e.target.value } })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="title" label="العنوان الرئيسي">
          <input className="input-field" value={h.title} onChange={(e) => setForm({ ...form, hero: { ...h, title: e.target.value } })} />
        </Field>
        <Field name="subtitle" label="العنوان الفرعي">
          <input className="input-field" value={h.subtitle} onChange={(e) => setForm({ ...form, hero: { ...h, subtitle: e.target.value } })} />
        </Field>
      </div>
      <Field name="description" label="الوصف">
        <textarea rows={3} className="input-field resize-none" value={h.description} onChange={(e) => setForm({ ...form, hero: { ...h, description: e.target.value } })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="primaryBtn" label="زر رئيسي">
          <input className="input-field" value={h.primaryBtn} onChange={(e) => setForm({ ...form, hero: { ...h, primaryBtn: e.target.value } })} />
        </Field>
        <Field name="secondaryBtn" label="زر ثانوي">
          <input className="input-field" value={h.secondaryBtn} onChange={(e) => setForm({ ...form, hero: { ...h, secondaryBtn: e.target.value } })} />
        </Field>
        <Field name="tertiaryBtn" label="زر ثالث">
          <input className="input-field" value={h.tertiaryBtn} onChange={(e) => setForm({ ...form, hero: { ...h, tertiaryBtn: e.target.value } })} />
        </Field>
      </div>
      <ManagedFileField
        usage="site-image"
        label="صورة الواجهة"
        currentUrl={h.image}
        required
        error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الواجهة.' : null}
        onUpload={(file, onProgress) => uploadManagedFile('site-image', file, onProgress)}
        onUploaded={(asset) => {
          setForm((current) => ({ ...current, hero: { ...current.hero, image: asset.publicUrl } }));
          clearInvalid(setInvalid, 'image');
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="mb-3 text-sm font-bold text-navy-900">البادج الأول</div>
          <Field name="badge1Value" label="القيمة">
            <input type="text" className="input-field" value={h.badge1.value} placeholder="مثال: 50+" onChange={(e) => setForm({ ...form, hero: { ...h, badge1: { ...h.badge1, value: e.target.value } } })} />
          </Field>
          <Field name="badge1Label" label="الوصف">
            <input className="input-field" value={h.badge1.label} onChange={(e) => setForm({ ...form, hero: { ...h, badge1: { ...h.badge1, label: e.target.value } } })} />
          </Field>
          <Field name="badge1Icon" label="الأيقونة">
            <select className="input-field" value={h.badge1.icon ?? 'Award'} onChange={(e) => setForm({ ...form, hero: { ...h, badge1: { ...h.badge1, icon: e.target.value } } })}>
              {iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="mb-3 text-sm font-bold text-navy-900">البادج الثاني</div>
          <Field name="badge2Value" label="القيمة">
            <input type="text" className="input-field" value={h.badge2.value} placeholder="مثال: +10%" onChange={(e) => setForm({ ...form, hero: { ...h, badge2: { ...h.badge2, value: e.target.value } } })} />
          </Field>
          <Field name="badge2Label" label="الوصف">
            <input className="input-field" value={h.badge2.label} onChange={(e) => setForm({ ...form, hero: { ...h, badge2: { ...h.badge2, label: e.target.value } } })} />
          </Field>
          <Field name="badge2Icon" label="الأيقونة">
            <select className="input-field" value={h.badge2.icon ?? 'TrendingUp'} onChange={(e) => setForm({ ...form, hero: { ...h, badge2: { ...h.badge2, icon: e.target.value } } })}>
              {iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <SaveBar saved={saved} onReset={() => setForm(siteContent)} />
      </FormFields>
    </form>
  );
}

/* ---------- Stats ---------- */
function StatsTab() {
  const { siteContent, savePublishedSiteTarget } = useApp();
  const { submitForm } = useFormSubmit();
  const [form, setForm] = useState(siteContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.stats.reduce((acc, s, i) => {
      acc[`value_${i}`] = s.value;
      acc[`label_${i}`] = s.label;
      acc[`icon_${i}`] = s.icon;
      return acc;
    }, {} as Record<string, unknown>);
    const fields = form.stats.flatMap((_, i) => [`value_${i}`, `label_${i}`, `icon_${i}`]);
    if (!validateRequired(values, fields, setInvalid)) return;
    const submitted = await submitForm('الإحصائيات', ['stats'], siteContent, form);
    if (submitted.handled) {
      if (!submitted.confirmed) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    const savedResult = await savePublishedSiteTarget('site', form);
    if (!savedResult.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateStat = (idx: number, field: 'value' | 'label' | 'icon', val: string | number) => {
    setForm((prev) => ({
      ...prev,
      stats: prev.stats.map((s, i) => i === idx ? { ...s, [field]: val } : s),
    }));
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <FormFields invalid={invalid} setInvalid={setInvalid}>
      <SectionTitle icon={TrendingUp} title="شريط الإحصائيات الأربعة" />
      <div className="grid gap-4 sm:grid-cols-2">
        {form.stats.map((s, idx) => (
          <div key={idx} className="rounded-xl border border-gray-100 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              {(() => {
                const Icon = iconOptions.find((o) => o.value === s.icon)?.Icon || Users;
                return <Icon className="h-4 w-4" />;
              })()}
              إحصائية {idx + 1}
            </div>
            <div className="space-y-3">
              <Field name={`value_${idx}`} label="الرقم">
                <input type="number" className="input-field" value={s.value} onChange={(e) => updateStat(idx, 'value', Number(e.target.value))} />
              </Field>
              <Field name={`label_${idx}`} label="المسمى">
                <input className="input-field" value={s.label} onChange={(e) => updateStat(idx, 'label', e.target.value)} />
              </Field>
              <Field name={`icon_${idx}`} label="الأيقونة">
                <select className="input-field" value={s.icon} onChange={(e) => updateStat(idx, 'icon', e.target.value)}>
                  {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </div>
        ))}
      </div>
      <SaveBar saved={saved} onReset={() => setForm(siteContent)} />
      </FormFields>
    </form>
  );
}

/* ---------- About ---------- */
function AboutTab() {
  const { siteContent, uploadManagedFile, savePublishedSiteTarget } = useApp();
  const { submitForm } = useFormSubmit();
  const [form, setForm] = useState(siteContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const values: Record<string, unknown> = {
      badge: form.about.badge, title: form.about.title, description: form.about.description,
      image: form.about.image, imgBadgeValue: form.about.imageBadge.value,
      imgBadgeLabel: form.about.imageBadge.label,
    };
    const fields = ['badge', 'title', 'description', 'image', 'imgBadgeValue', 'imgBadgeLabel'];
    form.about.features.forEach((f, i) => {
      values[`feature_${i}_icon`] = f.icon;
      values[`feature_${i}_title`] = f.title;
      values[`feature_${i}_desc`] = f.desc;
      fields.push(`feature_${i}_icon`, `feature_${i}_title`, `feature_${i}_desc`);
    });
    if (!validateRequired(values, fields, setInvalid)) return;
    const submitted = await submitForm('الرؤية والرسالة', ['about'], siteContent, form);
    if (submitted.handled) {
      if (!submitted.confirmed) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    const savedResult = await savePublishedSiteTarget('site', form);
    if (!savedResult.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const a = form.about;
  const updateFeature = (idx: number, field: 'icon' | 'title' | 'desc', val: string) => {
    setForm((prev) => ({
      ...prev,
      about: { ...prev.about, features: prev.about.features.map((f, i) => i === idx ? { ...f, [field]: val } : f) },
    }));
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <FormFields invalid={invalid} setInvalid={setInvalid}>
      <SectionTitle icon={Target} title="قسم الرؤية والرسالة" />

      <Field name="badge" label="شارة القسم">
        <input className="input-field" value={a.badge} onChange={(e) => setForm({ ...form, about: { ...a, badge: e.target.value } })} />
      </Field>
      <Field name="title" label="عنوان الفقرة">
        <input className="input-field" value={a.title} onChange={(e) => setForm({ ...form, about: { ...a, title: e.target.value } })} />
      </Field>
      <Field name="description" label="نص الرسالة">
        <textarea rows={4} className="input-field resize-none" value={a.description} onChange={(e) => setForm({ ...form, about: { ...a, description: e.target.value } })} />
      </Field>
      <ManagedFileField
        usage="site-image"
        label="الصورة المرفقة"
        currentUrl={a.image}
        required
        error={isInvalid(invalid, 'image') ? 'يرجى رفع الصورة المرفقة.' : null}
        onUpload={(file, onProgress) => uploadManagedFile('site-image', file, onProgress)}
        onUploaded={(asset) => {
          setForm((current) => ({ ...current, about: { ...current.about, image: asset.publicUrl } }));
          clearInvalid(setInvalid, 'image');
        }}
      />

      <div className="rounded-xl border border-gray-100 p-4">
        <div className="mb-3 text-sm font-bold text-navy-900">بادج الصورة</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="imgBadgeValue" label="القيمة">
            <input className="input-field" value={a.imageBadge.value} onChange={(e) => setForm({ ...form, about: { ...a, imageBadge: { ...a.imageBadge, value: e.target.value } } })} />
          </Field>
          <Field name="imgBadgeLabel" label="الوصف">
            <input className="input-field" value={a.imageBadge.label} onChange={(e) => setForm({ ...form, about: { ...a, imageBadge: { ...a.imageBadge, label: e.target.value } } })} />
          </Field>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 text-sm font-bold text-navy-900">الكروت الأربعة</div>
        <div className="grid gap-4 sm:grid-cols-2">
          {a.features.map((f, idx) => (
            <div key={idx} className="rounded-xl border border-gray-100 p-4">
              <div className="mb-3 text-xs font-bold text-gray-400">كرت {idx + 1}</div>
              <div className="space-y-3">
                <Field name={`feature_${idx}_icon`} label="الأيقونة">
                  <select className="input-field" value={f.icon} onChange={(e) => updateFeature(idx, 'icon', e.target.value)}>
                    {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field name={`feature_${idx}_title`} label="العنوان">
                  <input className="input-field" value={f.title} onChange={(e) => updateFeature(idx, 'title', e.target.value)} />
                </Field>
                <Field name={`feature_${idx}_desc`} label="الوصف">
                  <input className="input-field" value={f.desc} onChange={(e) => updateFeature(idx, 'desc', e.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SaveBar saved={saved} onReset={() => setForm(siteContent)} />
      </FormFields>
    </form>
  );
}

/* ---------- Events CMS ---------- */
function EventsCMSTab() {
  const { events, setEvents, currentUser, submitSiteEdit, uploadManagedFile } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', category: '' as EventCategory, date: '', time: '16:00',
    location: '', description: '', capacity: 50, status: 'upcoming' as 'upcoming' | 'past',
    image: '', showOnHomepage: true,
  });

  const eventDiffs = (op: 'add' | 'update' | 'delete', current: UEvent | null, next: UEvent): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف الفعالية', oldValue: current.title, newValue: 'سيتم حذف هذه الفعالية من البرامج', editable: false }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['العنوان', 'title', current?.title, next.title, true],
      ['الفئة', 'category', current?.category ?? '', next.category, false],
      ['التاريخ', 'date', current?.date ?? '', next.date, false],
      ['المكان', 'location', current?.location ?? '', next.location ?? '', true],
      ['الوصف', 'description', current?.description ?? '', next.description ?? '', true],
      ['عدد المقاعد', 'capacity', current?.capacity ?? '', next.capacity, true],
      ['عدد المسجلين', 'registered', current?.registered ?? '', next.registered, true],
      ['العرض في الرئيسية', 'showOnHomepage', current ? (current.showOnHomepage ? 'نعم' : 'لا') : '', next.showOnHomepage ? 'نعم' : 'لا', false],
      ['رابط الصورة', 'image', current?.image ?? '', next.image ?? '', true],
      ['الحالة', 'status', current?.status ?? '', next.status, false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (fmtVal(oldV) === fmtVal(newV)) continue;
      diffs.push({ label, path, oldValue: fmtVal(oldV), newValue: fmtVal(newV), editable });
    }
    return diffs;
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ title: '', category: '' as EventCategory, date: '', time: '16:00', location: '', description: '', capacity: 50, status: 'upcoming', image: '', showOnHomepage: true });
    setModalOpen(true);
  };

  const openEdit = (e: UEvent) => {
    setEditId(e.id);
    const d = new Date(e.date);
    setForm({
      title: e.title, category: e.category, date: e.date.slice(0, 10), time: d.toTimeString().slice(0, 5),
      location: e.location, description: e.description, capacity: e.capacity, status: e.status,
      image: e.image, showOnHomepage: e.showOnHomepage ?? false,
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validateRequired(form, ['title', 'category', 'date', 'time', 'location', 'description', 'image'], setInvalid);
    const capacityOk = form.capacity > 0;
    if (!capacityOk) setInvalid((p) => (p.includes('capacity') ? p : [...p, 'capacity']));
    if (!ok || !capacityOk) return;
    const iso = new Date(`${form.date}T${form.time}`).toISOString();
    const image = form.image;
    if (editId) {
      const current = events.find((ev) => ev.id === editId);
      const next: UEvent = {
        ...current!,
        title: form.title, category: form.category, date: iso, location: form.location,
        description: form.description, capacity: Number(form.capacity), status: form.status,
        image, showOnHomepage: form.showOnHomepage,
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = eventDiffs('update', current ?? null, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'home', pageLabel: 'الفعاليات', sectionLabel: next.title,
            target: 'events', op: 'update', recordId: editId, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setModalOpen(false);
        return;
      }
      setEvents((prev) => prev.map((ev) => ev.id === editId ? next : ev));
    } else {
      const newEvent: UEvent = {
        id: 'e' + Date.now(), title: form.title, category: form.category, date: iso,
        location: form.location, description: form.description, status: form.status,
        capacity: Number(form.capacity), registered: 0, image, showOnHomepage: form.showOnHomepage,
        createdByRole: currentUser?.role,
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = eventDiffs('add', null, newEvent);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'home', pageLabel: 'الفعاليات', sectionLabel: newEvent.title,
            target: 'events', op: 'add', recordValue: newEvent, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setModalOpen(false);
        return;
      }
      setEvents((prev) => [newEvent, ...prev]);
    }
    setModalOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفعالية؟')) return;
    const current = events.find((e) => e.id === id);
    if (!current) return;
    if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'home', pageLabel: 'الفعاليات', sectionLabel: current.title,
        target: 'events', op: 'delete', recordId: id, recordValue: current,
        diffs: eventDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleHomepage = async (id: string) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    const next: UEvent = { ...current, showOnHomepage: !current.showOnHomepage };
    if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'home', pageLabel: 'الفعاليات', sectionLabel: next.title,
        target: 'events', op: 'update', recordId: id, recordValue: next,
        diffs: [{
          label: 'العرض في الرئيسية', path: 'showOnHomepage',
          oldValue: current.showOnHomepage ? 'نعم' : 'لا',
          newValue: next.showOnHomepage ? 'نعم' : 'لا',
          editable: false,
        }],
      });
      mediaNotice();
      return;
    }
    setEvents((prev) => prev.map((e) => e.id === id ? next : e));
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle icon={CalendarDays} title="إدارة الفعاليات" />
        <button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> فعالية جديدة</button>
      </div>

      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.id} className="card flex items-center gap-3 p-3">
            <img src={e.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-navy-900">{e.title}</div>
              <div className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('ar-EG')} · {e.location}</div>
            </div>
            <button
              onClick={() => toggleHomepage(e.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                e.showOnHomepage ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="عرض في الصفحة الرئيسية"
            >
              {e.showOnHomepage ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {e.showOnHomepage ? 'ظاهر' : 'مخفي'}
            </button>
            <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 hover:bg-navy-50"><Edit3 className="h-4 w-4" /></button>
            <button onClick={() => remove(e.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل فعالية' : 'إضافة فعالية'} maxWidth="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <FormFields invalid={invalid} setInvalid={setInvalid}>
          <Field name="title" label="عنوان الفعالية">
            <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="category" label="التصنيف">
              <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}>
                <option value="">اختر التصنيف...</option>
                {(Object.keys(categoryLabels) as EventCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
              </select>
            </Field>
            <Field name="capacity" label="السعة">
              <input type="number" className="input-field" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="date" label="التاريخ">
              <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field name="time" label="الوقت">
              <input type="time" className="input-field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          </div>
          <Field name="location" label="المكان">
            <input className="input-field" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field name="description" label="الوصف">
            <textarea rows={2} className="input-field resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <ManagedFileField
            usage="event-image"
            label="صورة الفعالية"
            currentUrl={form.image}
            required
            error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الفعالية.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('event-image', file, onProgress)}
            onUploaded={(asset) => {
              setForm((current) => ({ ...current, image: asset.publicUrl }));
              clearInvalid(setInvalid, 'image');
            }}
          />
          </FormFields>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.showOnHomepage} onChange={(e) => setForm({ ...form, showOnHomepage: e.target.checked })} className="h-4 w-4 accent-navy-700" />
            <span className="text-sm font-semibold text-navy-900">عرض في الصفحة الرئيسية</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editId ? 'حفظ' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ---------- News CMS ---------- */
function NewsCMSTab() {
  const { news, setNews, currentUser, submitSiteEdit, uploadManagedFile } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', category: '', date: new Date().toISOString().slice(0, 10),
    excerpt: '', fullContent: '', image: '', pinnedOnHomepage: true,
  });

  const newsDiffs = (op: 'add' | 'update' | 'delete', current: NewsItem | null, next: NewsItem): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف الخبر', oldValue: current.title, newValue: 'سيتم حذف هذا الخبر', editable: false }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['عنوان الخبر', 'title', current?.title, next.title, true],
      ['التصنيف', 'category', current?.category ?? '', next.category, false],
      ['التاريخ', 'date', current?.date ?? '', next.date, false],
      ['الملخص', 'excerpt', current?.excerpt ?? '', next.excerpt ?? '', true],
      ['النص الكامل', 'fullContent', current?.fullContent ?? '', next.fullContent ?? '', true],
      ['التثبيت في الرئيسية', 'pinnedOnHomepage', current ? (current.pinnedOnHomepage ? 'نعم' : 'لا') : '', next.pinnedOnHomepage ? 'نعم' : 'لا', false],
      ['رابط الصورة', 'image', current?.image ?? '', next.image ?? '', true],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (fmtVal(oldV) === fmtVal(newV)) continue;
      diffs.push({ label, path, oldValue: fmtVal(oldV), newValue: fmtVal(newV), editable });
    }
    return diffs;
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ title: '', category: '', date: new Date().toISOString().slice(0, 10), excerpt: '', fullContent: '', image: '', pinnedOnHomepage: true });
    setModalOpen(true);
  };

  const openEdit = (n: NewsItem) => {
    setEditId(n.id);
    setForm({ title: n.title, category: n.category, date: n.date, excerpt: n.excerpt, fullContent: n.fullContent || '', image: n.image, pinnedOnHomepage: n.pinnedOnHomepage ?? false });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(form, ['title', 'category', 'date', 'excerpt', 'fullContent', 'image'], setInvalid)) return;
    const image = form.image;
    if (editId) {
      const current = news.find((n) => n.id === editId);
      const next: NewsItem = {
        ...current!,
        title: form.title, category: form.category, date: form.date, excerpt: form.excerpt,
        fullContent: form.fullContent, image, pinnedOnHomepage: form.pinnedOnHomepage,
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = newsDiffs('update', current ?? null, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'home', pageLabel: 'الأخبار', sectionLabel: next.title,
            target: 'news', op: 'update', recordId: editId, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setModalOpen(false);
        return;
      }
      setNews((prev) => prev.map((n) => n.id === editId ? next : n));
    } else {
      const newNews: NewsItem = {
        id: 'n' + Date.now(), title: form.title, category: form.category, date: form.date,
        excerpt: form.excerpt, fullContent: form.fullContent, image, pinnedOnHomepage: form.pinnedOnHomepage,
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = newsDiffs('add', null, newNews);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'home', pageLabel: 'الأخبار', sectionLabel: newNews.title,
            target: 'news', op: 'add', recordValue: newNews, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setModalOpen(false);
        return;
      }
      setNews((prev) => [newNews, ...prev]);
    }
    setModalOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الخبر؟')) return;
    const current = news.find((n) => n.id === id);
    if (!current) return;
    if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'home', pageLabel: 'الأخبار', sectionLabel: current.title,
        target: 'news', op: 'delete', recordId: id, recordValue: current,
        diffs: newsDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    setNews((prev) => prev.filter((n) => n.id !== id));
  };

  const togglePin = async (id: string) => {
    const current = news.find((n) => n.id === id);
    if (!current) return;
    const next: NewsItem = { ...current, pinnedOnHomepage: !current.pinnedOnHomepage };
    if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'home', pageLabel: 'الأخبار', sectionLabel: next.title,
        target: 'news', op: 'update', recordId: id, recordValue: next,
        diffs: [{
          label: 'التثبيت في الرئيسية', path: 'pinnedOnHomepage',
          oldValue: current.pinnedOnHomepage ? 'نعم' : 'لا',
          newValue: next.pinnedOnHomepage ? 'نعم' : 'لا',
          editable: false,
        }],
      });
      mediaNotice();
      return;
    }
    setNews((prev) => prev.map((n) => n.id === id ? next : n));
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle icon={Megaphone} title="إدارة الأخبار" />
        <button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> خبر جديد</button>
      </div>

      <div className="space-y-2">
        {news.map((n) => (
          <div key={n.id} className="card flex items-center gap-3 p-3">
            <img src={n.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-navy-900">{n.title}</div>
              <div className="text-xs text-gray-500">{n.date} · {n.category}</div>
            </div>
            <button
              onClick={() => togglePin(n.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                n.pinnedOnHomepage ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="تثبيت في الصفحة الرئيسية"
            >
              {n.pinnedOnHomepage ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {n.pinnedOnHomepage ? 'مثبت' : 'غير مثبت'}
            </button>
            <button onClick={() => openEdit(n)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 hover:bg-navy-50"><Edit3 className="h-4 w-4" /></button>
            <button onClick={() => remove(n.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل خبر' : 'إضافة خبر'} maxWidth="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <FormFields invalid={invalid} setInvalid={setInvalid}>
          <Field name="title" label="عنوان الخبر">
            <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="category" label="التصنيف">
              <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">اختر التصنيف...</option>
                <option value="إنجازات">إنجازات</option>
                <option value="إعلانات">إعلانات</option>
                <option value="شراكات">شراكات</option>
              </select>
            </Field>
            <Field name="date" label="التاريخ">
              <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          <Field name="excerpt" label="ملخص الخبر">
            <textarea rows={2} className="input-field resize-none" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          </Field>
          <Field name="fullContent" label="النص الكامل">
            <textarea rows={4} className="input-field resize-none" value={form.fullContent} onChange={(e) => setForm({ ...form, fullContent: e.target.value })} />
          </Field>
          <ManagedFileField
            usage="news-image"
            label="صورة الخبر"
            currentUrl={form.image}
            required
            error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الخبر.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('news-image', file, onProgress)}
            onUploaded={(asset) => {
              setForm((current) => ({ ...current, image: asset.publicUrl }));
              clearInvalid(setInvalid, 'image');
            }}
          />
          </FormFields>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.pinnedOnHomepage} onChange={(e) => setForm({ ...form, pinnedOnHomepage: e.target.checked })} className="h-4 w-4 accent-navy-700" />
            <span className="text-sm font-semibold text-navy-900">تثبيت في الصفحة الرئيسية</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editId ? 'حفظ' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ---------- Board Preview ---------- */
function BoardPreviewTab() {
  const { siteContent, savePublishedSiteTarget } = useApp();
  const { submitForm } = useFormSubmit();
  const [form, setForm] = useState(siteContent);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validateRequired({
      title: form.boardPreview.title, subtitle: form.boardPreview.subtitle,
      description: form.boardPreview.description, memberIds: form.boardPreview.memberIds,
    }, ['title', 'subtitle', 'description', 'memberIds'], setInvalid);
    if (!ok) return;
    const submitted = await submitForm('الهيئة التنفيذية', ['boardPreview'], siteContent, form);
    if (submitted.handled) {
      if (!submitted.confirmed) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    const savedResult = await savePublishedSiteTarget('site', form);
    if (!savedResult.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const b = form.boardPreview;
  const toggleMember = (id: string) => {
    clearInvalid(setInvalid, 'memberIds');
    setForm((prev) => ({
      ...prev,
      boardPreview: {
        ...prev.boardPreview,
        memberIds: prev.boardPreview.memberIds.includes(id)
          ? prev.boardPreview.memberIds.filter((m) => m !== id)
          : [...prev.boardPreview.memberIds, id],
      },
    }));
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <FormFields invalid={invalid} setInvalid={setInvalid}>
      <SectionTitle icon={Crown} title="معاينة الهيئة التنفيذية" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="title" label="عنوان القسم">
          <input className="input-field" value={b.title} onChange={(e) => setForm({ ...form, boardPreview: { ...b, title: e.target.value } })} />
        </Field>
        <Field name="subtitle" label="العنوان الفرعي">
          <input className="input-field" value={b.subtitle} onChange={(e) => setForm({ ...form, boardPreview: { ...b, subtitle: e.target.value } })} />
        </Field>
        <Field name="description" label="الوصف">
          <input className="input-field" value={b.description} onChange={(e) => setForm({ ...form, boardPreview: { ...b, description: e.target.value } })} />
        </Field>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 text-sm font-bold text-navy-900">الأعضاء الظاهرون في الصفحة الرئيسية <RequiredMark /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {committeeIdOptions.map((opt) => {
            const checked = b.memberIds.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  checked ? 'border-navy-300 bg-navy-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMember(opt.value)}
                  className="h-4 w-4 accent-navy-700"
                />
                <span className="text-sm font-semibold text-navy-900">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <SaveBar saved={saved} onReset={() => setForm(siteContent)} />
      </FormFields>
    </form>
  );
}

/* ---------- Shared UI ---------- */
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
