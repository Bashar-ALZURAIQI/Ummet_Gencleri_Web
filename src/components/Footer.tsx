import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube } from 'lucide-react';
import { useApp, type View } from '../context/AppContext';
import { EditableCard } from './InlineEditOverlay';
import RequiredMark from './RequiredMark';
import { fieldId } from '../utils/formValidation';
import { resolvePublicBrandName } from '../domain/publicBrand';

export default function Footer() {
  const { t, i18n } = useTranslation();
  const { setView, siteContent, currentUser, canEditSection } = useApp();
  const sc = siteContent;
  const canEdit = !!currentUser && canEditSection('homepage');
  const [subEmail, setSubEmail] = useState('');
  const [subInvalid, setSubInvalid] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const links: { label: string; view: View }[] = [
    { label: t('navigation.home'), view: { kind: 'home' } },
    { label: t('navigation.about'), view: { kind: 'about' } },
    { label: t('navigation.programs'), view: { kind: 'programs' } },
    { label: t('navigation.contact'), view: { kind: 'contact' } },
    { label: t('navigation.executiveBoard'), view: { kind: 'board' } },
    { label: t('dashboard.studentPortal'), view: { kind: 'student-dashboard' } },
    { label: t('admin.adminDashboard'), view: { kind: 'admin' } },
  ];
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const focusSub = () => {
      const el = document.getElementById(fieldId('subscribeEmail'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    };
    if (!subEmail.trim()) {
      setSubInvalid(true);
      focusSub();
      alert(t('footer.enterEmail'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subEmail)) {
      setSubInvalid(true);
      focusSub();
      alert(t('footer.enterValidEmail'));
      return;
    }
    setSubInvalid(false);
    setSubscribed(true);
    setSubEmail('');
    setTimeout(() => setSubscribed(false), 4000);
  };

  const socials = [
    { Icon: Facebook, url: sc.footer.social.facebook },
    { Icon: Twitter, url: sc.footer.social.twitter },
    { Icon: Instagram, url: sc.footer.social.instagram },
    { Icon: Youtube, url: sc.footer.social.youtube },
  ];

  return (
    <footer className="mt-20 bg-navy-950 text-gray-300">
      <div className="container-app py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 text-white">
                <Users className="h-6 w-6" />
              </div>
              <EditableCard
                canEdit={canEdit}
                config={{
                  label: 'اسم الاتحاد',
                  target: 'site',
                  fields: [
                    { path: 'brand.name', label: 'الاسم بالعربي' },
                    { path: 'brand.nameTr', label: 'الاسم باللاتيني' },
                  ],
                }}
                currentValues={{ 'brand.name': sc.brand.name, 'brand.nameTr': sc.brand.nameTr }}
              >
                <div>
                  <div className="text-lg font-extrabold text-white">{resolvePublicBrandName(i18n.language, sc.brand)}</div>
                  {i18n.language === 'ar' && (
                    <div className="text-xs text-gray-400">{sc.brand.nameTr}</div>
                  )}
                </div>
              </EditableCard>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-400">
              {t('footer.aboutText')}
            </p>
            <EditableCard
              canEdit={canEdit}
              config={{
                label: 'روابط التواصل الاجتماعي',
                target: 'site',
                fields: [
                  { path: 'footer.social.facebook', label: 'فيسبوك' },
                  { path: 'footer.social.twitter', label: 'تويتر / X' },
                  { path: 'footer.social.instagram', label: 'إنستغرام' },
                  { path: 'footer.social.youtube', label: 'يوتيوب' },
                ],
              }}
              currentValues={{ 'footer.social.facebook': sc.footer.social.facebook, 'footer.social.twitter': sc.footer.social.twitter, 'footer.social.instagram': sc.footer.social.instagram, 'footer.social.youtube': sc.footer.social.youtube }}
            >
              <div className="mt-5 flex gap-2">
                {socials.map(({ Icon, url }, i) => (
                  <a
                    key={i}
                    href={url || '#'}
                    onClick={(e) => { if (!url) e.preventDefault(); }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-800 text-gray-300 transition-colors hover:bg-navy-700 hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </EditableCard>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              {t('footer.quickLinks')}
            </h4>
            <ul className="space-y-2.5">
              {links.map((l) => (
                <li key={l.label}>
                  <button
                    onClick={() => go(l.view)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              {t('footer.contactUs')}
            </h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <EditableCard
                canEdit={canEdit}
                config={{
                  label: 'معلومات التواصل',
                  target: 'site',
                  fields: [
                    { path: 'footer.address', label: 'العنوان' },
                    { path: 'footer.email', label: 'البريد الإلكتروني' },
                    { path: 'footer.phone', label: 'رقم الهاتف' },
                  ],
                }}
                currentValues={{ 'footer.address': sc.footer.address, 'footer.email': sc.footer.email, 'footer.phone': sc.footer.phone }}
              >
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" />
                  <span>{sc.footer.address}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-navy-400" />
                  <span>{sc.footer.email}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-navy-400" />
                  <span dir="ltr">{sc.footer.phone}</span>
                </li>
              </EditableCard>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              {t('footer.newsletter')}
            </h4>
            <p className="text-sm text-gray-400">
              {t('footer.newsletterSubtitle')}
            </p>
            <form
              onSubmit={subscribe}
              className="mt-3 space-y-2"
            >
              <label htmlFor={fieldId('subscribeEmail')} className="block text-xs text-gray-400">
                {t('footer.emailLabel')} <RequiredMark />
              </label>
              <div className="flex gap-2">
                <input
                  id={fieldId('subscribeEmail')}
                  type="email"
                  required
                  dir="ltr"
                  placeholder="example@email.com"
                  className={`w-full rounded-lg border bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none ${subInvalid ? 'border-rose-500' : 'border-navy-700 focus:border-navy-500'}`}
                  value={subEmail}
                  onChange={(e) => { setSubEmail(e.target.value); setSubInvalid(false); }}
                />
                <button className="shrink-0 rounded-lg bg-gold-400 px-4 py-2 text-sm font-bold text-navy-950 transition-colors hover:bg-gold-300">
                  {t('footer.subscribeButton')}
                </button>
              </div>
              {subscribed && (
                <p className="text-xs font-semibold text-emerald-400">{t('footer.subscribeSuccess')}</p>
              )}
            </form>
          </div>
        </div>

          © {new Date().getFullYear()}{' '}
          <EditableCard
            canEdit={canEdit}
            config={{ label: 'حقوق النشر', target: 'site', fields: [{ path: 'footer.copyright', label: 'نص حقوق النشر' }] }}
            currentValues={{ 'footer.copyright': sc.footer.copyright }}
          >
            <span>{sc.footer.copyright}</span>
          </EditableCard>
      </div>
    </footer>
  );
}
