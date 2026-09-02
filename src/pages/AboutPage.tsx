import {
  Target, Eye, Heart, Users, GraduationCap, Award, Sparkles, BookOpen, Handshake, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditableField, EditableCard } from '../components/InlineEditOverlay';

const iconMap: Record<string, LucideIcon> = {
  Target, Eye, Heart, Users, GraduationCap, Award, Sparkles, BookOpen, Handshake, ShieldCheck,
};

export default function AboutPage() {
  const { setView, aboutContent: a, currentUser, canEditSection } = useApp();
  const canEdit = !!currentUser && canEditSection('about-page');

  return (
    <div className="animate-fade-in pt-16 lg:pt-20">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 py-16 text-center lg:py-20">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="container-app relative">
          <span className="text-sm font-bold uppercase tracking-wider text-gold-300">
            <EditableField config={{ path: 'header.badge', label: 'شارة العنوان', target: 'about' }} currentValue={a.header.badge} canEdit={canEdit}>{a.header.badge}</EditableField>
          </span>
          <h1 className="mt-3 text-4xl font-extrabold text-white lg:text-5xl">
            <EditableField config={{ path: 'header.title', label: 'العنوان الرئيسي', target: 'about' }} currentValue={a.header.title} canEdit={canEdit}>{a.header.title}</EditableField>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-300">
            <EditableField config={{ path: 'header.description', label: 'وصف العنوان', type: 'textarea', target: 'about' }} currentValue={a.header.description} canEdit={canEdit}>{a.header.description}</EditableField>
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="container-app py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="text-sm font-bold uppercase tracking-wider text-gold-600">
              <EditableField config={{ path: 'story.badge', label: 'شارة القصة', target: 'about' }} currentValue={a.story.badge} canEdit={canEdit}>{a.story.badge}</EditableField>
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-navy-900 lg:text-4xl">
              <EditableField config={{ path: 'story.title', label: 'عنوان القصة', target: 'about' }} currentValue={a.story.title} canEdit={canEdit}>{a.story.title}</EditableField>
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-gray-600">
              {a.story.paragraphs.map((p, i) => (
                <EditableField key={i} config={{ path: `story.paragraphs.${i}`, label: `فقرة ${i + 1}`, type: 'textarea', target: 'about' }} currentValue={p} canEdit={canEdit}>
                  <p>{p}</p>
                </EditableField>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {a.story.images.slice(0, 4).map((src, i) => (
              <EditableField key={i} config={{ path: `story.images.${i}`, label: `صورة ${i + 1}`, type: 'image', target: 'about' }} currentValue={src} canEdit={canEdit}>
                <img
                  src={src}
                  alt=""
                  className={`h-48 w-full rounded-2xl object-cover lg:h-64 ${i % 2 === 1 ? 'mt-8' : ''}`}
                />
              </EditableField>
            ))}
          </div>
        </div>
      </section>

      {/* Mission / Vision / Values */}
      <section className="bg-gray-50 py-16">
        <div className="container-app">
          <div className="mb-8 text-center">
            <span className="text-sm font-bold uppercase tracking-wider text-gold-600">
              <EditableField config={{ path: 'mission.badge', label: 'شارة الرسالة', target: 'about' }} currentValue={a.mission.badge} canEdit={canEdit}>{a.mission.badge}</EditableField>
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-navy-900 lg:text-4xl">
              <EditableField config={{ path: 'mission.title', label: 'عنوان الرسالة', target: 'about' }} currentValue={a.mission.title} canEdit={canEdit}>{a.mission.title}</EditableField>
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {a.mission.cards.map((c, i) => {
              const Icon = iconMap[c.icon] || Target;
              return (
                <EditableCard
                  key={i}
                  canEdit={canEdit}
                  config={{
                    label: `بطاقة رسالة ${i + 1}`,
                    target: 'about',
                    fields: [
                      { path: `mission.cards.${i}.icon`, label: 'الأيقونة', type: 'icon' },
                      { path: `mission.cards.${i}.title`, label: 'العنوان' },
                      { path: `mission.cards.${i}.text`, label: 'النص', type: 'textarea' },
                    ],
                  }}
                  currentValues={{ [`mission.cards.${i}.icon`]: c.icon, [`mission.cards.${i}.title`]: c.title, [`mission.cards.${i}.text`]: c.text }}
                >
                  <div className="card p-7 text-center transition-all hover:-translate-y-1 hover:shadow-lg">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-white shadow-lg shadow-navy-900/30">
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-navy-900">{c.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-gray-500">{c.text}</p>
                  </div>
                </EditableCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="container-app py-16">
        <div className="mb-10 text-center">
          <span className="text-sm font-bold uppercase tracking-wider text-gold-600">
            <EditableField config={{ path: 'goals.badge', label: 'شارة الأهداف', target: 'about' }} currentValue={a.goals.badge} canEdit={canEdit}>{a.goals.badge}</EditableField>
          </span>
          <h2 className="mt-2 text-3xl font-extrabold text-navy-900 lg:text-4xl">
            <EditableField config={{ path: 'goals.title', label: 'عنوان الأهداف', target: 'about' }} currentValue={a.goals.title} canEdit={canEdit}>{a.goals.title}</EditableField>
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {a.goals.cards.map((g, i) => {
            const Icon = iconMap[g.icon] || Sparkles;
            return (
              <EditableCard
                key={i}
                canEdit={canEdit}
                config={{
                  label: `بطاقة هدف ${i + 1}`,
                  target: 'about',
                  fields: [
                    { path: `goals.cards.${i}.icon`, label: 'الأيقونة', type: 'icon' },
                    { path: `goals.cards.${i}.title`, label: 'العنوان' },
                    { path: `goals.cards.${i}.desc`, label: 'الوصف', type: 'textarea' },
                  ],
                }}
                currentValues={{ [`goals.cards.${i}.icon`]: g.icon, [`goals.cards.${i}.title`]: g.title, [`goals.cards.${i}.desc`]: g.desc }}
              >
                <div className="card flex items-start gap-4 p-5 transition-all hover:shadow-md">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-navy-900">{g.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">{g.desc}</p>
                  </div>
                </div>
              </EditableCard>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container-app pb-16">
        <div className="rounded-3xl bg-gradient-to-l from-navy-800 to-navy-950 px-6 py-12 text-center lg:py-14">
          {(() => {
            const Icon = iconMap[a.cta.icon] || Award;
            return <Icon className="mx-auto h-12 w-12 text-gold-400" />;
          })()}
          <h2 className="mt-4 text-2xl font-extrabold text-white lg:text-3xl">
            <EditableField config={{ path: 'cta.title', label: 'عنوان الدعوة', target: 'about' }} currentValue={a.cta.title} canEdit={canEdit}>{a.cta.title}</EditableField>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-300">
            <EditableField config={{ path: 'cta.description', label: 'وصف الدعوة', type: 'textarea', target: 'about' }} currentValue={a.cta.description} canEdit={canEdit}>{a.cta.description}</EditableField>
          </p>
          <button onClick={() => setView({ kind: 'register' })} className="btn-gold mt-6">
            <EditableField config={{ path: 'cta.buttonText', label: 'نص الزر', target: 'about' }} currentValue={a.cta.buttonText} canEdit={canEdit}>{a.cta.buttonText}</EditableField>
          </button>
        </div>
      </section>
    </div>
  );
}
