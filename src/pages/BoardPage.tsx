import { useState } from 'react';
import {
  Crown, UserCog, Megaphone, GraduationCap, ShieldCheck, CalendarDays, Wallet,
  ChevronLeft, Users, ClipboardCheck,
} from 'lucide-react';
import { useApp, type View } from '../context/AppContext';
import Modal from '../components/Modal';
import ProfileEditsPanel from '../components/ProfileEditsPanel';
import UserAvatar from '../components/UserAvatar';
import { committeeOrder, committeeMeta, type CommitteeId } from '../data/mockData';

const iconMap: Record<string, typeof Crown> = {
  Crown, UserCog, Megaphone, GraduationCap, ShieldCheck, CalendarDays, Wallet,
};

export default function BoardPage() {
  const { committees, setView, currentUser, pendingProfileEdits } = useApp();
  const [reviewOpen, setReviewOpen] = useState(false);

  const isPresident = currentUser?.role === 'PRESIDENT';
  const pendingCount = pendingProfileEdits.filter((e) => e.status === 'PENDING_APPROVAL').length;

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="animate-fade-in pt-16 lg:pt-20">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 py-16 text-center lg:py-20">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 h-72 w-72 rounded-full bg-navy-600/30 blur-3xl" />
        <div className="container-app relative">
          <span className="text-sm font-bold uppercase tracking-wider text-gold-300">الهيكل التنظيمي</span>
          <h1 className="mt-3 text-4xl font-extrabold text-white lg:text-5xl">الهيئة التنفيذية</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-300">
            يتكون اتحاد شباب الأمة من هيئة تنفيذية تضم الرئاسة ونائب الرئيس وخمس
            لجان متخصصة، يعملون معًا لتحقيق رؤية الاتحاد وأهدافه.
          </p>
        </div>
      </section>

      {/* Org chart overview */}
      <section className="container-app py-14">
        {/* President + VP top row */}
        <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-6 sm:flex-row sm:justify-center">
          {(['presidency', 'vice-presidency'] as CommitteeId[]).map((id) => {
            const c = committees.find((c) => c.id === id);
            if (!c) return null;
            return (
              <button
                key={id}
                onClick={() => go({ kind: 'committee', committeeId: id })}
                className="group w-full max-w-sm"
              >
                <div className="card flex items-center gap-4 p-5 transition-all hover:-translate-y-1 hover:shadow-xl">
                  <UserAvatar
                    name={c.head?.name}
                    photo={c.head?.photo}
                    avatarPath={c.head?.photo}
                    updatedAt={c.head?.updatedAt}
                    className="h-14 w-14"
                    fallbackClassName={`bg-gradient-to-br ${c.color || 'from-navy-700 to-navy-950'} text-lg text-white shadow-lg`}
                  />
                  <div className="text-right">
                    <div className="text-base font-extrabold text-navy-900">{c.head?.name || '—'}</div>
                    <div className="text-sm font-semibold text-navy-600">{c.head?.role || '—'}</div>
                    <div className="mt-0.5 text-xs text-gray-400">{c.name || '—'}</div>
                  </div>
                  <ChevronLeft className="mr-auto h-5 w-5 text-gray-300 transition-transform group-hover:-translate-x-1 group-hover:text-navy-600" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Connector */}
        <div className="mx-auto mb-2 h-8 w-px bg-gray-200" />
        <div className="mx-auto mb-8 h-px w-full max-w-4xl bg-gray-200" />

        {/* Committees grid */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold text-navy-900 lg:text-3xl">اللجان المتخصصة</h2>
          <p className="mt-2 text-sm text-gray-500">خمس لجان تتوزع عليها مهام الاتحاد وأنشطته</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {committeeOrder
            .filter((id) => id !== 'presidency' && id !== 'vice-presidency')
            .map((id) => {
              const c = committees.find((c) => c.id === id);
              if (!c) return null;
              const memberCount = Array.isArray(c.members) ? c.members.length : 0;
              return (
                <button
                  key={id}
                  onClick={() => go({ kind: 'committee', committeeId: id })}
                  className="card group flex flex-col items-center p-6 text-center transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <UserAvatar
                    name={c.head?.name}
                    photo={c.head?.photo}
                    avatarPath={c.head?.photo}
                    updatedAt={c.head?.updatedAt}
                    className="h-16 w-16 transition-transform group-hover:scale-110"
                    fallbackClassName={`bg-gradient-to-br ${c.color || 'from-navy-700 to-navy-950'} text-xl text-white shadow-lg`}
                  />
                  <h3 className="mt-4 text-lg font-bold text-navy-900">{c.name || '—'}</h3>
                  <p className="mt-1 text-sm font-bold text-navy-700">{c.head?.name || 'لم يُعيّن مسؤول بعد'}</p>
                  <p className="text-xs text-gray-400">{c.head?.role || ''}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{c.description || ''}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                    <Users className="h-3.5 w-3.5" />
                    {memberCount + 1} أعضاء
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-navy-700 group-hover:text-navy-900">
                    عرض التفاصيل
                    <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  </span>
                </button>
              );
            })}
        </div>

        {/* All members quick nav */}
        <div className="mt-14 rounded-3xl bg-gray-50 p-8">
          <h3 className="mb-6 text-center text-xl font-bold text-navy-900">تصفح جميع المكاتب واللجان</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {committeeOrder.map((id) => {
              const meta = committeeMeta[id];
              if (!meta) return null;
              const Icon = iconMap[meta.icon] || Crown;
              return (
                <button
                  key={id}
                  onClick={() => go({ kind: 'committee', committeeId: id })}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-all hover:bg-navy-50 hover:shadow-sm"
                >
                  <Icon className="h-4 w-4" />
                  {meta.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* President's pending-edit review panel (floating, visible on board pages) */}
      {isPresident && pendingCount > 0 && (
        <>
          <button
            onClick={() => setReviewOpen(true)}
            className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-navy-800 px-4 py-3 text-sm font-bold text-white shadow-xl transition-colors hover:bg-navy-700"
          >
            <ClipboardCheck className="h-4 w-4" />
            طلبات تعديل الهيئة ({pendingCount})
          </button>
          <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="طلبات تعديل بيانات الهيئة التنفيذية" maxWidth="max-w-2xl">
            <ProfileEditsPanel />
          </Modal>
        </>
      )}
    </div>
  );
}
