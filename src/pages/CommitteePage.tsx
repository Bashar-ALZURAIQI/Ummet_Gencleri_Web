import { useState } from 'react';
import {
  Crown, UserCog, Megaphone, GraduationCap, ShieldCheck, CalendarDays, Wallet,
  ChevronLeft, ChevronRight, Mail, CheckCircle2, Users, Briefcase, Target,
  Edit3, Trash2, Plus, Save, ClipboardCheck, Hourglass,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';
import ProfileEditsPanel from '../components/ProfileEditsPanel';
import DismissibleToast from '../components/DismissibleToast';
import UserAvatar from '../components/UserAvatar';
import { committeeOrder, committeeMeta, type CommitteeId, type CommitteeMember, type Committee, isLeadershipRole } from '../data/mockData';
import RequiredMark from '../components/RequiredMark';
import ManagedFileField from '../components/ManagedFileField';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import {
  PROFILE_EDIT_SUBMITTED_MESSAGE,
  projectExecutiveContentSnapshot,
  resolveExecutiveContentEditState,
} from '../domain/executiveEditWorkflow';
import { persistPresidentCommitteeEdit } from '../domain/executiveEditCoordinator';
import {
  getExecutiveSectionLabel,
  getExecutiveSectionDescription,
  getExecutiveRoleLabel,
  getExecutiveMetricLabel,
} from '../domain/executivePresentation';
import { formatStatisticNumber } from '../domain/numberPresentation';

const iconMap: Record<string, typeof Crown> = {
  Crown, UserCog, Megaphone, GraduationCap, ShieldCheck, CalendarDays, Wallet,
};

type HeadForm = { name: string; role: string; bio: string; photo: string; email: string };
type MemberForm = { name: string; position: string; photo: string };
type StatForm = { label: string; value: string };
type SubmissionFeedback = { id: number; type: 'success' | 'error'; text: string };

export default function CommitteePage({ committeeId }: { committeeId: CommitteeId }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { committees, currentUser, setView, pendingProfileEdits, submitProfileEdit, updateBoardHead, uploadManagedFile, savePublishedSiteTarget } = useApp();

  // Modals
  const [headModal, setHeadModal] = useState(false);
  const [headForm, setHeadForm] = useState<HeadForm>({ name: '', role: '', bio: '', photo: '', email: '' });

  const [respModal, setRespModal] = useState(false);
  const [respIdx, setRespIdx] = useState<number>(-1);
  const [respText, setRespText] = useState('');

  const [statModal, setStatModal] = useState(false);
  const [statIdx, setStatIdx] = useState<number>(-1);
  const [statForm, setStatForm] = useState<StatForm>({ label: '', value: '' });

  const [memberModal, setMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<CommitteeMember | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>({ name: '', position: '', photo: '' });

  const [invalid, setInvalid] = useState<string[]>([]);
  const [contentSubmitting, setContentSubmitting] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<SubmissionFeedback | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);

  const committee = committees.find((c) => c.id === committeeId);
  if (!committee) return null;

  const allowedCommitteeManager = currentUser?.role === 'PRESIDENT' ||
    (!!currentUser && isLeadershipRole(currentUser.role) && currentUser.committee === committeeId);
  const isPresident = currentUser?.role === 'PRESIDENT';
  const canEditPersonalProfile = !!currentUser?.userId && committee.head?.id === currentUser.userId;
  const Icon = iconMap[committee.icon] || Crown;

  const idx = committeeOrder.indexOf(committeeId);
  const prev = idx > 0 ? committeeOrder[idx - 1] : null;
  const next = idx < committeeOrder.length - 1 ? committeeOrder[idx + 1] : null;

  const pendingCount = pendingProfileEdits.filter((e) => e.status === 'PENDING_APPROVAL').length;

  // Status notices for the committee's own head.
  const myPendingEdit = !!currentUser && pendingProfileEdits.find(
    (e) => e.committeeId === committeeId && e.submittedByUserId === currentUser.userId && e.status === 'PENDING_APPROVAL'
  );
  const contentEditState = resolveExecutiveContentEditState({
    isPresident,
    hasPendingRequest: !!myPendingEdit,
  });
  const canEditContent = allowedCommitteeManager && contentEditState.canEditContent;

  // The president publishes directly; committee heads queue a pending edit that
  // waits for the president's approval before becoming public.
  const submitOrApply = async (mutate: (c: Committee) => Committee): Promise<boolean> => {
    if (!canEditContent || contentSubmitting) return false;
    const next = mutate(committee);
    if (isPresident) {
      setContentSubmitting(true);
      setSubmissionFeedback(null);
      try {
        const result = await persistPresidentCommitteeEdit({
          publishCommittees: (nextCommittees) => savePublishedSiteTarget('committees', nextCommittees),
        }, committees, committeeId, next);
        if (!result.ok) {
          const message = result.error ?? 'تعذر حفظ بيانات الهيئة في قاعدة البيانات.';
          console.error('[ExecutiveBoardEditModal] Supabase president publication failed', message);
          setSubmissionFeedback({ id: Date.now(), type: 'error', text: message });
          return false;
        }
        setSubmissionFeedback({ id: Date.now(), type: 'success', text: t('admin.vision.savedSuccess', 'تم الحفظ بنجاح') });
        return true;
      } catch (error) {
        console.error('[ExecutiveBoardEditModal] Unexpected president publication failure', error);
        setSubmissionFeedback({
          id: Date.now(),
          type: 'error',
          text: 'تعذر الاتصال بالخادم أثناء حفظ بيانات الهيئة. بقيت النافذة مفتوحة للمحاولة مرة أخرى.',
        });
        return false;
      } finally {
        setContentSubmitting(false);
      }
    }

    const snapshot = projectExecutiveContentSnapshot(next);
    if (!snapshot) {
      const error = 'تعذر تجهيز بيانات التعديل للإرسال. راجع الحقول وحاول مرة أخرى.';
      console.error('[ExecutiveBoardEditModal] Invalid profile edit payload', next);
      setSubmissionFeedback({ id: Date.now(), type: 'error', text: error });
      return false;
    }

    setContentSubmitting(true);
    setSubmissionFeedback(null);
    try {
      const result = await submitProfileEdit(committeeId, snapshot);
      if (!result.ok) {
        console.error(
          '[ExecutiveBoardEditModal] Supabase profile edit submission failed',
          result.diagnostic ?? result.error,
        );
        setSubmissionFeedback({ id: Date.now(), type: 'error', text: result.error });
        return false;
      }
      setSubmissionFeedback({ id: Date.now(), type: 'success', text: PROFILE_EDIT_SUBMITTED_MESSAGE });
      return true;
    } catch (error) {
      console.error('[ExecutiveBoardEditModal] Unexpected profile edit submission failure', error);
      setSubmissionFeedback({
        id: Date.now(),
        type: 'error',
        text: 'تعذر الاتصال بالخادم أثناء إرسال التعديل. بقيت النافذة مفتوحة للمحاولة مرة أخرى.',
      });
      return false;
    } finally {
      setContentSubmitting(false);
    }
  };

  // Head
  const openHead = () => {
    const h = committee.head ?? {};
    setHeadForm({ name: h.name ?? '', role: h.role ?? '', bio: h.bio ?? '', photo: h.photo ?? '', email: h.email ?? '' });
    setHeadModal(true);
  };
  const saveHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditPersonalProfile) return;
    if (!validateRequired(headForm, ['name', 'role', 'bio', 'photo', 'email'], setInvalid)) return;
    const updated = await updateBoardHead(committeeId, {
      name: headForm.name,
      bio: headForm.bio,
      photo: headForm.photo,
      email: headForm.email,
    });
    if (!updated.ok) return;
    setHeadModal(false);
  };

  // Responsibilities
  const openAddResp = () => { setRespIdx(-1); setRespText(''); setRespModal(true); };
  const openEditResp = (i: number) => { setRespIdx(i); setRespText(committee.responsibilities?.[i] ?? ''); setRespModal(true); };
  const saveResp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respText.trim()) return;
    if (!validateRequired({ respText }, ['respText'], setInvalid)) return;
    if (!(await submitOrApply((c) => {
      const items = [...(c.responsibilities ?? [])];
      if (respIdx >= 0) items[respIdx] = respText;
      else items.push(respText);
      return { ...c, responsibilities: items };
    }))) return;
    setRespModal(false);
  };
  const deleteResp = async (i: number) => {
    if (!confirm(t('committee.confirmDeleteItem', 'حذف هذا البند؟'))) return;
    await submitOrApply((c) => ({ ...c, responsibilities: (c.responsibilities ?? []).filter((_, x) => x !== i) }));
  };

  // Stats
  const openEditStat = (i: number) => { setStatIdx(i); setStatForm({ ...(committee.stats?.[i] ?? { value: '', label: '' }) }); setStatModal(true); };
  const saveStat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(statForm, ['value', 'label'], setInvalid)) return;
    if (!(await submitOrApply((c) => {
      const stats = [...(c.stats ?? [])];
      stats[statIdx] = { ...statForm };
      return { ...c, stats };
    }))) return;
    setStatModal(false);
  };

  // Members
  const openAddMember = () => { setEditingMember(null); setMemberForm({ name: '', position: '', photo: '' }); setMemberModal(true); };
  const openEditMember = (m: CommitteeMember) => { setEditingMember(m); setMemberForm({ name: m.name ?? '', position: m.position ?? '', photo: m.photo ?? '' }); setMemberModal(true); };
  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForm.name.trim()) return;
    if (!validateRequired(memberForm, ['name', 'position', 'photo'], setInvalid)) return;
    const photo = memberForm.photo;
    if (!(await submitOrApply((c) => {
      if (editingMember) {
        return { ...c, members: (c.members ?? []).map((m) => m.id === editingMember.id ? { ...m, ...memberForm, photo } : m) };
      }
      return { ...c, members: [...(c.members ?? []), { id: 'cm' + Date.now(), name: memberForm.name, position: memberForm.position, photo }] };
    }))) return;
    setMemberModal(false);
  };
  const deleteMember = async (mid: string) => {
    if (!confirm(t('committee.confirmDeleteMember', 'حذف هذا العضو؟'))) return;
    await submitOrApply((c) => ({ ...c, members: (c.members ?? []).filter((m) => m.id !== mid) }));
  };

  return (
    <div className="animate-fade-in pt-16 lg:pt-20">
      {/* Hero */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${committee.color || 'from-navy-700 to-navy-950'} py-14 lg:py-16`}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="container-app relative">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
              <Icon className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/15 px-3 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                  {committeeId === 'presidency' || committeeId === 'vice-presidency' ? t('committee.executiveOffice') : t('committee.committeeTag')}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-extrabold text-white lg:text-4xl">{getExecutiveSectionLabel(committee.id, t) || committee.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">{getExecutiveSectionDescription(committee.id, t, committee.description)}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="container-app py-12">
        {submissionFeedback ? (
          <DismissibleToast
            dismissKey={`ug_toast_profile_submit_${committeeId}_${submissionFeedback.id}`}
            type={submissionFeedback.type}
            icon={submissionFeedback.type === 'success'
              ? <CheckCircle2 className="h-5 w-5 shrink-0" />
              : undefined}
          >
            {submissionFeedback.text}
          </DismissibleToast>
        ) : myPendingEdit && currentUser && (
          <DismissibleToast dismissKey={`ug_toast_profile_pending_${currentUser.email}_${committeeId}_${myPendingEdit.id}`} type="info" icon={<Hourglass className="h-5 w-5 shrink-0" />}>
            {PROFILE_EDIT_SUBMITTED_MESSAGE}
          </DismissibleToast>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Head profile */}
          <div className="lg:col-span-1">
            <div className="group/head card relative overflow-hidden">
              {canEditPersonalProfile && (
                <button
                  onClick={openHead}
                  className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-navy-700 opacity-0 shadow ring-1 ring-gray-200 transition-opacity hover:bg-navy-50 group-hover/head:opacity-100"
                  title={t('committee.editHeadTitle', 'تعديل بيانات المسؤول')}
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
              <div className={`h-24 bg-gradient-to-br ${committee.color || 'from-navy-700 to-navy-950'}`} />
              <div className="-mt-12 px-6 pb-6 text-center">
                <UserAvatar
                  name={committee.head?.name}
                  photo={committee.head?.photo}
                  avatarPath={committee.head?.photo}
                  updatedAt={committee.head?.updatedAt}
                  className="mx-auto h-24 w-24 border-4 border-white shadow-lg"
                  fallbackClassName="bg-navy-700 text-2xl text-white"
                />
                <h3 className="mt-3 text-lg font-extrabold text-navy-900">{committee.head?.name || '—'}</h3>
                <p className="text-sm font-semibold text-navy-600">{getExecutiveRoleLabel(committee.head?.role, t) || '—'}</p>
                <p className="mt-3 text-xs leading-relaxed text-gray-500">{committee.head?.bio || ''}</p>
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  <Mail className="h-3.5 w-3.5" />
                  <span dir="ltr">{committee.head?.email || '—'}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(committee.stats ?? []).map((s, i) => (
                <button
                  key={i}
                  onClick={canEditContent ? () => openEditStat(i) : undefined}
                  className={`card group/stat relative p-3 text-center ${canEditContent ? 'cursor-pointer hover:ring-2 hover:ring-navy-200' : 'cursor-default'}`}
                >
                  {canEditContent && (
                    <Edit3 className="absolute left-1.5 top-1.5 h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover/stat:opacity-100" />
                  )}
                  <div className="text-lg font-extrabold text-navy-900">{formatStatisticNumber(s.value, locale)}</div>
                  <div className="text-[10px] text-gray-500">{getExecutiveMetricLabel(s.label, t)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Responsibilities + members */}
          <div className="lg:col-span-2 space-y-6">
            {(committee.vision || ((committee.goals ?? '').trim().length > 0)) && (
              <div className="card p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
                  <Target className="h-5 w-5 text-navy-600" />
                  {t('committee.visionAndGoals')}
                </h3>
                {committee.vision && (
                  <div className="mt-4">
                    <div className="mb-1.5 text-xs font-bold text-navy-500">{t('committee.vision')}</div>
                    <p className="whitespace-pre-line rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">{committee.vision}</p>
                  </div>
                )}
                {committee.goals && committee.goals.trim().length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 text-xs font-bold text-navy-500">{t('committee.goals')}</div>
                    <p className="whitespace-pre-line rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">{committee.goals}</p>
                  </div>
                )}
              </div>
            )}

            <div className="group/resp card p-6">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
                  <Briefcase className="h-5 w-5 text-navy-600" />
                  {t('committee.responsibilities')}
                </h3>
                {canEditContent && (
                  <button onClick={openAddResp} className="flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-100">
                    <Plus className="h-3.5 w-3.5" /> {t('committee.addItem')}
                  </button>
                )}
              </div>
              <ul className="mt-4 space-y-3">
                {(committee.responsibilities ?? []).map((r, i) => (
                  <li key={i} className="group/item flex items-start gap-3 text-sm leading-relaxed text-gray-600">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span className="flex-1">{r ?? ''}</span>
                    {canEditContent && (
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover/item:opacity-100">
                        <button onClick={() => openEditResp(i)} className="flex h-6 w-6 items-center justify-center rounded-md text-navy-600 hover:bg-navy-50" title={t('common.edit')}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteResp(i)} className="flex h-6 w-6 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50" title={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="group/mem card p-6">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
                  <Users className="h-5 w-5 text-navy-600" />
                  {t('committee.membersTitle', { committee: getExecutiveSectionLabel(committee.id, t) })}
                </h3>
                {canEditContent && (
                  <button onClick={openAddMember} className="flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-100">
                    <Plus className="h-3.5 w-3.5" /> {t('committee.addMember')}
                  </button>
                )}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(committee.members ?? []).map((m) => (
                  <div key={m.id || m.name || ''} className="group/memitem relative flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50">
                    <UserAvatar name={m.name} photo={m.photo} avatarPath={m.photo} className="h-12 w-12" />
                    <div>
                      <div className="text-sm font-bold text-navy-900">{m.name || '—'}</div>
                      <div className="text-xs text-gray-500">{m.position || ''}</div>
                    </div>
                    {canEditContent && (
                      <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/memitem:opacity-100">
                        <button onClick={() => openEditMember(m)} className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-navy-600 shadow-sm ring-1 ring-gray-200 hover:bg-navy-50" title={t('common.edit')}>
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button onClick={() => m.id && deleteMember(m.id)} className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-rose-600 shadow-sm ring-1 ring-gray-200 hover:bg-rose-50" title={t('common.delete')}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {(committee.members ?? []).length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">{t('committee.noMembers')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Nav between committees */}
        <div className="mt-12 flex items-center justify-between border-t border-gray-100 pt-6">
          {prev ? (
            <button
              onClick={() => { setView({ kind: 'committee', committeeId: prev }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              {getExecutiveSectionLabel(prev, t) || committeeMeta[prev].name}
            </button>
          ) : (
            <button
              onClick={() => setView({ kind: 'board' })}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              {t('navigation.executiveBoard')}
            </button>
          )}
          {next ? (
            <button
              onClick={() => { setView({ kind: 'committee', committeeId: next }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50"
            >
              {getExecutiveSectionLabel(next, t) || committeeMeta[next].name}
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
          ) : (
            <button
              onClick={() => setView({ kind: 'board' })}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50"
            >
              {t('navigation.executiveBoard')}
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Head edit modal */}
      {canEditPersonalProfile && (
        <Modal open={headModal} onClose={() => setHeadModal(false)} title={t('committee.headModal.title', 'تعديل بيانات المسؤول')} maxWidth="max-w-md">
          <form onSubmit={saveHead} className="space-y-4">
            <div>
              <label htmlFor={fieldId('name')} className="label-field">{t('committee.headModal.fullName', 'الاسم الكامل')} <RequiredMark /></label>
              <input id={fieldId('name')} required className={`input-field ${isInvalid(invalid, 'name')}`} value={headForm.name} onChange={(e) => { setHeadForm({ ...headForm, name: e.target.value }); clearInvalid(setInvalid, 'name'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('role')} className="label-field">{t('committee.headModal.role', 'المسمى الوظيفي')} <RequiredMark /></label>
              <input id={fieldId('role')} readOnly className="input-field bg-gray-100 text-gray-500" value={getExecutiveRoleLabel(headForm.role, t) || headForm.role} />
            </div>
            <div>
              <label htmlFor={fieldId('bio')} className="label-field">{t('committee.headModal.bio', 'النبذة التعريفية')} <RequiredMark /></label>
              <textarea id={fieldId('bio')} required rows={3} className={`input-field resize-none ${isInvalid(invalid, 'bio')}`} value={headForm.bio} onChange={(e) => { setHeadForm({ ...headForm, bio: e.target.value }); clearInvalid(setInvalid, 'bio'); }} />
            </div>
            <ManagedFileField
              usage="avatar"
              label={t('committee.headModal.photo', 'الصورة الشخصية')}
              currentUrl={headForm.photo}
              required
              error={isInvalid(invalid, 'photo') ? t('committee.headModal.photoError', 'يرجى رفع صورة شخصية.') : null}
              onUpload={(file, onProgress) => uploadManagedFile('avatar', file, onProgress)}
              onUploaded={(asset) => {
                setHeadForm((current) => ({ ...current, photo: asset.publicUrl }));
                clearInvalid(setInvalid, 'photo');
              }}
            />
            <div>
              <label htmlFor={fieldId('email')} className="label-field">{t('committee.headModal.officialEmail', 'البريد الإلكتروني الرسمي')} <RequiredMark /></label>
              <input id={fieldId('email')} required type="email" dir="ltr" className={`input-field ${isInvalid(invalid, 'email')}`} value={headForm.email} onChange={(e) => { setHeadForm({ ...headForm, email: e.target.value }); clearInvalid(setInvalid, 'email'); }} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setHeadModal(false)} className="btn-ghost">{t('common.cancel', 'إلغاء')}</button>
              <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> {t('common.save', 'حفظ')}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Responsibility modal */}
      {canEditContent && (
        <Modal open={respModal} onClose={() => setRespModal(false)} title={respIdx >= 0 ? t('committee.respModal.editTitle', 'تعديل البند') : t('committee.respModal.addTitle', 'إضافة بند جديد')} maxWidth="max-w-md">
          <form onSubmit={saveResp} className="space-y-4">
            <div>
              <label htmlFor={fieldId('respText')} className="label-field">{t('committee.respModal.textLabel', 'نص البند')} <RequiredMark /></label>
              <textarea id={fieldId('respText')} required rows={3} className={`input-field resize-none ${isInvalid(invalid, 'respText')}`} value={respText} onChange={(e) => { setRespText(e.target.value); clearInvalid(setInvalid, 'respText'); }} placeholder={t('committee.respModal.placeholder', 'اكتب المهمة أو المسؤولية')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRespModal(false)} className="btn-ghost">{t('common.cancel', 'إلغاء')}</button>
              <button type="submit" disabled={contentSubmitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="h-4 w-4" /> {contentSubmitting ? t('common.sending', 'جارٍ الإرسال...') : t('common.save', 'حفظ')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Stat modal */}
      {canEditContent && (
        <Modal open={statModal} onClose={() => setStatModal(false)} title={t('committee.statModal.title', 'تعديل الإحصائية')} maxWidth="max-w-xs">
          <form onSubmit={saveStat} className="space-y-4">
            <div>
              <label htmlFor={fieldId('value')} className="label-field">{t('committee.statModal.valueLabel', 'الرقم/القيمة')} <RequiredMark /></label>
              <input id={fieldId('value')} required className={`input-field ${isInvalid(invalid, 'value')}`} value={statForm.value} onChange={(e) => { setStatForm({ ...statForm, value: e.target.value }); clearInvalid(setInvalid, 'value'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('label')} className="label-field">{t('committee.statModal.nameLabel', 'المسمى')} <RequiredMark /></label>
              <input id={fieldId('label')} required className={`input-field ${isInvalid(invalid, 'label')}`} value={statForm.label} onChange={(e) => { setStatForm({ ...statForm, label: e.target.value }); clearInvalid(setInvalid, 'label'); }} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStatModal(false)} className="btn-ghost">{t('common.cancel', 'إلغاء')}</button>
              <button type="submit" disabled={contentSubmitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="h-4 w-4" /> {contentSubmitting ? t('common.sending', 'جارٍ الإرسال...') : t('common.save', 'حفظ')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Member modal */}
      {canEditContent && (
        <Modal open={memberModal} onClose={() => setMemberModal(false)} title={editingMember ? t('committee.memberModal.editTitle', 'تعديل عضو') : t('committee.memberModal.addTitle', 'إضافة عضو جديد')} maxWidth="max-w-md">
          <form onSubmit={saveMember} className="space-y-4">
            <div>
              <label htmlFor={fieldId('name')} className="label-field">{t('committee.memberModal.name', 'الاسم')} <RequiredMark /></label>
              <input id={fieldId('name')} required className={`input-field ${isInvalid(invalid, 'name')}`} value={memberForm.name} onChange={(e) => { setMemberForm({ ...memberForm, name: e.target.value }); clearInvalid(setInvalid, 'name'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('position')} className="label-field">{t('committee.memberModal.position', 'المسؤولية')} <RequiredMark /></label>
              <input id={fieldId('position')} required className={`input-field ${isInvalid(invalid, 'position')}`} value={memberForm.position} onChange={(e) => { setMemberForm({ ...memberForm, position: e.target.value }); clearInvalid(setInvalid, 'position'); }} placeholder={t('committee.memberModal.positionPlaceholder', 'مثال: منسق، مستشار...')} />
            </div>
            <ManagedFileField
              usage="avatar"
              label={t('committee.memberModal.photo', 'الصورة الشخصية')}
              currentUrl={memberForm.photo}
              required
              error={isInvalid(invalid, 'photo') ? t('committee.memberModal.photoError', 'يرجى رفع صورة شخصية.') : null}
              onUpload={(file, onProgress) => uploadManagedFile('avatar', file, onProgress)}
              onUploaded={(asset) => {
                setMemberForm((current) => ({ ...current, photo: asset.publicUrl }));
                clearInvalid(setInvalid, 'photo');
              }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMemberModal(false)} className="btn-ghost">{t('common.cancel', 'إلغاء')}</button>
              <button type="submit" disabled={contentSubmitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="h-4 w-4" /> {contentSubmitting ? t('common.sending', 'جارٍ الإرسال...') : t('common.save', 'حفظ')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* President's pending-edit review panel (floating, visible on board pages) */}
      {isPresident && pendingCount > 0 && (
        <>
          <button
            onClick={() => setReviewOpen(true)}
            className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-navy-800 px-4 py-3 text-sm font-bold text-white shadow-xl transition-colors hover:bg-navy-700"
          >
            <ClipboardCheck className="h-4 w-4" />
            {t('committee.reviewFloatingButton', 'طلبات تعديل الهيئة ({{count}})', { count: pendingCount })}
          </button>
          <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={t('committee.reviewModalTitle', 'طلبات تعديل بيانات الهيئة التنفيذية')} maxWidth="max-w-2xl">
            <ProfileEditsPanel />
          </Modal>
        </>
      )}
    </div>
  );
}
