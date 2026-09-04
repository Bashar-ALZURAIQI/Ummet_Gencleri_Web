import { useState } from 'react';
import {
  BookOpen, Home, Bus, Library, GraduationCap, MapPin, Phone, Clock,
  ExternalLink, ChevronLeft, Info, Plus, Edit3, Trash2, Save, X,
  Phone as PhoneIcon, Link as LinkIcon, UtensilsCrossed,
  HeartPulse, ShoppingCart, Wallet, FileText, Building2, Car, Wifi,
  Coffee, Pill, BookMarked, Briefcase, Landmark, Mail, MessageCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';
import SiteEditBanner from '../components/SiteEditBanner';
import RequiredMark from '../components/RequiredMark';
import GuideSuggestionCallout from '../components/GuideSuggestionCallout';
import { validateChecks, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { validateGuideContact, validateGuideItem, validateGuideSection } from '../domain/cmsValidation';
import type { GuideSectionData, GuideItem, GuideContact, SiteEditDiff } from '../data/mockData';

const iconMap: Record<string, typeof BookOpen> = {
  BookOpen, Home, Bus, Library, GraduationCap, MapPin, Phone, Clock,
  ExternalLink, Info, UtensilsCrossed, HeartPulse, ShoppingCart, Wallet,
  FileText, Building2, Car, Wifi, Coffee, Pill, BookMarked, Briefcase,
  Landmark, Mail, MessageCircle,
};

const iconNames = Object.keys(iconMap);

const colorOptions = [
  { color: 'text-navy-700', bg: 'bg-navy-100' },
  { color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { color: 'text-sky-700', bg: 'bg-sky-100' },
  { color: 'text-gold-700', bg: 'bg-gold-100' },
  { color: 'text-rose-700', bg: 'bg-rose-100' },
  { color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
  { color: 'text-teal-700', bg: 'bg-teal-100' },
  { color: 'text-orange-700', bg: 'bg-orange-100' },
];

export default function StudentGuide() {
  const { t } = useTranslation();
  const { currentUser, guideSections, guideQuickInfo, submitSiteEdit, savePublishedSiteTarget } = useApp();
  const [activeSectionId, setActiveSectionId] = useState(guideSections[0]?.id ?? '');
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<GuideSectionData | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GuideItem | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<GuideContact | null>(null);
  const [quickInfo, setQuickInfo] = useState(guideQuickInfo);
  const [editingQuickInfo, setEditingQuickInfo] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const isPresidentOrMedia =
    currentUser &&
    (currentUser.role === 'PRESIDENT' || currentUser.role === 'MEDIA_HEAD');

  const activeSection = guideSections.find((s) => s.id === activeSectionId) ?? guideSections[0];

  // Section form state
  const [sectionForm, setSectionForm] = useState({
    label: '', icon: 'BookOpen', color: 'text-navy-700', bg: 'bg-navy-100',
    title: '', intro: '',
  });

  // Item form state
  const [itemForm, setItemForm] = useState({
    heading: '', body: '', tips: [''],
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    label: '', value: '', type: 'phone' as 'phone' | 'link',
  });

  const openAddSection = () => {
    setEditingSection(null);
    setSectionForm({ label: '', icon: 'BookOpen', color: 'text-navy-700', bg: 'bg-navy-100', title: '', intro: '' });
    setSectionModalOpen(true);
  };

  const openEditSection = (s: GuideSectionData) => {
    setEditingSection(s);
    setSectionForm({ label: s.label, icon: s.icon, color: s.color, bg: s.bg, title: s.title, intro: s.intro });
    setSectionModalOpen(true);
  };

  const mediaNotice = () => undefined;

  const sectionDiffs = (op: 'add' | 'update' | 'delete', current: GuideSectionData | null, next: GuideSectionData): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف القسم', oldValue: current.title, newValue: 'سيتم حذف القسم بكامل محتوياته' }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['اسم القسم', 'label', current?.label, next.label, true],
      ['العنوان الرئيسي', 'title', current?.title ?? '', next.title ?? '', true],
      ['النص التعريفي', 'intro', current?.intro ?? '', next.intro ?? '', true],
      ['الأيقونة', 'icon', current?.icon, next.icon, false],
      ['اللون', 'color', current?.color, next.color, false],
      ['الخلفية', 'bg', current?.bg, next.bg, false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (String(oldV ?? '') === String(newV ?? '')) continue;
      diffs.push({ label, path, oldValue: String(oldV ?? ''), newValue: String(newV ?? ''), editable });
    }
    return diffs;
  };

  const itemDiffs = (current: GuideItem | null, next: GuideItem): SiteEditDiff[] => {
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['عنوان المعلومة', 'heading', current?.heading, next.heading, true],
      ['الوصف الرئيسي', 'body', current?.body ?? '', next.body ?? '', true],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (String(oldV ?? '') === String(newV ?? '')) continue;
      diffs.push({ label, path, oldValue: String(oldV ?? ''), newValue: String(newV ?? ''), editable });
    }
    if ((current?.tips ?? []).join(' • ') !== next.tips.join(' • ')) {
      diffs.push({ label: 'النقاط الفرعية', path: 'tips', oldValue: JSON.stringify(current?.tips ?? []), newValue: JSON.stringify(next.tips), editable: false });
    }
    return diffs;
  };

  const contactDiffs = (current: GuideContact | null, next: GuideContact): SiteEditDiff[] => {
    const rows: [string, string, string, string, boolean][] = [
      ['الاسم', 'label', current?.label ?? '', next.label, true],
      ['القيمة', 'value', current?.value ?? '', next.value, true],
      ['النوع', 'type', current?.type ?? '', next.type, false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (oldV === newV) continue;
      diffs.push({ label, path, oldValue: oldV, newValue: newV, editable });
    }
    return diffs;
  };

  const saveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideSection(sectionForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!sectionForm.label.trim()) return;
    if (editingSection) {
      const next: GuideSectionData = { ...editingSection, ...sectionForm };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = sectionDiffs('update', editingSection, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: next.label,
            target: 'guideSections', op: 'update', recordId: editingSection.id, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setSectionModalOpen(false);
        return;
      }
      const saved = await savePublishedSiteTarget(
        'guideSections',
        guideSections.map((s) => s.id === editingSection.id ? next : s),
      );
      if (!saved.ok) { alert(saved.error); return; }
    } else {
      const newSection: GuideSectionData = {
        id: 'sec' + Date.now(), ...sectionForm, items: [], contacts: [],
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = sectionDiffs('add', null, newSection);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: newSection.label,
            target: 'guideSections', op: 'add', recordValue: newSection, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setSectionModalOpen(false);
        return;
      }
      const saved = await savePublishedSiteTarget('guideSections', [...guideSections, newSection]);
      if (!saved.ok) { alert(saved.error); return; }
      setActiveSectionId(newSection.id);
    }
    setSectionModalOpen(false);
  };

  const deleteSection = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القسم بكامل محتوياته؟')) return;
    const current = guideSections.find((s) => s.id === id);
    if (currentUser?.role === 'MEDIA_HEAD' && current) {
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: current.label,
        target: 'guideSections', op: 'delete', recordId: id, recordValue: current,
        diffs: sectionDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    const remaining = guideSections.filter((s) => s.id !== id);
    const saved = await savePublishedSiteTarget('guideSections', remaining);
    if (!saved.ok) { alert(saved.error); return; }
    if (activeSectionId === id) {
      setActiveSectionId(remaining[0]?.id ?? '');
    }
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({ heading: '', body: '', tips: [''] });
    setItemModalOpen(true);
  };

  const openEditItem = (item: GuideItem) => {
    setEditingItem(item);
    setItemForm({ heading: item.heading, body: item.body, tips: item.tips.length ? [...item.tips] : [''] });
    setItemModalOpen(true);
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideItem(itemForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!itemForm.heading.trim()) return;
    const tips = itemForm.tips.filter((t) => t.trim());
    if (currentUser?.role === 'MEDIA_HEAD') {
      const section = guideSections.find((s) => s.id === activeSectionId);
      if (!section) return;
      const itemId = editingItem?.id ?? 'item' + Date.now();
      const nextItem: GuideItem = { id: itemId, heading: itemForm.heading, body: itemForm.body, tips };
      const next: GuideSectionData = editingItem
        ? { ...section, items: section.items.map((it) => it.id === editingItem.id ? nextItem : it) }
        : { ...section, items: [...section.items, nextItem] };
      const diffs = itemDiffs(editingItem, nextItem);
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
          target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
          nested: { parentField: 'items', itemId },
          diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setItemModalOpen(false);
      return;
    }
    let nextSections: GuideSectionData[];
    if (editingItem) {
      nextSections = guideSections.map((s) => s.id === activeSectionId ? {
        ...s, items: s.items.map((it) => it.id === editingItem.id ? { ...it, heading: itemForm.heading, body: itemForm.body, tips } : it),
      } : s);
    } else {
      const newItem: GuideItem = { id: 'item' + Date.now(), heading: itemForm.heading, body: itemForm.body, tips };
      nextSections = guideSections.map((s) => s.id === activeSectionId ? { ...s, items: [...s.items, newItem] } : s);
    }
    const saved = await savePublishedSiteTarget('guideSections', nextSections);
    if (!saved.ok) { alert(saved.error); return; }
    setItemModalOpen(false);
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المعلومة؟')) return;
    const section = guideSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const item = section.items.find((it) => it.id === itemId);
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, items: section.items.filter((it) => it.id !== itemId) };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        nested: { parentField: 'items', itemId, remove: true },
        diffs: [{ label: 'حذف معلومة', oldValue: item?.heading ?? '—', newValue: 'سيتم حذف هذه المعلومة', editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      guideSections.map((s) => s.id === activeSectionId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const moveItem = async (itemId: string, dir: -1 | 1) => {
    const section = guideSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const items = [...section.items];
    const idx = items.findIndex((it) => it.id === itemId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, items };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        diffs: [{ label: 'إعادة ترتيب المعلومات', path: 'items', oldValue: JSON.stringify(section.items), newValue: JSON.stringify(items), editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      guideSections.map((s) => s.id === activeSectionId ? { ...s, items } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ label: '', value: '', type: 'phone' });
    setContactModalOpen(true);
  };

  const openEditContact = (c: GuideContact) => {
    setEditingContact(c);
    setContactForm({ label: c.label, value: c.value, type: c.type });
    setContactModalOpen(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideContact(contactForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!contactForm.label.trim() || !contactForm.value.trim()) return;
    if (currentUser?.role === 'MEDIA_HEAD') {
      const section = guideSections.find((s) => s.id === activeSectionId);
      if (!section) return;
      const contactId = editingContact?.id ?? 'ct' + Date.now();
      const nextContact: GuideContact = { id: contactId, ...contactForm };
      const next: GuideSectionData = editingContact
        ? { ...section, contacts: section.contacts.map((c) => c.id === editingContact.id ? nextContact : c) }
        : { ...section, contacts: [...section.contacts, nextContact] };
      const diffs = contactDiffs(editingContact, nextContact);
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
          target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
          nested: { parentField: 'contacts', itemId: contactId },
          diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setContactModalOpen(false);
      return;
    }
    let nextSections: GuideSectionData[];
    if (editingContact) {
      nextSections = guideSections.map((s) => s.id === activeSectionId ? {
        ...s, contacts: s.contacts.map((c) => c.id === editingContact.id ? { ...c, ...contactForm } : c),
      } : s);
    } else {
      const newContact: GuideContact = { id: 'ct' + Date.now(), ...contactForm };
      nextSections = guideSections.map((s) => s.id === activeSectionId ? { ...s, contacts: [...s.contacts, newContact] } : s);
    }
    const saved = await savePublishedSiteTarget('guideSections', nextSections);
    if (!saved.ok) { alert(saved.error); return; }
    setContactModalOpen(false);
  };

  const deleteContact = async (contactId: string) => {
    const section = guideSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const c = section.contacts.find((ct) => ct.id === contactId);
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, contacts: section.contacts.filter((ct) => ct.id !== contactId) };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        nested: { parentField: 'contacts', itemId: contactId, remove: true },
        diffs: [{ label: 'حذف جهة اتصال', oldValue: c?.label ?? '—', newValue: 'سيتم حذف جهة الاتصال هذه', editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      guideSections.map((s) => s.id === activeSectionId ? { ...s, contacts: s.contacts.filter((contact) => contact.id !== contactId) } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const saveQuickInfo = async () => {
    if (!quickInfo.trim()) {
      setInvalid(['quickInfo']);
      const el = document.getElementById(fieldId('quickInfo'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      alert('يرجى تعبئة كافة الحقول المطلوبة قبل الحفظ');
      return;
    }
    if (currentUser?.role === 'MEDIA_HEAD') {
      if (quickInfo !== guideQuickInfo) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: 'المعلومة السريعة',
          target: 'guideQuickInfo', op: 'update', recordId: 'quick', recordValue: quickInfo,
          diffs: [{ label: 'المعلومة السريعة', path: 'value', oldValue: guideQuickInfo, newValue: quickInfo }],
        });
        if (!submitted) return;
        mediaNotice();
      }
      setEditingQuickInfo(false);
      return;
    }
    const saved = await savePublishedSiteTarget('guideQuickInfo', quickInfo);
    if (!saved.ok) { alert(saved.error); return; }
    setEditingQuickInfo(false);
  };

  const ActiveIcon = activeSection ? iconMap[activeSection.icon] ?? BookOpen : BookOpen;

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50 to-gray-50 pt-20 lg:pt-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-l from-navy-900 to-navy-950 py-16">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url(https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/3a3b4fe6-66cd-4514-94c1-747963cf0a63.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="container-app relative">
          <div className="flex items-center gap-3 text-gold-400">
            <BookOpen className="h-6 w-6" />
            <span className="text-sm font-bold tracking-wide">{t('guide.badge')}</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{t('guide.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            {t('guide.description')}
          </p>
        </div>
      </div>

      <div className="container-app py-10">
        <SiteEditBanner pageId="guide" />
        <GuideSuggestionCallout />
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden p-2">
              <nav className="space-y-1">
                {guideSections.map((section) => {
                  const Icon = iconMap[section.icon] ?? BookOpen;
                  return (
                    <div key={section.id} className="group relative">
                      <button
                        onClick={() => setActiveSectionId(section.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                          activeSectionId === section.id
                            ? 'bg-navy-800 text-white shadow'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeSectionId === section.id ? 'bg-white/20' : section.bg}`}>
                          <Icon className={`h-4 w-4 ${activeSectionId === section.id ? 'text-white' : section.color}`} />
                        </div>
                        {section.label}
                        {activeSectionId === section.id && <ChevronLeft className="mr-auto h-4 w-4" />}
                      </button>
                      {isPresidentOrMedia && (
                        <div className="absolute left-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditSection(section); }}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-navy-700 shadow-sm hover:bg-white"
                            title="تعديل القسم"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-rose-600 shadow-sm hover:bg-white"
                            title="حذف القسم"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              {isPresidentOrMedia && (
                <button
                  onClick={openAddSection}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-navy-300 px-4 py-2.5 text-xs font-bold text-navy-600 transition-colors hover:bg-navy-50"
                >
                  <Plus className="h-4 w-4" /> {t('guide.addSection')}
                </button>
              )}
            </div>
            {/* Quick info card */}
            <div className="mt-4 card bg-gradient-to-br from-navy-50 to-gold-50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-navy-900">
                  <Info className="h-5 w-5" />
                  <span className="text-sm font-bold">{t('guide.quickInfo')}</span>
                </div>
                {isPresidentOrMedia && !editingQuickInfo && (
                  <button
                    onClick={() => setEditingQuickInfo(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 text-navy-600 hover:bg-white"
                    title={t('common.edit')}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingQuickInfo ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    id={fieldId('quickInfo')}
                    rows={3}
                    className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-xs leading-relaxed text-gray-700 focus:border-navy-400 focus:outline-none ${isInvalid(invalid, 'quickInfo')}`}
                    value={quickInfo}
                    onChange={(e) => { setQuickInfo(e.target.value); clearInvalid(setInvalid, 'quickInfo'); }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveQuickInfo}
                      className="inline-flex items-center gap-1 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-800"
                    >
                      <Save className="h-3 w-3" /> {t('common.save')}
                    </button>
                    <button
                      onClick={() => { setEditingQuickInfo(false); setQuickInfo(guideQuickInfo); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      <X className="h-3 w-3" /> {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-gray-600">{guideQuickInfo}</p>
              )}
            </div>
          </aside>

          {/* Content */}
          <div className="space-y-6">
            {/* Section header */}
            <div className="card overflow-hidden">
              <div className={`flex items-center gap-4 ${activeSection.bg} p-6`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow ${activeSection.color}`}>
                  <ActiveIcon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-navy-900">{activeSection.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{activeSection.intro}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            {activeSection.items.map((item, idx) => (
              <div key={item.id} className="card group relative p-6">
                {isPresidentOrMedia && (
                  <div className="absolute left-4 top-4 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => moveItem(item.id, -1)}
                      disabled={idx === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                      title="تحريك لأعلى"
                    >
                      <ChevronLeft className="h-4 w-4 rotate-90" />
                    </button>
                    <button
                      onClick={() => moveItem(item.id, 1)}
                      disabled={idx === activeSection.items.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                      title="تحريك لأسفل"
                    >
                      <ChevronLeft className="h-4 w-4 -rotate-90" />
                    </button>
                    <button
                      onClick={() => openEditItem(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-navy-50 text-navy-700 hover:bg-navy-100"
                      title="تعديل"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-sm font-bold text-white">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-navy-900">{item.heading}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.body}</p>
                    {item.tips.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {item.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isPresidentOrMedia && (
              <button
                onClick={openAddItem}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy-200 px-4 py-4 text-sm font-bold text-navy-600 transition-colors hover:border-navy-300 hover:bg-navy-50"
              >
                <Plus className="h-5 w-5" /> {t('guide.addItem')}
              </button>
            )}

            {/* Contacts */}
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-navy-900">
                  <Phone className="h-5 w-5 text-navy-600" />
                  {t('guide.importantContacts')}
                </h3>
                {isPresidentOrMedia && (
                  <button
                    onClick={openAddContact}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700 hover:bg-navy-100"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('guide.addContact')}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSection.contacts.map((contact) => {
                  const Icon = contact.type === 'phone' ? PhoneIcon : LinkIcon;
                  return (
                    <div key={contact.id} className="group relative flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-700">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-gray-400">{contact.label}</div>
                        <div className="text-sm font-bold text-navy-900" dir="ltr">{contact.value}</div>
                      </div>
                      {isPresidentOrMedia && (
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => openEditContact(contact)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-700 shadow-sm hover:bg-navy-50"
                            title="تعديل"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-rose-600 shadow-sm hover:bg-rose-50"
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeSection.contacts.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-gray-400">لا توجد جهات اتصال لهذا القسم.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Modal */}
      <Modal open={sectionModalOpen} onClose={() => setSectionModalOpen(false)} title={editingSection ? 'تعديل القسم' : 'إضافة قسم جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveSection} className="space-y-4">
          <div>
            <label htmlFor={fieldId('secLabel')} className="label-field">اسم القسم <RequiredMark /></label>
            <input id={fieldId('secLabel')} required className={`input-field ${isInvalid(invalid, 'secLabel')}`} value={sectionForm.label} onChange={(e) => { setSectionForm({ ...sectionForm, label: e.target.value }); clearInvalid(setInvalid, 'secLabel'); }} placeholder="مثال: المطاعم" />
          </div>
          <div>
            <label htmlFor={fieldId('secTitle')} className="label-field">العنوان الرئيسي <RequiredMark /></label>
            <input id={fieldId('secTitle')} required className={`input-field ${isInvalid(invalid, 'secTitle')}`} value={sectionForm.title} onChange={(e) => { setSectionForm({ ...sectionForm, title: e.target.value }); clearInvalid(setInvalid, 'secTitle'); }} placeholder="مثال: دليل المطاعم" />
          </div>
          <div>
            <label htmlFor={fieldId('secIntro')} className="label-field">النص التعريفي <RequiredMark /></label>
            <textarea id={fieldId('secIntro')} required rows={2} className={`input-field resize-none ${isInvalid(invalid, 'secIntro')}`} value={sectionForm.intro} onChange={(e) => { setSectionForm({ ...sectionForm, intro: e.target.value }); clearInvalid(setInvalid, 'secIntro'); }} />
          </div>
          <div>
            <label className="label-field">الأيقونة</label>
            <div className="flex flex-wrap gap-2">
              {iconNames.map((name) => {
                const Icon = iconMap[name];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSectionForm({ ...sectionForm, icon: name })}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-colors ${
                      sectionForm.icon === name ? 'border-navy-600 bg-navy-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-navy-700" />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label-field">اللون</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => setSectionForm({ ...sectionForm, color: c.color, bg: c.bg })}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 ${c.bg} ${c.color} ${
                    sectionForm.color === c.color ? 'border-navy-600 ring-2 ring-navy-200' : 'border-transparent'
                  }`}
                >
                  <BookOpen className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSectionModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title={editingItem ? 'تعديل المعلومة' : 'إضافة معلومة/دليل جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveItem} className="space-y-4">
          <div>
            <label htmlFor={fieldId('itemHeading')} className="label-field">عنوان الكرت <RequiredMark /></label>
            <input id={fieldId('itemHeading')} required className={`input-field ${isInvalid(invalid, 'itemHeading')}`} value={itemForm.heading} onChange={(e) => { setItemForm({ ...itemForm, heading: e.target.value }); clearInvalid(setInvalid, 'itemHeading'); }} />
          </div>
          <div>
            <label htmlFor={fieldId('itemBody')} className="label-field">الوصف الرئيسي <RequiredMark /></label>
            <textarea id={fieldId('itemBody')} required rows={2} className={`input-field resize-none ${isInvalid(invalid, 'itemBody')}`} value={itemForm.body} onChange={(e) => { setItemForm({ ...itemForm, body: e.target.value }); clearInvalid(setInvalid, 'itemBody'); }} />
          </div>
          <div>
            <label className="label-field">النقاط الفرعية</label>
            <div className="space-y-2">
              {itemForm.tips.map((tip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input-field"
                    value={tip}
                    onChange={(e) => setItemForm({ ...itemForm, tips: itemForm.tips.map((t, j) => j === i ? e.target.value : t) })}
                    placeholder={`نقطة ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setItemForm({ ...itemForm, tips: itemForm.tips.filter((_, j) => j !== i) })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItemForm({ ...itemForm, tips: [...itemForm.tips, ''] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-navy-300 px-3 py-1.5 text-xs font-bold text-navy-600 hover:bg-navy-50"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة نقطة
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setItemModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Contact Modal */}
      <Modal open={contactModalOpen} onClose={() => setContactModalOpen(false)} title={editingContact ? 'تعديل جهة اتصال' : 'إضافة جهة اتصال'} maxWidth="max-w-md">
        <form onSubmit={saveContact} className="space-y-4">
          <div>
            <label htmlFor={fieldId('contactLabel')} className="label-field">الاسم <RequiredMark /></label>
            <input id={fieldId('contactLabel')} required className={`input-field ${isInvalid(invalid, 'contactLabel')}`} value={contactForm.label} onChange={(e) => { setContactForm({ ...contactForm, label: e.target.value }); clearInvalid(setInvalid, 'contactLabel'); }} placeholder="مثال: قسم شؤون الطلاب" />
          </div>
          <div>
            <label htmlFor={fieldId('contactValue')} className="label-field">القيمة <RequiredMark /></label>
            <input id={fieldId('contactValue')} required className={`input-field ${isInvalid(invalid, 'contactValue')}`} dir="ltr" value={contactForm.value} onChange={(e) => { setContactForm({ ...contactForm, value: e.target.value }); clearInvalid(setInvalid, 'contactValue'); }} placeholder="+90 442 231 0000" />
          </div>
          <div>
            <label className="label-field">النوع</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setContactForm({ ...contactForm, type: 'phone' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  contactForm.type === 'phone' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <PhoneIcon className="h-4 w-4" /> رقم هاتف
              </button>
              <button
                type="button"
                onClick={() => setContactForm({ ...contactForm, type: 'link' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  contactForm.type === 'link' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LinkIcon className="h-4 w-4" /> رابط موقع
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setContactModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
