import { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, CalendarDays, Users, ClipboardList, BarChart3, PieChart,
  Plus, Search, Trash2, Edit3, Mail, GraduationCap, CheckCircle2, Clock, FileText, Target, ChevronLeft, User,
  Video, UserCheck, UserX, CalendarClock, Link2, Inbox, Info, Crown, Save, Image, MessageSquareReply, Send,
  Download, Eye, EyeOff, Lightbulb, MessageCircle, ClipboardCheck, RefreshCw,
  Images, Camera, Film, MapPin,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';
import ProfileEditsPanel from '../components/ProfileEditsPanel';
import SiteEditsPanel from '../components/SiteEditsPanel';
import EditsHistoryPanel from '../components/EditsHistoryPanel';
import ProfileSettings from '../components/ProfileSettings';
import UserAvatar from '../components/UserAvatar';
import BarChart, { DonutChart, LineChart } from '../components/Charts';
import RequiredMark from '../components/RequiredMark';
import ManagedFileField from '../components/ManagedFileField';
import GuideSuggestionsPanel from '../components/GuideSuggestionsPanel';
import InternalTaskCreationPanel from '../components/InternalTaskCreationPanel';
import ExcuseReviewPanel from '../components/ExcuseReviewPanel';
import OversightEvaluationPanel from '../components/OversightEvaluationPanel';
import MemberPointsAdminPanel from '../components/MemberPointsAdminPanel';
import TaskManagementDashboard from '../components/TaskManagementDashboard';
import { SidebarLayout } from '../components/SidebarLayout';
import SiteBrandingPanel from '../components/SiteBrandingPanel';
import TransientToast, { type ToastMessage } from '../components/TransientToast';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { buildTransferConfirmation, runTransferWithBusyState } from '../domain/executiveTransfer';
import { buildRevocationConfirmation, getOfficeName, type ExecutiveRole } from '../domain/executiveRevocation';
import { canAccessContactInbox, canRetryContactEmail } from '../domain/contactMessagingPolicy';
import { canManageGuideSuggestions } from '../domain/guideSuggestionPolicy';
import type { ManagedAssetReference } from '../services/managedAssetService';
import type {
  ApplicationEmailEventType,
  ApplicationEmailNotification,
} from '../domain/applicationEmailNotification';
import type { ActivityType } from '../domain/internalEconomyTypes.ts';
import { toDateTimeLocalValue } from '../domain/internalEconomyInteraction.ts';
import { canCreateExecutiveContent, canManageExcuses, canManageMemberPoints, canManageOversight, canManageTasks } from '../domain/phaseThreeEconomy.ts';

import {
  categoryLabels, categoryColors, applicationStatusLabels, applicationStatusColors,
  type EventCategory, type UEvent, type StudentApplication, type InterviewInfo,
  type CommitteeMember, type CommitteeId, type Suggestion, type SuggestionStatus, type SuggestionTargetRole,
  ROLE_LABEL, LEADERSHIP_ROLES, type UserRole,
  isLeadershipRole,
  SUGGESTION_TARGET_LABEL, SUGGESTION_STATUS_LABEL,
  type NewsItem, type SiteEditDiff,
  type GalleryAlbum, type GalleryCategory, type GalleryMedia,
} from '../data/mockData';

type AdminTab = 'stats' | 'board' | 'pending-edits' | 'site-pending' | 'branding' | 'history' | 'events' | 'gallery' | 'news' | 'members' | 'applications' | 'inbox' | 'plans' | 'suggestions' | 'guide-suggestions' | 'excuses' | 'oversight' | 'task-management' | 'member-points' | 'profile';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>('stats');
  const {
    events, students, plans, setPlans, reports, contactMessages,
    contactMessagesLoading, contactMessagesError, markContactMessageRead, replyToContactMessage, retryContactReplyEmail,
    applications, scheduleInterview, decideApplication,
    applicationEmailNotifications, retryApplicationEmailNotification,
    canEditSection, currentUser, respondToSuggestion,
    getVisibleSuggestions, canRespondToSuggestion,
    committees, setCommittees, transferMemberRole, revokeExecutiveAssignment, removeMember,
    members, setMembers,
    updateBoardHead,
    getRoleHolder,
    setReports,
    news, submitSiteEdit,
    galleryAlbums, setGalleryAlbums, galleryCategories,
    authInitializing, identityRefreshing,
  } = useApp();

  const tabs: { id: AdminTab; label: string; icon: typeof BarChart3; show: boolean }[] = [
    { id: 'stats', label: 'الإحصائيات', icon: BarChart3, show: !!currentUser && isLeadershipRole(currentUser.role) },
    { id: 'board', label: 'الهيئة التنفيذية', icon: Crown, show: canEditSection('board') },
    { id: 'pending-edits', label: 'طلبات تعديل الهيئة', icon: ClipboardCheck, show: currentUser?.role === 'PRESIDENT' },
    { id: 'site-pending', label: 'مراجعة تعديلات الموقع', icon: ClipboardCheck, show: currentUser?.role === 'PRESIDENT' },
    { id: 'branding', label: 'هوية المنصة', icon: Image, show: currentUser?.role === 'PRESIDENT' },
    { id: 'history', label: 'سجل التعديلات والقرارات', icon: FileText, show: !!currentUser && isLeadershipRole(currentUser.role) },
    { id: 'events', label: 'إدارة الفعاليات والبرامج', icon: CalendarDays, show: !!currentUser && isLeadershipRole(currentUser.role) },
    { id: 'gallery', label: 'إدارة معرض الصور', icon: Images, show: !!currentUser && isLeadershipRole(currentUser.role) },
    { id: 'news', label: 'إدارة الأخبار', icon: FileText, show: canEditSection('news') },
    { id: 'members', label: 'إدارة الأعضاء', icon: Users, show: currentUser?.role === 'PRESIDENT' },
    { id: 'applications', label: 'طلبات الانضمام', icon: Inbox, show: currentUser?.role === 'PRESIDENT' },
    { id: 'inbox', label: 'رسائل الزوار / البريد الوارد', icon: Mail, show: canAccessContactInbox(currentUser?.role) },
    { id: 'plans', label: 'الخطط والتقارير', icon: ClipboardList, show: canEditSection('plans') },
    { id: 'suggestions', label: 'الاقتراحات والشكاوى', icon: Lightbulb, show: !!currentUser && isLeadershipRole(currentUser.role) },
    { id: 'guide-suggestions', label: 'اقتراحات الدليل', icon: GraduationCap, show: canManageGuideSuggestions(currentUser?.role) },
    { id: 'excuses', label: 'إدارة الأعذار', icon: ClipboardCheck, show: canManageExcuses(currentUser?.role) },
    { id: 'oversight', label: 'الرقابة والتحضير', icon: UserCheck, show: canManageOversight(currentUser?.role) },
    { id: 'task-management', label: 'إدارة المهام', icon: ClipboardList, show: canManageTasks(currentUser?.role) },
    { id: 'member-points', label: 'نقاط الأعضاء', icon: Target, show: canManageMemberPoints(currentUser?.role) },
    { id: 'profile', label: 'الملف الشخصي', icon: User, show: !!currentUser && isLeadershipRole(currentUser.role) },
  ];

  const adminTabLabels: Record<AdminTab, string> = {
    stats: t('admin.tabs.stats', 'الإحصائيات'),
    board: t('admin.tabs.board', 'الهيئة التنفيذية'),
    'pending-edits': t('admin.tabs.pendingEdits', 'طلبات تعديل الهيئة'),
    'site-pending': t('admin.tabs.sitePending', 'مراجعة تعديلات الموقع'),
    branding: t('admin.tabs.branding', 'هوية المنصة'),
    history: t('admin.tabs.history', 'سجل التعديلات والقرارات'),
    events: t('admin.tabs.events', 'إدارة الفعاليات والبرامج'),
    gallery: t('admin.tabs.gallery', 'إدارة معرض الصور'),
    news: t('admin.tabs.news', 'إدارة الأخبار'),
    members: t('admin.tabs.members', 'إدارة الأعضاء'),
    applications: t('admin.tabs.applications', 'طلبات الانضمام'),
    inbox: t('admin.tabs.inbox', 'رسائل الزوار / البريد الوارد'),
    plans: t('admin.tabs.plans', 'الخطط والتقارير'),
    suggestions: t('admin.tabs.suggestions', 'الاقتراحات والشكاوى'),
    'guide-suggestions': t('admin.tabs.guideSuggestions', 'اقتراحات الدليل'),
    excuses: t('admin.tabs.excuses', 'إدارة الأعذار'),
    oversight: t('admin.tabs.oversight', 'الرقابة والتحضير'),
    'task-management': t('admin.tabs.taskManagement', 'إدارة المهام'),
    'member-points': t('admin.tabs.memberPoints', 'نقاط الأعضاء'),
    profile: t('admin.tabs.profile', 'الملف الشخصي'),
  };

  const visibleTabs = tabs
    .filter((t) => t.show)
    .map((tabItem) => ({
      ...tabItem,
      label: adminTabLabels[tabItem.id] ?? tabItem.label,
    }));

  useEffect(() => {
    if (authInitializing || identityRefreshing) return;
    if (!visibleTabs.some((visibleTab) => visibleTab.id === tab)) {
      setTab(visibleTabs[0]?.id ?? 'stats');
    }
  }, [authInitializing, identityRefreshing, tab, visibleTabs]);

  return (
    <div className="h-screen overflow-hidden bg-gray-50 pt-16 lg:pt-20">
      <SidebarLayout
        items={visibleTabs}
        activeId={tab}
        onSelect={setTab}
        title={t('admin.sidebarTitle', 'أقسام الإدارة')}
      >
        <div className="container-app py-8">
          {tab === 'stats' && <StatsTab events={events} students={students} suggestions={getVisibleSuggestions()} contactMessages={contactMessages} applications={applications} currentUser={currentUser} respondToSuggestion={respondToSuggestion} canRespondToSuggestion={canRespondToSuggestion} />}
          {tab === 'board' && canEditSection('board') && <BoardTab committees={committees} setCommittees={setCommittees} students={students} currentUser={currentUser} updateBoardHead={updateBoardHead} setMembers={setMembers} />}
          {tab === 'pending-edits' && currentUser?.role === 'PRESIDENT' && (
            <div className="card p-6">
              <ProfileEditsPanel />
            </div>
          )}
          {tab === 'site-pending' && currentUser?.role === 'PRESIDENT' && (
            <div className="card p-6">
              <SiteEditsPanel />
            </div>
          )}
          {tab === 'branding' && currentUser?.role === 'PRESIDENT' && <SiteBrandingPanel />}
          {tab === 'history' && currentUser && isLeadershipRole(currentUser.role) && <EditsHistoryPanel />}
          {tab === 'events' && currentUser && isLeadershipRole(currentUser.role) && <EventsTab events={events} currentUser={currentUser} />}
          {tab === 'gallery' && currentUser && isLeadershipRole(currentUser.role) && <GalleryTab galleryAlbums={galleryAlbums} setGalleryAlbums={setGalleryAlbums} galleryCategories={galleryCategories} currentUser={currentUser} />}
          {tab === 'news' && canEditSection('news') && <NewsTab news={news} currentUser={currentUser} submitSiteEdit={submitSiteEdit} />}
          {tab === 'members' && currentUser?.role === 'PRESIDENT' && <MembersTab members={members} currentUser={currentUser} transferMemberRole={transferMemberRole} revokeExecutiveAssignment={revokeExecutiveAssignment} getRoleHolder={getRoleHolder} removeMember={removeMember} />}
          {tab === 'applications' && (
            <ApplicationsTab
              applications={applications}
              scheduleInterview={scheduleInterview}
              decideApplication={decideApplication}
              applicationEmailNotifications={applicationEmailNotifications}
              retryApplicationEmailNotification={retryApplicationEmailNotification}
            />
          )}
          {tab === 'inbox' && canAccessContactInbox(currentUser?.role) && (
            <ContactInboxTab
              messages={contactMessages}
              loading={contactMessagesLoading}
              error={contactMessagesError}
              markRead={markContactMessageRead}
              reply={replyToContactMessage}
              retryEmail={retryContactReplyEmail}
            />
          )}
          {tab === 'plans' && canEditSection('plans') && <PlansTab plans={plans} setPlans={setPlans} reports={reports} setReports={setReports} currentUser={currentUser} />}
          {tab === 'suggestions' && currentUser && isLeadershipRole(currentUser.role) && <SuggestionsTab suggestions={getVisibleSuggestions()} currentUser={currentUser} respondToSuggestion={respondToSuggestion} canRespondToSuggestion={canRespondToSuggestion} />}
          {tab === 'guide-suggestions' && canManageGuideSuggestions(currentUser?.role) && <GuideSuggestionsPanel role={currentUser?.role} />}
          {tab === 'excuses' && canManageExcuses(currentUser?.role) && <ExcuseReviewPanel />}
          {tab === 'oversight' && canManageOversight(currentUser?.role) && <OversightEvaluationPanel />}
          {tab === 'task-management' && canManageTasks(currentUser?.role) && <TaskManagementDashboard />}
          {tab === 'member-points' && currentUser && canManageMemberPoints(currentUser.role) && <MemberPointsAdminPanel role={currentUser.role} />}
          {tab === 'profile' && currentUser && isLeadershipRole(currentUser.role) && <ProfileTab currentUser={currentUser} />}
        </div>
      </SidebarLayout>
    </div>
  );
}

/* ---------------- Contact inbox ---------------- */
function ContactInboxTab({ messages, loading, error, markRead, reply, retryEmail }: {
  messages: ReturnType<typeof useApp>['contactMessages'];
  loading: boolean;
  error: string | null;
  markRead: ReturnType<typeof useApp>['markContactMessageRead'];
  reply: ReturnType<typeof useApp>['replyToContactMessage'];
  retryEmail: ReturnType<typeof useApp>['retryContactReplyEmail'];
}) {
  const [activeId, setActiveId] = useState<string | null>(messages[0]?.id ?? null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'warning'; text: string } | null>(null);
  const active = messages.find((message) => message.id === activeId) ?? messages[0] ?? null;

  useEffect(() => {
    if (!activeId || !messages.some((message) => message.id === activeId)) setActiveId(messages[0]?.id ?? null);
  }, [activeId, messages]);

  const openMessage = async (messageId: string) => {
    setActiveId(messageId);
    setReplyText('');
    setFeedback(null);
    const selected = messages.find((message) => message.id === messageId);
    if (selected?.status === 'UNREAD') await markRead(messageId);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || active.reply || replyText.trim().length < 2) return;
    setBusy(true);
    setFeedback(null);
    const result = await reply(active.id, replyText.trim());
    setBusy(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', text: result.error ?? 'تعذر حفظ الرد.' });
      return;
    }
    setReplyText('');
    setFeedback(result.emailWarning
      ? { kind: 'warning', text: result.emailWarning }
      : { kind: 'ok', text: 'تم حفظ الرد وإرساله بنجاح.' });
  };

  const retryDelivery = async () => {
    if (!active?.reply || active.reply.deliveryChannel !== 'EMAIL') return;
    setBusy(true);
    setFeedback(null);
    const result = await retryEmail(active.reply.id);
    setBusy(false);
    setFeedback(result.ok
      ? { kind: 'ok', text: 'تم إرسال البريد وتحديث سجل التسليم.' }
      : { kind: 'error', text: result.error ?? 'تعذر إعادة إرسال البريد.' });
  };

  const statusLabel = (status: string) => status === 'UNREAD' ? 'غير مقروءة' : status === 'READ' ? 'قيد الانتظار' : 'تم الرد';
  const deliveryLabel = (status: string) => ({
    NOT_REQUIRED: 'ظهر للطالب داخل البوابة', PENDING: 'بانتظار إرسال البريد', SENT: 'أُرسل بالبريد', FAILED: 'تعذر إرسال البريد',
  }[status] ?? status);
  const formatDate = (value: string) => new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  if (loading) return <div className="card p-10 text-center text-sm text-gray-500">جاري تحميل البريد الوارد...</div>;
  if (error) return <div className="card border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div>;
  if (!messages.length) return <div className="card p-10 text-center"><Inbox className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 text-gray-500">لا توجد رسائل واردة بعد.</p></div>;

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="card max-h-[680px] overflow-y-auto p-2">
        {messages.map((message) => (
          <button
            key={message.id}
            type="button"
            onClick={() => { void openMessage(message.id); }}
            className={`mb-1 w-full rounded-xl p-3 text-right transition-colors ${active?.id === message.id ? 'bg-navy-800 text-white' : 'hover:bg-gray-50'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold">{message.senderName}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${active?.id === message.id ? 'bg-white/15 text-white' : message.status === 'UNREAD' ? 'bg-gold-100 text-gold-700' : message.status === 'REPLIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{statusLabel(message.status)}</span>
            </div>
            <p className={`mt-1 truncate text-xs font-semibold ${active?.id === message.id ? 'text-gray-200' : 'text-gray-600'}`}>{message.subject}</p>
            <p className={`mt-1 text-[10px] ${active?.id === message.id ? 'text-gray-300' : 'text-gray-400'}`}>{formatDate(message.createdAt)}</p>
          </button>
        ))}
      </div>

      {active && (
        <div className="card space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-xl font-extrabold text-navy-900">{active.subject}</h2>
              <p className="mt-1 text-sm text-gray-600">{active.senderName} · <a className="text-sky-700 hover:underline" href={`mailto:${active.senderEmail}`}>{active.senderEmail}</a></p>
            </div>
            <span className="text-xs text-gray-400">{formatDate(active.createdAt)}</span>
          </div>
          <div className="whitespace-pre-wrap rounded-2xl bg-gray-50 p-5 text-sm leading-7 text-gray-800">{active.message}</div>

          {active.reply ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> تم الرد</div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-800">{active.reply.replyText}</p>
              <div className="mt-4 border-t border-emerald-200 pt-3 text-xs text-emerald-800">
                ردّ بواسطة: <strong>{active.reply.repliedByName}</strong> ({ROLE_LABEL[active.reply.repliedByRole]}) · {formatDate(active.reply.repliedAt)}
                <span className="mt-1 block">حالة التسليم: {deliveryLabel(active.reply.deliveryStatus)}</span>
                {canRetryContactEmail(active.reply) && (
                  <button type="button" disabled={busy} onClick={() => { void retryDelivery(); }} className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-bold text-emerald-800 disabled:opacity-50">
                    <RefreshCw className={`ml-1 inline h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> إعادة إرسال البريد
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={sendReply} className="space-y-3 rounded-2xl border border-gray-200 p-5">
              <label className="label-field">الرد الإداري داخل الموقع</label>
              <textarea rows={6} value={replyText} onChange={(e) => setReplyText(e.target.value)} className="input-field resize-none" placeholder="اكتب الرد الواضح للطالب أو الزائر..." />
              <button type="submit" disabled={busy || replyText.trim().length < 2} className="btn-primary disabled:opacity-50">
                <Send className="h-4 w-4" /> {busy ? 'جاري حفظ الرد...' : 'إرسال الرد'}
              </button>
            </form>
          )}

          {feedback && <div className={`rounded-xl p-3 text-sm font-semibold ${feedback.kind === 'error' ? 'bg-red-50 text-red-700' : feedback.kind === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{feedback.text}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Stats Tab ---------------- */
function StatsTab({ events, students, suggestions, contactMessages, applications, currentUser, respondToSuggestion, canRespondToSuggestion }: {
  events: UEvent[]; students: ReturnType<typeof useApp>['students'];
  suggestions: ReturnType<typeof useApp>['suggestions'];
  contactMessages: ReturnType<typeof useApp>['contactMessages'];
  applications: StudentApplication[];
  currentUser: ReturnType<typeof useApp>['currentUser'];
  respondToSuggestion: ReturnType<typeof useApp>['respondToSuggestion'];
  canRespondToSuggestion: ReturnType<typeof useApp>['canRespondToSuggestion'];
}) {
  const { t } = useTranslation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [status, setStatus] = useState<SuggestionStatus>('reviewing');
  const [replyText, setReplyText] = useState('');
  const [toast, setToast] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const activeStudents = students.filter((s) => s.status === 'active').length;
  const upcoming = events.filter((e) => e.status === 'upcoming').length;
  const pendingApps = applications.filter((a) => a.status === 'pending' || a.status === 'interview').length;
  const visibleContactMessages = canAccessContactInbox(currentUser?.role)
    ? contactMessages
    : [];

  const catColors: Record<EventCategory, string> = {
    workshop: '#1e3454', lecture: '#d49a24', volunteer: '#10b981',
    training: '#0ea5e9', trip: '#f43f5e', entertainment: '#8b5cf6', visit: '#ec4899',
  };
  const catData = (Object.keys(categoryLabels) as EventCategory[]).map((c) => ({
    label: categoryLabels[c],
    value: events.filter((e) => e.category === c).length,
    color: catColors[c],
  })).filter((d) => d.value > 0);

  const monthlyData = useMemo(() => {
    const months = [
      { key: 0, label: 'ينا' }, { key: 1, label: 'فبر' }, { key: 2, label: 'مار' },
      { key: 3, label: 'أبر' }, { key: 4, label: 'ماي' }, { key: 5, label: 'يون' },
      { key: 6, label: 'يول' }, { key: 7, label: 'أغس' }, { key: 8, label: 'سبت' },
      { key: 9, label: 'أكت' }, { key: 10, label: 'نوف' }, { key: 11, label: 'ديس' },
    ];
    const now = new Date();
    const curMonth = now.getMonth();
    const last6 = [4, 5, 6, 7, 8, 9].map((back) => (curMonth - back + 12) % 12);
    return last6.reverse().map((m) => {
      const monthLabel = months[m].label;
      const joiners = students.filter((s) => {
        const d = new Date(s.joinedAt);
        return d.getMonth() === m && d.getFullYear() === now.getFullYear();
      }).length;
      const registrants = events
        .filter((e) => { const d = new Date(e.date); return d.getMonth() === m && d.getFullYear() === now.getFullYear(); })
        .reduce((sum, e) => sum + e.registered, 0);
      return { label: monthLabel, value: joiners + registrants };
    });
  }, [students, events]);

  const openSuggestion = (s: Suggestion) => {
    setActiveSuggestion(s);
    setStatus(s.status === 'new' ? 'reviewing' : s.status === 'reviewing' ? 'reviewing' : s.status);
    setReplyText('');
    setReplyOpen(true);
  };

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSuggestion) return;
    if (!validateRequired({ replyText }, ['replyText'], setInvalid)) return;
    const ok = respondToSuggestion(activeSuggestion.id, replyText.trim(), status);
    setReplyOpen(false);
    if (ok) {
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    }
  };

  const roleLabels: Record<string, string> = {
    PRESIDENT: t('roles.unionPresident', 'رئيس الاتحاد'),
    VICE_PRESIDENT: t('roles.vicePresident', 'نائب الرئيس'),
    COMMITTEE_HEAD: t('roles.committeeHead', 'مسؤول لجنة'),
    STUDENT: t('roles.student', 'طالب'),
    MEMBER: t('roles.member', 'عضو'),
  };
  const roleLabel = currentUser ? (roleLabels[currentUser.role] || ROLE_LABEL[currentUser.role]) : t('admin.boardMemberDefault', 'عضو الهيئة');
  const committeeLabel: Record<string, string> = {
    presidency: t('admin.committees.presidency', 'رئاسة الاتحاد'),
    'vice-presidency': t('admin.committees.vicePresidency', 'نائب الرئيس'),
    media: t('admin.committees.media', 'اللجنة الإعلامية'),
    academic: t('admin.committees.academic', 'اللجنة الأكاديمية'),
    supervisory: t('admin.committees.supervisory', 'اللجنة الرقابية'),
    activities: t('admin.committees.activities', 'لجنة الأنشطة'),
    finance: t('admin.committees.finance', 'اللجنة المالية'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-600">
            <LayoutDashboard className="h-4 w-4" />
            {t('admin.badge', 'لوحة الإدارة')}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-900 lg:text-3xl">{t('admin.title', 'لوحة تحكم الإدارة')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('admin.subtitle', 'إدارة الفعاليات والأعضاء والخطط والتقارير.')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <UserAvatar
            name={currentUser?.name}
            photo={currentUser?.photo}
            avatarPath={currentUser?.avatarPath}
            updatedAt={currentUser?.updatedAt}
            className="h-8 w-8"
            fallbackClassName="bg-navy-800 text-xs text-white"
          />
          <div>
            <div className="font-bold text-navy-900">{currentUser?.name || t('admin.defaultAdminName', 'مدير الاتحاد')}</div>
            <div className="text-xs text-gray-400">{roleLabel} · {currentUser?.email || '—'}</div>
          </div>
        </div>
      </div>

      {/* Permission info for committee heads */}
      {currentUser && isLeadershipRole(currentUser.role) && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          <Info className="h-4 w-4" />
          <span className="font-semibold">{t('admin.permissionsLabel', 'صلاحياتك:')}</span>
          <span>{currentUser.committee ? t('admin.committeePermissionNotice', 'يمكنك التعديل والإضافة في الأقسام المخصصة لـ {{committee}} فقط.', { committee: committeeLabel[currentUser.committee] ?? currentUser.committee }) : t('admin.fullPermissionNotice', 'يمكنك إدارة الاتحاد بالكامل.')}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, label: t('admin.stats.totalStudents', 'إجمالي الطلاب'), value: students.length, color: 'bg-navy-800' },
          { icon: CheckCircle2, label: t('admin.stats.activeStudents', 'طلاب نشطون'), value: activeStudents, color: 'bg-emerald-600' },
          { icon: CalendarDays, label: t('admin.stats.upcomingEvents', 'فعاليات قادمة'), value: upcoming, color: 'bg-gold-500' },
          { icon: Inbox, label: t('admin.stats.pendingApplications', 'طلبات قيد المراجعة'), value: pendingApps, color: 'bg-sky-600' },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="card p-5">
              <div className="flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${k.color} text-white`}>
                  <Icon className="h-5 w-5" />
                </div>
                <ChevronLeft className="h-5 w-5 text-gray-300" />
              </div>
              <div className="mt-4 text-3xl font-extrabold text-navy-900">{k.value.toLocaleString('ar-EG')}</div>
              <div className="text-sm text-gray-500">{k.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-navy-900">
              <BarChart3 className="h-5 w-5 text-navy-600" /> {t('admin.stats.growthTitle', 'نمو التسجيلات والمشاركات (آخر 6 أشهر)')}
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{t('admin.stats.liveBadge', 'مباشر')}</span>
          </div>
          <LineChart data={monthlyData} height={220} />
        </div>
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-navy-900">
            <PieChart className="h-5 w-5 text-navy-600" /> {t('admin.stats.eventDistribution', 'توزيع الفعاليات')}
          </h3>
          {catData.length > 0 ? (
            <DonutChart data={catData} />
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">{t('admin.stats.noEventsYet', 'لا فعاليات مضافة بعد.')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-navy-900">
            <BarChart3 className="h-5 w-5 text-navy-600" /> {t('admin.stats.participationByCategory', 'المشاركة حسب نوع الفعالية')}
          </h3>
          <BarChart
            data={(Object.keys(categoryLabels) as EventCategory[]).map((c) => ({
              label: categoryLabels[c],
              value: events.filter((e) => e.category === c).reduce((s, e) => s + e.registered, 0),
              color: catColors[c],
            }))}
            height={200}
          />
        </div>
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-navy-900">
            <Clock className="h-5 w-5 text-navy-600" /> {t('admin.stats.recentSuggestionsAndMessages', 'آخر الاقتراحات والرسائل')}
          </h3>
          <div className="space-y-3">
            {(!suggestions || suggestions.length === 0) && visibleContactMessages.length === 0 ? (
              <div className="py-8 text-center">
                <Inbox className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">{t('admin.stats.noSuggestionsOrMessages', 'لا توجد اقتراحات أو رسائل حالية.')}</p>
              </div>
            ) : (
              <>
                {(!suggestions || suggestions.length === 0) ? (
                  <p className="text-sm text-gray-400">{t('admin.stats.noSuggestions', 'لا توجد اقتراحات حالية.')}</p>
                ) : (
                  suggestions.slice(0, 4).map((s) => (
                <button
                  key={s?.id ?? Math.random()}
                  onClick={() => openSuggestion(s)}
                  className="flex w-full items-start gap-3 rounded-xl border border-gray-100 p-3 text-right transition-colors hover:border-navy-200 hover:bg-navy-50"
                >
                  <UserAvatar name={s?.studentName} className="h-8 w-8" fallbackClassName="bg-navy-50 text-xs text-navy-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-bold text-navy-900">{s?.title ?? t('admin.stats.noTitle', 'بدون عنوان')}</div>
                      {s && s.responses.length > 0 && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{t('status.replied', 'تم الرد')}</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-gray-500">{s?.content ?? ''}</div>
                  </div>
                </button>
              ))
                )}
            {visibleContactMessages.length === 0 ? (
              <p className="text-sm text-gray-400">{t('admin.stats.noNewMessages', 'لا رسائل جديدة.')}</p>
            ) : (
              visibleContactMessages.slice(0, 2).map((m) => (
                <div key={m?.id ?? Math.random()} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                  <Mail className="h-4 w-4 shrink-0 text-navy-500 mt-0.5" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-navy-900">{m?.subject ?? t('admin.stats.noSubject', 'بدون موضوع')}</div>
                    <div className="truncate text-xs text-gray-500">{m?.senderName ?? ''} - {m?.message ?? ''}</div>
                  </div>
                </div>
              ))
            )}
              </>
            )}
          </div>
        </div>
      </div>

      <SuggestionReplyModal
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        suggestion={activeSuggestion}
        currentUser={currentUser}
        canReply={activeSuggestion ? canRespondToSuggestion(activeSuggestion) : false}
        status={status}
        setStatus={setStatus}
        replyText={replyText}
        setReplyText={setReplyText}
        invalid={invalid}
        setInvalid={setInvalid}
        onSubmit={submitReply}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 animate-slide-up rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 className="ml-2 inline h-4 w-4" />
          {t('admin.stats.replyToast', 'تم إرسال الرد وتحديث حالة الاقتراح')}
        </div>
      )}
    </div>
  );
}

/* ---------------- Suggestions & Feedback Tab (targeted RBAC) ---------------- */
function SuggestionsTab({ suggestions, currentUser, respondToSuggestion, canRespondToSuggestion }: {
  suggestions: ReturnType<typeof useApp>['suggestions'];
  currentUser: NonNullable<ReturnType<typeof useApp>['currentUser']>;
  respondToSuggestion: ReturnType<typeof useApp>['respondToSuggestion'];
  canRespondToSuggestion: ReturnType<typeof useApp>['canRespondToSuggestion'];
}) {
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [status, setStatus] = useState<SuggestionStatus>('reviewing');
  const [replyText, setReplyText] = useState('');
  const [toast, setToast] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | SuggestionStatus>('all');

  const isPresident = currentUser.role === 'PRESIDENT';
  const filtered = statusFilter === 'all' ? suggestions : suggestions.filter((s) => s.status === statusFilter);

  const statusFilters: { id: 'all' | SuggestionStatus; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'new', label: 'جديد' },
    { id: 'reviewing', label: 'قيد المراجعة' },
    { id: 'implemented', label: 'تم الإجراء' },
    { id: 'closed', label: 'مغلق' },
  ];

  const openSuggestion = (s: Suggestion) => {
    setActiveSuggestion(s);
    setStatus(s.status === 'new' ? 'reviewing' : s.status);
    setReplyText('');
    setReplyOpen(true);
  };

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSuggestion) return;
    if (!validateRequired({ replyText }, ['replyText'], setInvalid)) return;
    const ok = respondToSuggestion(activeSuggestion.id, replyText.trim(), status);
    if (ok) {
      setReplyOpen(false);
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-navy-900">
            <Lightbulb className="h-5 w-5 text-gold-500" />
            الاقتراحات والشكاوى
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{suggestions.length}</span>
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {isPresident
              ? 'تظهر لك جميع الاقتراحات الموجهة لجميع الجهات مع شارة الوجهة.'
              : `تظهر لك الاقتراحات الموجهة إلى ${SUGGESTION_TARGET_LABEL[currentUser.role as SuggestionTargetRole]} فقط.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {statusFilters.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
              statusFilter === f.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <MessageCircle className="h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm font-bold text-navy-900">لا توجد اقتراحات هنا</p>
          <p className="mt-1 text-sm text-gray-500">
            {isPresident ? 'لم تصل أي اقتراحات حتى الآن.' : 'لم تصل اقتراحات موجهة إلى جهتك بعد.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const canReply = canRespondToSuggestion(s);
            return (
              <button
                key={s.id}
                onClick={() => openSuggestion(s)}
                className="card block w-full p-5 text-right transition-colors hover:border-navy-200 hover:bg-navy-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      s.targetRole === currentUser.role || isPresident ? 'bg-gold-50 text-gold-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      موجّه إلى: {SUGGESTION_TARGET_LABEL[s.targetRole]}
                    </span>
                    <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{s.category}</span>
                    <h4 className="truncate text-sm font-bold text-navy-900">{s.title}</h4>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.responses.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <MessageSquareReply className="h-3 w-3" /> {s.responses.length} رد
                      </span>
                    )}
                    <StatusPill status={s.status} />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{s.content}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                  <span>{s.studentName} · {s.createdAt}</span>
                  {canReply ? (
                    <span className="font-bold text-navy-700">يمكنك الرد</span>
                  ) : (
                    <span className="font-bold text-rose-500">عرض فقط — غير موجه لجهتك</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SuggestionReplyModal
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        suggestion={activeSuggestion}
        currentUser={currentUser}
        canReply={activeSuggestion ? canRespondToSuggestion(activeSuggestion) : false}
        status={status}
        setStatus={setStatus}
        replyText={replyText}
        setReplyText={setReplyText}
        invalid={invalid}
        setInvalid={setInvalid}
        onSubmit={submitReply}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 animate-slide-up rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 className="ml-2 inline h-4 w-4" />
          تم إرسال الرد وتحديث حالة الاقتراح
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const map: Record<SuggestionStatus, string> = {
    new: 'bg-sky-100 text-sky-700',
    reviewing: 'bg-gold-100 text-gold-700',
    implemented: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${map[status] ?? map.new}`}>
      {SUGGESTION_STATUS_LABEL[status]}
    </span>
  );
}

function SuggestionReplyModal({
  open, onClose, suggestion, currentUser, canReply, status, setStatus, replyText, setReplyText, invalid, setInvalid, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  suggestion: Suggestion | null;
  currentUser: ReturnType<typeof useApp>['currentUser'];
  canReply: boolean;
  status: SuggestionStatus;
  setStatus: (s: SuggestionStatus) => void;
  replyText: string;
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  invalid: string[];
  setInvalid: React.Dispatch<React.SetStateAction<string[]>>;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const statusOptions: { value: SuggestionStatus; label: string; color: string }[] = [
    { value: 'reviewing', label: 'قيد المراجعة', color: 'bg-gold-100 text-gold-700 border-gold-300' },
    { value: 'implemented', label: 'تم الإجراء', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'closed', label: 'مغلق', color: 'bg-rose-100 text-rose-700 border-rose-300' },
  ];
  const isPresident = currentUser?.role === 'PRESIDENT';
  return (
    <Modal open={open} onClose={onClose} title="تفاصيل الاقتراح والرد عليه" maxWidth="max-w-2xl">
      {!suggestion ? (
        <div className="py-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">لا توجد اقتراحات حالية.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <UserAvatar name={suggestion.studentName} className="h-12 w-12" fallbackClassName="bg-navy-100 text-lg text-navy-700" />
              <div>
                <div className="text-base font-bold text-navy-900">{suggestion.studentName ?? 'غير محدد'}</div>
                <div className="text-xs text-gray-500">{suggestion.createdAt ?? '—'}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                <span dir="ltr">{suggestion.studentEmail ?? 'غير محدد'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <GraduationCap className="h-4 w-4 text-gray-400" />
                {suggestion.studentUniversity ?? 'غير محدد'}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FileText className="h-4 w-4 text-gray-400" />
                {suggestion.studentMajor ?? 'غير محدد'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-xs font-bold text-gold-700">موجّه إلى: {SUGGESTION_TARGET_LABEL[suggestion.targetRole]}</span>
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{suggestion.category ?? 'عام'}</span>
            <StatusPill status={suggestion.status} />
            {isPresident && suggestion.targetRole !== 'PRESIDENT' && (
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700">إشراف رئيس الاتحاد</span>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">عنوان الاقتراح</div>
            <div className="text-sm font-bold text-navy-900">{suggestion.title ?? 'بدون عنوان'}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">النص الكامل</div>
            <p className="rounded-xl border border-gray-100 bg-white p-3 text-sm leading-relaxed text-gray-700">{suggestion.content ?? 'لا يوجد نص.'}</p>
          </div>

          {suggestion.responses.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">سجل الردود ({suggestion.responses.length})</div>
              <div className="space-y-3">
                {suggestion.responses.map((r) => (
                  <div key={r.id} className="rounded-xl border border-navy-100 bg-navy-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-navy-700">
                      <span className="flex items-center gap-2">
                        <MessageSquareReply className="h-4 w-4" />
                        {r.by} ({r.byRole})
                      </span>
                      <span className="text-gray-400">{r.at}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-navy-800">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!canReply ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600">
              هذا الاقتراح غير موجه إلى جهتك — يمكنك الاطلاع عليه دون حق الرد أو تغيير الحالة.
            </div>
          ) : suggestion.status === 'closed' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
              هذا الاقتراح مغلق — لا يمكن الرد عليه أو تغيير حالته.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 text-sm font-bold text-navy-800">
                <MessageSquareReply className="h-4 w-4" />
                الرد على الاقتراح وتحديث حالته
              </div>
              <div>
                <label className="label-field">حالة الاقتراح</label>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${status === opt.value ? opt.color : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label-field">نص الرد للطالب <RequiredMark /></label>
                <textarea
                  id={fieldId('replyText')}
                  rows={3}
                  value={replyText}
                  onChange={(e) => { setReplyText(e.target.value); clearInvalid(setInvalid, 'replyText'); }}
                  className={`${isInvalid(invalid, 'replyText') ? 'input-field-error' : 'input-field'} resize-none`}
                  placeholder="اكتب ردك الموجه للطالب هنا..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50">
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  <Send className="h-4 w-4" />
                  إرسال الرد وتحديث الحالة
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Board Management Tab ---------------- */
function BoardTab({ committees, setCommittees, students, currentUser, updateBoardHead, setMembers }: {
  committees: ReturnType<typeof useApp>['committees'];
  setCommittees: React.Dispatch<React.SetStateAction<ReturnType<typeof useApp>['committees']>>;
  students: ReturnType<typeof useApp>['students'];
  currentUser: ReturnType<typeof useApp>['currentUser'];
  updateBoardHead: ReturnType<typeof useApp>['updateBoardHead'];
  setMembers: React.Dispatch<React.SetStateAction<ReturnType<typeof useApp>['members']>>;
}) {
  const { uploadManagedFile, replaceManagedMemberAvatar, members: accountMembers } = useApp();
  const [memberModal, setMemberModal] = useState(false);
  const [editMember, setEditMember] = useState<{ committeeId: CommitteeId; member: CommitteeMember | null } | null>(null);
  const [memberForm, setMemberForm] = useState({ studentId: '', position: '', photo: '' });
  const [memberAvatarAsset, setMemberAvatarAsset] = useState<ManagedAssetReference | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);

  const [headModal, setHeadModal] = useState(false);
  const [headCommittee, setHeadCommittee] = useState<CommitteeId | null>(null);
  const [headForm, setHeadForm] = useState({ name: '', role: '', bio: '', photo: '', email: '', phone: '', university: '', major: '', year: '' });

  const [respModal, setRespModal] = useState(false);
  const [respTarget, setRespTarget] = useState<{ committeeId: CommitteeId; idx: number } | null>(null);
  const [respText, setRespText] = useState('');

  const [invalid, setInvalid] = useState<string[]>([]);

  const openAddMember = (committeeId: CommitteeId) => {
    setEditMember({ committeeId, member: null });
    setMemberForm({ studentId: '', position: '', photo: '' });
    setMemberAvatarAsset(null);
    setStudentSearch('');
    setStudentDropdownOpen(false);
    setMemberModal(true);
  };
  const openEditMember = (committeeId: CommitteeId, m: CommitteeMember) => {
    setEditMember({ committeeId, member: m });
    setMemberForm({ studentId: '', position: m.position, photo: m.photo });
    setMemberAvatarAsset(null);
    setStudentSearch(m.name);
    setStudentDropdownOpen(false);
    setMemberModal(true);
  };
  const resolveTargetUserId = () => {
    const selected = students.find((student) => student.id === memberForm.studentId);
    if (selected?.userId) return selected.userId;
    if (selected?.id && /^[0-9a-f-]{36}$/i.test(selected.id)) return selected.id;
    const editing = editMember?.member;
    const account = editing && accountMembers.find((member) => member.id === editing.id || member.name === editing.name);
    return account?.id ?? '';
  };
  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;
    const { committeeId, member } = editMember;
    try {
      const targetUserId = resolveTargetUserId();
      if (memberAvatarAsset) {
        if (!targetUserId) {
          alert('تعذر تحديد حساب العضو المرتبط بهذه الصورة. اختر عضواً مسجلاً في النظام.');
          return;
        }
        const currentAvatar = accountMembers.find((item) => item.id === targetUserId)?.photo ?? '';
        const expectedOldPath = currentAvatar.startsWith(`${targetUserId}/`) ? currentAvatar : null;
        const bound = await replaceManagedMemberAvatar(targetUserId, expectedOldPath, memberAvatarAsset);
        if (!bound.ok) {
          alert(bound.error.message);
          return;
        }
      }
      if (member) {
        if (!validateRequired(memberForm, ['position', 'photo'], setInvalid)) return;
        const photo = memberForm.photo || member.photo || '';
        setCommittees((prev) => prev.map((c) => {
          if (c.id !== committeeId) return c;
          const members = Array.isArray(c.members) ? c.members : [];
          return { ...c, members: members.map((m) => m.id === member.id ? { ...m, position: memberForm.position, photo } : m) };
        }));
      } else {
        if (!validateRequired(memberForm, ['studentId', 'position', 'photo'], setInvalid)) return;
        const student = students.find((s) => s.id === memberForm.studentId);
        if (!student) return;
        const photo = memberForm.photo;
        setCommittees((prev) => prev.map((c) => {
          if (c.id !== committeeId) return c;
          const members = Array.isArray(c.members) ? c.members : [];
          return { ...c, members: [...members, { id: 'cm' + Date.now(), name: student.name, position: memberForm.position || 'عضو', photo }] };
        }));
        setMembers((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((m) => (m.email ?? '').toLowerCase() === student.email.toLowerCase())) {
            return list.map((m) =>
              (m.email ?? '').toLowerCase() === student.email.toLowerCase()
                ? { ...m, committee: committeeId }
                : m
            );
          }
          return [
            {
              id: student.id,
              name: student.name,
              email: student.email,
              university: student.university ?? '—',
              major: student.major ?? '—',
              year: student.year ?? '—',
              phone: student.phone,
              photo,
              role: 'STUDENT' as UserRole,
              committee: committeeId,
              joinedAt: student.joinedAt ?? new Date().toISOString().slice(0, 10),
              status: 'active' as const,
            },
            ...list,
          ];
        });
      }
    } catch { /* ignore corrupted state */ }
    setMemberModal(false);
  };
  const removeMember = (committeeId: CommitteeId, memberId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا العضو؟')) return;
    setCommittees((prev) => prev.map((c) => c.id === committeeId ? { ...c, members: (Array.isArray(c.members) ? c.members : []).filter((m) => m.id !== memberId) } : c));
  };

  const openHead = (c: typeof committees[0]) => {
    if (c.head?.id !== currentUser?.userId) return;
    setHeadCommittee(c.id);
    setHeadForm({ name: c.head?.name ?? '', role: c.head?.role ?? '', bio: c.head?.bio ?? '', photo: c.head?.photo ?? '', email: currentUser.contactEmail ?? '', phone: c.head?.phone ?? '', university: c.head?.university ?? '', major: c.head?.major ?? '', year: c.head?.year ?? '' });
    setHeadModal(true);
  };
  const saveHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headCommittee) return;
    const target = committees.find((committee) => committee.id === headCommittee)?.head;
    if (!currentUser || target?.id !== currentUser.userId) return;
    if (!validateRequired(headForm, ['name', 'bio', 'email', 'phone', 'university', 'major', 'year'], setInvalid)) return;
    try {
      const result = await updateBoardHead(headCommittee, {
        name: headForm.name,
        bio: headForm.bio,
        email: headForm.email,
        phone: headForm.phone,
        university: headForm.university,
        major: headForm.major,
        year: headForm.year,
      });
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setHeadModal(false);
    } catch {
      alert('تعذر حفظ الملف الشخصي. حاول مرة أخرى.');
    }
  };

  const openAddResp = (committeeId: CommitteeId) => {
    setRespTarget({ committeeId, idx: -1 });
    setRespText('');
    setRespModal(true);
  };
  const openEditResp = (committeeId: CommitteeId, idx: number) => {
    const c = committees.find((x) => x.id === committeeId);
    setRespTarget({ committeeId, idx });
    setRespText(c?.responsibilities[idx] || '');
    setRespModal(true);
  };
  const saveResp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!respTarget) return;
    if (!validateRequired({ respText }, ['respText'], setInvalid)) return;
    const { committeeId, idx } = respTarget;
    setCommittees((prev) => prev.map((c) => {
      if (c.id !== committeeId) return c;
      const items = [...(Array.isArray(c.responsibilities) ? c.responsibilities : [])];
      if (idx >= 0) items[idx] = respText;
      else items.push(respText);
      return { ...c, responsibilities: items };
    }));
    setRespModal(false);
  };
  const removeResp = (committeeId: CommitteeId, idx: number) => {
    if (!confirm('حذف هذا البند؟')) return;
    setCommittees((prev) => prev.map((c) => c.id === committeeId ? { ...c, responsibilities: (Array.isArray(c.responsibilities) ? c.responsibilities : []).filter((_, i) => i !== idx) } : c));
  };

  return (
    <div className="space-y-6">
      {committees.map((c) => (
        <div key={c.id} className="card overflow-hidden">
          <div className={`bg-gradient-to-l ${c.color} p-5`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">{c.name}</h3>
              <button onClick={() => openAddMember(c.id)} className="flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30">
                <Plus className="h-4 w-4" /> إضافة عضو
              </button>
            </div>
          </div>
          <div className="p-5">
            {/* Head */}
            <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-gray-400">رئيس اللجنة / المسؤول</div>
                {c.head?.id === currentUser?.userId && (
                  <button onClick={() => openHead(c)} className="flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-100">
                    <Edit3 className="h-3.5 w-3.5" /> تعديل ملفي
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <UserAvatar name={c.head?.name} photo={c.head?.photo} avatarPath={c.head?.photo} updatedAt={c.head?.updatedAt} className="h-16 w-16" />
                <div className="flex-1 space-y-2">
                  <input type="text" value={c.head?.name ?? ''} readOnly className="input-field bg-gray-100 font-bold text-gray-600" placeholder="الاسم" />
                  <input type="text" value={c.head?.role ?? ''} readOnly className="input-field bg-gray-100 text-sm text-gray-500" placeholder="المسمى" />
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="email" dir="ltr" value={c.head?.id === currentUser?.userId ? currentUser.contactEmail : ''} readOnly className="input-field bg-gray-100 text-sm text-gray-500" placeholder="بريد التواصل غير معلن" />
                <input type="text" dir="ltr" value={c.head?.photo ?? ''} readOnly className="input-field bg-gray-100 text-sm text-gray-500" placeholder="تُدار الصورة من إعدادات الملف الشخصي" />
              </div>
              <textarea rows={2} value={c.head?.bio ?? ''} readOnly className="input-field mt-2 resize-none bg-gray-100 text-sm text-gray-600" placeholder="النبذة التعريفية" />
            </div>

            {/* Stats */}
            <div className="mb-4 rounded-xl border border-gray-100 p-4">
              <div className="mb-2 text-xs font-bold uppercase text-gray-400">الإحصائيات والعدادات</div>
              <div className="grid grid-cols-3 gap-2">
                {(Array.isArray(c.stats) ? c.stats : []).map((s, i) => (
                  <div key={i} className="rounded-lg bg-gray-50 p-2 text-center">
                    <input type="text" value={s.value} onChange={(e) => setCommittees((prev) => prev.map((x) => x.id === c.id ? { ...x, stats: (Array.isArray(x.stats) ? x.stats : []).map((st, j) => j === i ? { ...st, value: e.target.value } : st) } : x))} className="input-field mb-1 text-center text-sm font-bold" />
                    <input type="text" value={s.label} onChange={(e) => setCommittees((prev) => prev.map((x) => x.id === c.id ? { ...x, stats: (Array.isArray(x.stats) ? x.stats : []).map((st, j) => j === i ? { ...st, label: e.target.value } : st) } : x))} className="input-field text-center text-xs" />
                  </div>
                ))}
              </div>
            </div>

            {/* Responsibilities */}
            <div className="mb-4 rounded-xl border border-gray-100 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-gray-400">المهام والمسؤوليات</div>
                <button onClick={() => openAddResp(c.id)} className="flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-100">
                  <Plus className="h-3.5 w-3.5" /> إضافة بند
                </button>
              </div>
              <ul className="space-y-2">
                {(c.responsibilities || []).map((r, i) => (
                  <li key={i} className="group flex items-start gap-2 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
                    <span className="flex-1">{r}</span>
                    <button onClick={() => openEditResp(c.id, i)} className="flex h-6 w-6 items-center justify-center rounded-md text-navy-600 opacity-0 transition-opacity hover:bg-navy-100 group-hover:opacity-100" title="تعديل">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeResp(c.id, i)} className="flex h-6 w-6 items-center justify-center rounded-md text-rose-600 opacity-0 transition-opacity hover:bg-rose-100 group-hover:opacity-100" title="حذف">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {(!c.responsibilities || c.responsibilities.length === 0) && (
                  <li className="py-2 text-center text-xs text-gray-400">لا توجد مهام مضافة.</li>
                )}
              </ul>
            </div>

            {/* Members */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-gray-400">الأعضاء</div>
              {(c.members || []).map((m) => (
                <div key={m?.id ?? Math.random()} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50">
                  <UserAvatar name={m?.name} photo={m?.photo} avatarPath={m?.photo} className="h-10 w-10" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-navy-900">{m?.name ?? 'غير محدد'}</div>
                    <div className="text-xs text-gray-500">{m?.position ?? 'عضو'}</div>
                  </div>
                  <button onClick={() => openEditMember(c.id, m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50" title="تعديل">
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeMember(c.id, m?.id ?? '')} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" title="حذف">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {(!c.members || c.members.length === 0) && (
                <p className="py-4 text-center text-sm text-gray-400">لا يوجد أعضاء في هذه اللجنة.</p>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Member modal */}
      <Modal open={memberModal} onClose={() => setMemberModal(false)} title={editMember?.member ? 'تعديل عضو' : 'إضافة عضو جديد'} maxWidth="max-w-md">
        <form onSubmit={saveMember} className="space-y-4">
          <div>
            <label className="label-field">العضو *</label>
            {editMember?.member ? (
              <input type="text" value={editMember.member.name} disabled className="input-field bg-gray-50 text-gray-500" />
            ) : (
              <div className="relative">
                <input
                  id={fieldId('studentId')}
                  type="text"
                  value={studentSearch}
                  onChange={(e) => { setStudentSearch(e.target.value); setStudentDropdownOpen(true); setMemberForm((prev) => ({ ...prev, studentId: '' })); clearInvalid(setInvalid, 'studentId'); }}
                  onFocus={() => setStudentDropdownOpen(true)}
                  className={`${isInvalid(invalid, 'studentId') ? 'input-field-error' : 'input-field'}`}
                  placeholder="ابحث عن عضو مسجل..."
                />
                {studentDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {(students || [])
                      .filter((s) => (s?.name ?? '').includes(studentSearch) || (s?.email ?? '').toLowerCase().includes(studentSearch.toLowerCase()))
                      .slice(0, 8)
                      .map((s) => (
                        <button
                          key={s?.id ?? Math.random()}
                          type="button"
                          onClick={() => {
                            setMemberForm((prev) => ({ ...prev, studentId: s?.id ?? '' }));
                            setStudentSearch(s?.name ?? '');
                            setStudentDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-right transition-colors hover:bg-navy-50"
                        >
                          <UserAvatar name={s?.name} photo={s?.photo} avatarPath={s?.photo} className="h-7 w-7" fallbackClassName="bg-navy-100 text-xs text-navy-700" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-navy-900">{s?.name ?? 'غير محدد'}</div>
                            <div className="truncate text-xs text-gray-400" dir="ltr">{s?.email ?? ''}</div>
                          </div>
                        </button>
                      ))}
                    {(students || []).filter((s) => (s?.name ?? '').includes(studentSearch) || (s?.email ?? '').toLowerCase().includes(studentSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-3 text-center text-xs text-rose-600">هذا العضو غير مسجل في قائمة أعضاء الاتحاد</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="label-field">المسمى الوظيفي <RequiredMark /></label>
            <input id={fieldId('position')} type="text" value={memberForm.position} onChange={(e) => { setMemberForm({ ...memberForm, position: e.target.value }); clearInvalid(setInvalid, 'position'); }} className={`${isInvalid(invalid, 'position') ? 'input-field-error' : 'input-field'}`} placeholder="مثال: منسق، مستشار..." />
          </div>
          <ManagedFileField
            usage="avatar"
            label="الصورة الشخصية"
            currentUrl={memberForm.photo}
            required
            error={isInvalid(invalid, 'photo') ? 'يرجى رفع صورة شخصية قبل الحفظ.' : null}
            onUpload={(file, onProgress) => {
              const targetUserId = resolveTargetUserId();
              if (!targetUserId) {
                return Promise.resolve({
                  ok: false as const,
                  error: { code: 'MEMBER_ACCOUNT_REQUIRED', message: 'اختر عضواً مسجلاً قبل رفع الصورة.' },
                });
              }
              return uploadManagedFile('avatar', file, onProgress, targetUserId);
            }}
            onUploaded={(asset) => {
              setMemberForm((current) => ({ ...current, photo: asset.publicUrl }));
              setMemberAvatarAsset(asset);
              clearInvalid(setInvalid, 'photo');
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMemberModal(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> {editMember?.member ? 'حفظ التعديلات' : 'إضافة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Head modal */}
      <Modal open={headModal} onClose={() => setHeadModal(false)} title="تعديل بيانات المسؤول الكاملة" maxWidth="max-w-md">
        <form onSubmit={saveHead} className="space-y-4">
          <div>
            <label className="label-field">الاسم الكامل <RequiredMark /></label>
            <input id={fieldId('name')} className={`${isInvalid(invalid, 'name') ? 'input-field-error' : 'input-field'}`} value={headForm.name} onChange={(e) => { setHeadForm({ ...headForm, name: e.target.value }); clearInvalid(setInvalid, 'name'); }} />
          </div>
          <div>
            <label className="label-field">المسمى الوظيفي</label>
            <input id={fieldId('role')} readOnly className="input-field bg-gray-100 text-gray-500" value={headForm.role} />
          </div>
          <div>
            <label className="label-field">النبذة التعريفية <RequiredMark /></label>
            <textarea id={fieldId('bio')} rows={3} className={`${isInvalid(invalid, 'bio') ? 'input-field-error' : 'input-field'} resize-none`} value={headForm.bio} onChange={(e) => { setHeadForm({ ...headForm, bio: e.target.value }); clearInvalid(setInvalid, 'bio'); }} />
          </div>
          <div>
            <label className="label-field">الصورة الشخصية</label>
            <input id={fieldId('photo')} type="text" dir="ltr" className="input-field bg-gray-100 text-gray-500" value={headForm.photo} readOnly placeholder="غيّر الصورة من إعدادات الملف الشخصي" />
          </div>
          <div>
            <label className="label-field">البريد الإلكتروني الرسمي <RequiredMark /></label>
            <input id={fieldId('email')} type="email" dir="ltr" className={`${isInvalid(invalid, 'email') ? 'input-field-error' : 'input-field'}`} value={headForm.email} onChange={(e) => { setHeadForm({ ...headForm, email: e.target.value }); clearInvalid(setInvalid, 'email'); }} />
          </div>
          <div>
            <label className="label-field">رقم التواصل <RequiredMark /></label>
            <input id={fieldId('phone')} type="tel" dir="ltr" maxLength={11} className={`${isInvalid(invalid, 'phone') ? 'input-field-error' : 'input-field'}`} value={headForm.phone} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 11); setHeadForm({ ...headForm, phone: v }); clearInvalid(setInvalid, 'phone'); }} placeholder="05375922478" />
            <p className="mt-1.5 text-xs text-gray-400">يرجى كتابة الرقم كاملاً بدءاً بـ 05 (مثال: 05375922478)</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">الجامعة <RequiredMark /></label>
              <input id={fieldId('university')} className={`${isInvalid(invalid, 'university') ? 'input-field-error' : 'input-field'}`} value={headForm.university} onChange={(e) => { setHeadForm({ ...headForm, university: e.target.value }); clearInvalid(setInvalid, 'university'); }} placeholder="اسم الجامعة" />
            </div>
            <div>
              <label className="label-field">التخصص <RequiredMark /></label>
              <input id={fieldId('major')} className={`${isInvalid(invalid, 'major') ? 'input-field-error' : 'input-field'}`} value={headForm.major} onChange={(e) => { setHeadForm({ ...headForm, major: e.target.value }); clearInvalid(setInvalid, 'major'); }} placeholder="التخصص" />
            </div>
          </div>
          <div>
            <label className="label-field">السنة الدراسية <RequiredMark /></label>
            <select id={fieldId('year')} className={`${isInvalid(invalid, 'year') ? 'input-field-error' : 'input-field'}`} value={headForm.year} onChange={(e) => { setHeadForm({ ...headForm, year: e.target.value }); clearInvalid(setInvalid, 'year'); }}>
              <option value="">اختر السنة الدراسية...</option>
              <option>السنة الأولى</option>
              <option>السنة الثانية</option>
              <option>السنة الثالثة</option>
              <option>السنة الرابعة</option>
              <option>دراسات عليا</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setHeadModal(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> حفظ</button>
          </div>
        </form>
      </Modal>

      {/* Responsibility modal */}
      <Modal open={respModal} onClose={() => setRespModal(false)} title={respTarget?.idx && respTarget.idx >= 0 ? 'تعديل البند' : 'إضافة بند جديد'} maxWidth="max-w-md">
        <form onSubmit={saveResp} className="space-y-4">
          <div>
            <label className="label-field">نص البند <RequiredMark /></label>
            <textarea id={fieldId('respText')} rows={3} className={`${isInvalid(invalid, 'respText') ? 'input-field-error' : 'input-field'} resize-none`} value={respText} onChange={(e) => { setRespText(e.target.value); clearInvalid(setInvalid, 'respText'); }} placeholder="اكتب المهمة أو المسؤولية" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRespModal(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> حفظ</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

/* ---------------- Gallery Tab ---------------- */
function GalleryTab({ galleryAlbums, setGalleryAlbums, galleryCategories, currentUser }: {
  galleryAlbums: GalleryAlbum[];
  setGalleryAlbums: React.Dispatch<React.SetStateAction<GalleryAlbum[]>>;
  galleryCategories: GalleryCategory[];
  currentUser: ReturnType<typeof useApp>['currentUser'];
}) {
  const { uploadManagedFile, savePublishedSiteTarget } = useApp();
  // Scoped access: the president manages all albums; every other executive
  // member sees, adds, edits and deletes only the albums their role created
  // (`createdByRole == currentUser.role`).
  const isPresident = currentUser?.role === 'PRESIDENT';
  const visibleAlbums =
    isPresident || !currentUser
      ? galleryAlbums
      : galleryAlbums.filter((a) => a.createdByRole === currentUser.role);

  const [albumModalOpen, setAlbumModalOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<GalleryAlbum | null>(null);
  const [albumForm, setAlbumForm] = useState({
    title: '', categoryId: '', date: new Date().toISOString().slice(0, 10),
    location: '', coverImage: '', description: '',
  });

  const [mediaAlbum, setMediaAlbum] = useState<GalleryAlbum | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<GalleryMedia | null>(null);
  const [mediaForm, setMediaForm] = useState({
    type: 'photo' as 'photo' | 'video', source: 'upload' as 'upload' | 'external', url: '', thumbnail: '', caption: '', photoUrl: '',
  });

  const [invalid, setInvalid] = useState<string[]>([]);
  const catLabel = (id: string) => galleryCategories.find((c) => c.id === id)?.label ?? id;

  const openAddAlbum = () => {
    setEditingAlbum(null);
    setAlbumForm({
      title: '', categoryId: galleryCategories[0]?.id ?? '', date: new Date().toISOString().slice(0, 10),
      location: '', coverImage: '', description: '',
    });
    setAlbumModalOpen(true);
  };

  const openEditAlbum = (album: GalleryAlbum) => {
    setEditingAlbum(album);
    setAlbumForm({
      title: album.title, categoryId: album.categoryId, date: album.date,
      location: album.location, coverImage: album.coverImage, description: album.description,
    });
    setAlbumModalOpen(true);
  };

  const saveAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(albumForm, ['title', 'categoryId', 'date', 'location', 'coverImage', 'description'], setInvalid)) return;
    if (editingAlbum) {
      const next = galleryAlbums.map((a) => a.id === editingAlbum.id ? { ...a, ...albumForm } : a);
      if (isPresident) {
        const saved = await savePublishedSiteTarget('galleryAlbums', next);
        if (!saved.ok) return;
      } else setGalleryAlbums(next);
    } else {
      const newAlbum: GalleryAlbum = {
        id: 'album' + Date.now(), ...albumForm, photoCount: 0, videoCount: 0,
        createdByRole: currentUser?.role, media: [],
      };
      const next = [newAlbum, ...galleryAlbums];
      if (isPresident) {
        const saved = await savePublishedSiteTarget('galleryAlbums', next);
        if (!saved.ok) return;
      } else setGalleryAlbums(next);
    }
    setAlbumModalOpen(false);
  };

  const deleteAlbum = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الألبوم بكامل محتوياته؟')) return;
    const next = galleryAlbums.filter((a) => a.id !== id);
    if (isPresident) {
      const saved = await savePublishedSiteTarget('galleryAlbums', next);
      if (!saved.ok) return;
    } else setGalleryAlbums(next);
    if (mediaAlbum?.id === id) setMediaAlbum(null);
  };

  const openAddMedia = (album: GalleryAlbum) => {
    setMediaAlbum(album);
    setEditingMedia(null);
    setMediaForm({ type: 'photo', source: 'upload', url: '', thumbnail: '', caption: '', photoUrl: '' });
    setMediaModalOpen(true);
  };

  const openEditMedia = (album: GalleryAlbum, m: GalleryMedia) => {
    setMediaAlbum(album);
    setEditingMedia(m);
    setMediaForm({
      type: m.type, source: m.type === 'video' && /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(m.url) ? 'external' : 'upload', url: m.url, thumbnail: m.thumbnail ?? '', caption: m.caption ?? '', photoUrl: m.photoUrl ?? '',
    });
    setMediaModalOpen(true);
  };

  const saveMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaAlbum) return;
    const mediaFields = mediaForm.type === 'video'
      ? ['url', 'thumbnail', 'caption']
      : ['url', 'caption', 'photoUrl'];
    if (!validateRequired(mediaForm, mediaFields, setInvalid)) return;
    const applyMedia = (album: GalleryAlbum): GalleryAlbum => {
      if (editingMedia) {
        const media = album.media.map((m) => m.id === editingMedia.id
          ? { ...m, type: mediaForm.type, url: mediaForm.url, thumbnail: mediaForm.thumbnail || undefined, caption: mediaForm.caption || undefined, photoUrl: mediaForm.photoUrl.trim() || undefined }
          : m);
        const photos = media.filter((m) => m.type === 'photo').length;
        const videos = media.filter((m) => m.type === 'video').length;
        return { ...album, media, photoCount: photos, videoCount: videos };
      }
      const newMedia: GalleryMedia = {
        id: 'media' + Date.now(), type: mediaForm.type, url: mediaForm.url,
        thumbnail: mediaForm.thumbnail || undefined, caption: mediaForm.caption || undefined,
        photoUrl: mediaForm.photoUrl.trim() || undefined, createdByRole: currentUser?.role,
      };
      const media = [...album.media, newMedia];
      return {
        ...album, media,
        photoCount: media.filter((m) => m.type === 'photo').length,
        videoCount: media.filter((m) => m.type === 'video').length,
      };
    };
    const nextAlbums = galleryAlbums.map((a) => a.id === mediaAlbum.id ? applyMedia(a) : a);
    if (isPresident) {
      const saved = await savePublishedSiteTarget('galleryAlbums', nextAlbums);
      if (!saved.ok) return;
    } else setGalleryAlbums(nextAlbums);
    setMediaAlbum((prev) => (prev ? { ...prev, ...applyMedia(prev) } : prev));
    setMediaModalOpen(false);
  };

  const deleteMedia = async (album: GalleryAlbum, mediaId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوسائط؟')) return;
    const nextAlbums = galleryAlbums.map((a) => {
      if (a.id !== album.id) return a;
      const media = a.media.filter((m) => m.id !== mediaId);
      return {
        ...a, media,
        photoCount: media.filter((m) => m.type === 'photo').length,
        videoCount: media.filter((m) => m.type === 'video').length,
      };
    });
    if (isPresident) {
      const saved = await savePublishedSiteTarget('galleryAlbums', nextAlbums);
      if (!saved.ok) return;
    } else setGalleryAlbums(nextAlbums);
    setMediaAlbum((prev) => {
      if (!prev || prev.id !== album.id) return prev;
      const media = prev.media.filter((m) => m.id !== mediaId);
      return {
        ...prev, media,
        photoCount: media.filter((m) => m.type === 'photo').length,
        videoCount: media.filter((m) => m.type === 'video').length,
      };
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-bold text-gray-600">
          {galleryAlbums.length} ألبوم في المعرض · {visibleAlbums.length} ألبوم متاح لك
        </div>
        <button onClick={openAddAlbum} className="btn-primary">
          <Plus className="h-4 w-4" /> إضافة ألبوم جديد
        </button>
      </div>

      {!isPresident && currentUser && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
          <Info className="h-4 w-4 shrink-0" />
          تظهر هنا الألبومات التي أنشأتها لجنتك ({ROLE_LABEL[currentUser.role]}) فقط. الرئيس يطّلع على جميع الألبومات ويديرها بالكامل.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleAlbums.map((album) => (
          <div key={album.id} className="card overflow-hidden">
            <div className="relative aspect-[16/9] overflow-hidden">
              <img src={album.coverImage} alt={album.title} className="h-full w-full object-cover" />
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                <Camera className="h-3 w-3" /> {album.photoCount} · <Film className="h-3 w-3" /> {album.videoCount}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-navy-900">{album.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-bold">{catLabel(album.categoryId)}</span>
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {new Date(album.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {album.location}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">{album.description}</p>
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => openEditAlbum(album)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50" title="تعديل الألبوم"><Edit3 className="h-4 w-4" /></button>
                <button onClick={() => openAddMedia(album)} className="flex items-center gap-1 rounded-lg bg-navy-700 px-2.5 text-xs font-bold text-white hover:bg-navy-800" title="إدارة الوسائط"><Plus className="h-3.5 w-3.5" /> الوسائط</button>
                <button onClick={() => deleteAlbum(album.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" title="حذف الألبوم"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {visibleAlbums.length === 0 && (
        <div className="py-14 text-center text-sm text-gray-400">
          لا توجد ألبومات في نطاقك. اضغط "إضافة ألبوم جديد" لإنشاء أول ألبوم للجنتك.
        </div>
      )}

      {/* Album modal */}
      <Modal open={albumModalOpen} onClose={() => setAlbumModalOpen(false)} title={editingAlbum ? 'تعديل الألبوم' : 'إضافة ألبوم جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveAlbum} className="space-y-4">
          <div>
            <label className="label-field">عنوان الألبوم <RequiredMark /></label>
            <input id={fieldId('title')} type="text" value={albumForm.title} onChange={(e) => { setAlbumForm({ ...albumForm, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">التصنيف <RequiredMark /></label>
              <select id={fieldId('categoryId')} value={albumForm.categoryId} onChange={(e) => { setAlbumForm({ ...albumForm, categoryId: e.target.value }); clearInvalid(setInvalid, 'categoryId'); }} className={`${isInvalid(invalid, 'categoryId') ? 'input-field-error' : 'input-field'}`}>
                <option value="">اختر تصنيفًا...</option>
                {galleryCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">التاريخ <RequiredMark /></label>
              <input id={fieldId('date')} type="date" value={albumForm.date} onChange={(e) => { setAlbumForm({ ...albumForm, date: e.target.value }); clearInvalid(setInvalid, 'date'); }} className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`} />
            </div>
          </div>
          <div>
            <label className="label-field">المكان <RequiredMark /></label>
            <input id={fieldId('location')} type="text" value={albumForm.location} onChange={(e) => { setAlbumForm({ ...albumForm, location: e.target.value }); clearInvalid(setInvalid, 'location'); }} className={`${isInvalid(invalid, 'location') ? 'input-field-error' : 'input-field'}`} />
          </div>
          <ManagedFileField
            usage="gallery-image"
            label="صورة غلاف الألبوم"
            currentUrl={albumForm.coverImage}
            required
            error={isInvalid(invalid, 'coverImage') ? 'يرجى رفع صورة غلاف الألبوم.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('gallery-image', file, onProgress)}
            onUploaded={(asset) => {
              setAlbumForm((current) => ({ ...current, coverImage: asset.publicUrl }));
              clearInvalid(setInvalid, 'coverImage');
            }}
          />
          <div>
            <label className="label-field">الوصف <RequiredMark /></label>
            <textarea id={fieldId('description')} rows={2} value={albumForm.description} onChange={(e) => { setAlbumForm({ ...albumForm, description: e.target.value }); clearInvalid(setInvalid, 'description'); }} className={`${isInvalid(invalid, 'description') ? 'input-field-error' : 'input-field'} resize-none`} />
          </div>
          {albumForm.coverImage && (
            <div className="overflow-hidden rounded-xl">
              <img src={albumForm.coverImage} alt="معاينة الغلاف" className="aspect-video w-full object-cover" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAlbumModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> {editingAlbum ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>

      {/* Media modal */}
      <Modal open={mediaModalOpen} onClose={() => setMediaModalOpen(false)} title={editingMedia ? 'تعديل وسائط' : `إضافة وسائط — ${mediaAlbum?.title ?? ''}`} maxWidth="max-w-md">
        {mediaAlbum && mediaAlbum.media.length > 0 && !editingMedia && (
          <div className="mb-4 grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
            {mediaAlbum.media.map((m) => (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                <img src={m.thumbnail ?? m.url} alt={m.caption ?? ''} className="h-full w-full object-cover" />
                <div className="absolute left-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditMedia(mediaAlbum, m)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-navy-700 shadow ring-1 ring-gray-200 hover:bg-navy-50"
                    title="تعديل"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteMedia(mediaAlbum, m.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-600 shadow ring-1 ring-gray-200 hover:bg-rose-50"
                    title="حذف"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={saveMedia} className="space-y-4">
          <div>
            <label className="label-field">نوع الوسائط</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMediaForm({ ...mediaForm, type: 'photo' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${mediaForm.type === 'photo' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Image className="h-4 w-4" /> صورة
              </button>
              <button
                type="button"
                onClick={() => setMediaForm({ ...mediaForm, type: 'video' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${mediaForm.type === 'video' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Film className="h-4 w-4" /> فيديو
              </button>
            </div>
          </div>
          {mediaForm.type === 'video' && (
            <div>
              <label className="label-field">مصدر الفيديو</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMediaForm({ ...mediaForm, source: 'upload', url: '' })} className={mediaForm.source === 'upload' ? 'btn-primary' : 'btn-ghost'}>رفع من الجهاز</button>
                <button type="button" onClick={() => setMediaForm({ ...mediaForm, source: 'external', url: '' })} className={mediaForm.source === 'external' ? 'btn-primary' : 'btn-ghost'}>رابط YouTube / Vimeo</button>
              </div>
            </div>
          )}
          {mediaForm.type === 'photo' || mediaForm.source === 'upload' ? (
            <ManagedFileField
              usage={mediaForm.type === 'photo' ? 'gallery-image' : 'video-file'}
              label={mediaForm.type === 'photo' ? 'الصورة' : 'ملف الفيديو'}
              currentUrl={mediaForm.url}
              required
              error={isInvalid(invalid, 'url') ? 'يرجى رفع الملف قبل الحفظ.' : null}
              onUpload={(file, onProgress) => uploadManagedFile(mediaForm.type === 'photo' ? 'gallery-image' : 'video-file', file, onProgress)}
              onUploaded={(asset) => {
                setMediaForm((current) => ({ ...current, url: asset.publicUrl }));
                clearInvalid(setInvalid, 'url');
              }}
            />
          ) : (
            <div>
              <label className="label-field">رابط YouTube / Vimeo <RequiredMark /></label>
              <input id={fieldId('url')} type="url" dir="ltr" value={mediaForm.url} onChange={(e) => { setMediaForm({ ...mediaForm, url: e.target.value }); clearInvalid(setInvalid, 'url'); }} className={`${isInvalid(invalid, 'url') ? 'input-field-error' : 'input-field'}`} placeholder="https://www.youtube.com/..." />
            </div>
          )}
          {mediaForm.type === 'video' && (
            <ManagedFileField
              usage="gallery-image"
              label="الصورة المصغرة للفيديو"
              currentUrl={mediaForm.thumbnail}
              required
              error={isInvalid(invalid, 'thumbnail') ? 'يرجى رفع صورة مصغرة للفيديو.' : null}
              onUpload={(file, onProgress) => uploadManagedFile('gallery-image', file, onProgress)}
              onUploaded={(asset) => {
                setMediaForm((current) => ({ ...current, thumbnail: asset.publicUrl }));
                clearInvalid(setInvalid, 'thumbnail');
              }}
            />
          )}
          <div>
            <label className="label-field">تعليق / وصف <RequiredMark /></label>
            <input id={fieldId('caption')} type="text" value={mediaForm.caption} onChange={(e) => { setMediaForm({ ...mediaForm, caption: e.target.value }); clearInvalid(setInvalid, 'caption'); }} className={`${isInvalid(invalid, 'caption') ? 'input-field-error' : 'input-field'}`} />
          </div>
          <div>
            <label className="label-field">رابط المنشور (انستغرام / فيسبوك) {mediaForm.type === 'photo' ? <RequiredMark /> : <span className="text-gray-400">(اختياري للفيديو)</span>}</label>
            <div className="relative">
              <Link2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input id={fieldId('photoUrl')} type="url" dir="ltr" value={mediaForm.photoUrl} onChange={(e) => { setMediaForm({ ...mediaForm, photoUrl: e.target.value }); clearInvalid(setInvalid, 'photoUrl'); }} className={`${isInvalid(invalid, 'photoUrl') ? 'input-field-error' : 'input-field'} pr-10`} placeholder="https://www.instagram.com/..." />
            </div>
            <p className="mt-1 text-xs text-gray-400">{mediaForm.type === 'photo' ? 'إجباري: رابط منشور الصورة على انستغرام/فيسبوك. يظهر زر "زيارة المنشور" عند عرض الصورة.' : 'اختياري: رابط منشور الفيديو على انستغرام/فيسبوك.'}</p>
          </div>
          {mediaForm.url && mediaForm.type === 'photo' && (
            <div className="overflow-hidden rounded-xl">
              <img src={mediaForm.url} alt="معاينة" className="aspect-video w-full object-cover" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMediaModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> {editingMedia ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ---------------- Events Tab ---------------- */
function EventsTab({ events, currentUser }: {
  events: UEvent[];
  currentUser: ReturnType<typeof useApp>['currentUser'];
}) {
  const { uploadManagedFile, savePublishedSiteTarget, createPublishedEvent } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [form, setForm] = useState({
    title: '', category: '' as EventCategory, date: '', time: '16:00',
    location: '', description: '', capacity: 50, status: '' as 'upcoming' | 'past',
    image: '', eventUrl: '', activityType: 'OPTIONAL' as ActivityType,
    pointsValue: 0, registrationDeadline: '',
  });

  // Scoped access: the president manages all events; every other executive
  // member sees, edits and deletes only the events their role created
  // (`createdByRole == currentUser.role`). Other committees' events stay
  // invisible inside the member's personal dashboard.
  const isPresident = currentUser?.role === 'PRESIDENT';
  const canCreate = canCreateExecutiveContent(currentUser?.role);
  const visibleEvents =
    isPresident || !currentUser
      ? events
      : events.filter((e) => e.createdByRole === currentUser.role);

  const openAdd = () => {
    setEditId(null);
    setForm({ title: '', category: '' as EventCategory, date: '', time: '16:00', location: '', description: '', capacity: 50, status: '' as 'upcoming' | 'past', image: '', eventUrl: '', activityType: 'OPTIONAL', pointsValue: 0, registrationDeadline: '' });
    setModalOpen(true);
  };

  const openEdit = (e: UEvent) => {
    setEditId(e.id);
    const d = new Date(e.date);
    setForm({
      title: e.title, category: e.category, date: e.date.slice(0, 10), time: d.toTimeString().slice(0, 5),
      location: e.location, description: e.description, capacity: e.capacity, status: e.status, image: e.image,
      eventUrl: e.eventUrl ?? '',
      activityType: e.activityType ?? 'OPTIONAL', pointsValue: e.pointsValue ?? 0,
      registrationDeadline: toDateTimeLocalValue(e.registrationDeadline ?? e.date),
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate || (editId && !isPresident)) {
      setToast({ id: Date.now(), type: 'error', text: editId ? 'تعديل الفعاليات المنشورة متاح لرئيس الاتحاد فقط.' : 'إنشاء الفعاليات متاح لأعضاء الهيئة التنفيذية فقط.' });
      return;
    }
    const ok = validateRequired(form, ['title', 'category', 'date', 'time', 'location', 'description', 'image', 'status', 'activityType', 'registrationDeadline'], setInvalid);
    const capacityOk = form.capacity > 0;
    const pointsOk = form.pointsValue >= 0 && (form.activityType !== 'PAID' || form.pointsValue > 0);
    if (!capacityOk) setInvalid((p) => (p.includes('capacity') ? p : [...p, 'capacity']));
    if (!pointsOk) setInvalid((p) => (p.includes('pointsValue') ? p : [...p, 'pointsValue']));
    if (!ok || !capacityOk || !pointsOk) return;
    const iso = new Date(`${form.date}T${form.time}`).toISOString();
    const registrationDeadline = new Date(form.registrationDeadline).toISOString();
    const image = form.image;
    const eventUrl = form.eventUrl.trim() || undefined;
    const publicEventId = editId ?? crypto.randomUUID();
    if (editId) {
      const next = events.map((ev) => ev.id === editId ? { ...ev, title: form.title, category: form.category, date: iso, location: form.location, description: form.description, capacity: form.capacity, status: form.status, image, eventUrl, activityType: form.activityType, pointsValue: Number(form.pointsValue), registrationDeadline } : ev);
      const saved = await savePublishedSiteTarget('events', next);
      if (!saved.ok) return;
    } else {
      const newEvent: UEvent = { id: publicEventId, title: form.title, category: form.category, date: iso, location: form.location, description: form.description, status: form.status, capacity: Number(form.capacity), registered: 0, image, eventUrl, createdBy: currentUser?.email, createdByRole: currentUser?.role, activityType: form.activityType, pointsValue: Number(form.pointsValue), registrationDeadline };
      const saved = await createPublishedEvent(newEvent);
      if (!saved.ok) {
        setToast({ id: Date.now(), type: 'error', text: saved.error ?? 'تعذر إنشاء الفعالية.' });
        return;
      }
    }
    setModalOpen(false);
    setToast({ id: Date.now(), type: 'success', text: 'تم حفظ الفعالية وإعدادات التسجيل الدائم.' });
  };

  const remove = async (id: string) => {
    if (!isPresident) {
      setToast({ id: Date.now(), type: 'error', text: 'حذف الفعاليات المنشورة متاح لرئيس الاتحاد فقط.' });
      return;
    }
    if (confirm('هل أنت متأكد من حذف هذه الفعالية؟')) {
      const next = events.filter((e) => e.id !== id);
      const saved = await savePublishedSiteTarget('events', next);
      if (!saved.ok) return;
    }
  };

  const filtered = visibleEvents.filter((e) => e.title.includes(search) || e.location.includes(search));

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pr-10" placeholder="ابحث عن فعالية..." />
        </div>
        {canCreate && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="h-4 w-4" /> إضافة فعالية جديدة
          </button>
        )}
      </div>

      {!isPresident && currentUser && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
          <Info className="h-4 w-4 shrink-0" />
          يمكنك إنشاء فعالية جديدة. يبقى تعديل أو حذف فعالية منشورة ضمن الصلاحيات الإدارية المقررة دون تغيير.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-bold">الفعالية</th>
                <th className="px-4 py-3 font-bold">التصنيف</th>
                <th className="px-4 py-3 font-bold">التاريخ</th>
                <th className="px-4 py-3 font-bold">التسجيل</th>
                <th className="px-4 py-3 font-bold">الحالة</th>
                <th className="px-4 py-3 font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={e.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      <div className="font-bold text-navy-900">{e.title}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${categoryColors[e.category]}`}>{categoryLabels[e.category]}</span></td>
                  <td className="px-4 py-3 text-gray-600">{new Date(e.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-3 text-gray-600">{e.registered}/{e.capacity}</td>
                  <td className="px-4 py-3">
                    {e.status === 'upcoming' ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">قادمة</span>
                      : <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">منتهية</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isPresident ? (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50" title="تعديل"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={() => remove(e.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" title="حذف"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ) : <span className="text-xs text-gray-400">عرض فقط</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">لا توجد فعاليات.</div>
          )}
        </div>
      </div>

      {canCreateExecutiveContent(currentUser?.role) && (
        <InternalTaskCreationPanel />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل الفعالية' : 'إضافة فعالية جديدة'} maxWidth="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label-field">عنوان الفعالية <RequiredMark /></label>
            <input id={fieldId('title')} type="text" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} placeholder="عنوان الفعالية" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">التصنيف <RequiredMark /></label>
              <select id={fieldId('category')} value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value as EventCategory }); clearInvalid(setInvalid, 'category'); }} className={`${isInvalid(invalid, 'category') ? 'input-field-error' : 'input-field'}`}>
                <option value="">اختر التصنيف...</option>
                {(Object.keys(categoryLabels) as EventCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">السعة <RequiredMark /></label>
              <input id={fieldId('capacity')} type="number" min={1} value={form.capacity} onChange={(e) => { setForm({ ...form, capacity: Number(e.target.value) }); clearInvalid(setInvalid, 'capacity'); }} className={`${isInvalid(invalid, 'capacity') ? 'input-field-error' : 'input-field'}`} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">نوع النشاط الداخلي <RequiredMark /></label>
              <select id={fieldId('activityType')} value={form.activityType} onChange={(e) => { setForm({ ...form, activityType: e.target.value as ActivityType }); clearInvalid(setInvalid, 'activityType'); }} className={isInvalid(invalid, 'activityType') ? 'input-field-error' : 'input-field'}>
                <option value="MANDATORY">إلزامي</option>
                <option value="OPTIONAL">اختياري</option>
                <option value="PAID">حصري مدفوع بالنقاط</option>
              </select>
            </div>
            <div>
              <label className="label-field">قيمة النقاط <RequiredMark /></label>
              <input id={fieldId('pointsValue')} type="number" min="0" value={form.pointsValue} onChange={(e) => { setForm({ ...form, pointsValue: Number(e.target.value) }); clearInvalid(setInvalid, 'pointsValue'); }} className={isInvalid(invalid, 'pointsValue') ? 'input-field-error' : 'input-field'} />
            </div>
          </div>
          <div>
            <label className="label-field">تاريخ ووقت إغلاق التسجيل <RequiredMark /></label>
            <input id={fieldId('registrationDeadline')} type="datetime-local" value={form.registrationDeadline} onChange={(e) => { setForm({ ...form, registrationDeadline: e.target.value }); clearInvalid(setInvalid, 'registrationDeadline'); }} className={isInvalid(invalid, 'registrationDeadline') ? 'input-field-error' : 'input-field'} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">التاريخ <RequiredMark /></label>
              <input id={fieldId('date')} type="date" value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); clearInvalid(setInvalid, 'date'); }} className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`} />
            </div>
            <div>
              <label className="label-field">الوقت <RequiredMark /></label>
              <input id={fieldId('time')} type="time" value={form.time} onChange={(e) => { setForm({ ...form, time: e.target.value }); clearInvalid(setInvalid, 'time'); }} className={`${isInvalid(invalid, 'time') ? 'input-field-error' : 'input-field'}`} />
            </div>
          </div>
          <div>
            <label className="label-field">الموقع <RequiredMark /></label>
            <input id={fieldId('location')} type="text" value={form.location} onChange={(e) => { setForm({ ...form, location: e.target.value }); clearInvalid(setInvalid, 'location'); }} className={`${isInvalid(invalid, 'location') ? 'input-field-error' : 'input-field'}`} placeholder="مكان الفعالية" />
          </div>
          <div>
            <label className="label-field">الوصف <RequiredMark /></label>
            <textarea id={fieldId('description')} rows={3} value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); clearInvalid(setInvalid, 'description'); }} className={`${isInvalid(invalid, 'description') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="وصف الفعالية" />
          </div>
          <ManagedFileField
            usage="event-image"
            label="صورة الفعالية"
            currentUrl={form.image}
            required
            error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الفعالية قبل الحفظ.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('event-image', file, onProgress)}
            onUploaded={(asset) => {
              setForm((current) => ({ ...current, image: asset.publicUrl }));
              clearInvalid(setInvalid, 'image');
            }}
          />
          <div>
            <label className="label-field">رابط المنشور الخارجي <span className="text-gray-400">(اختياري)</span></label>
            <div className="relative">
              <Link2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input id={fieldId('eventUrl')} type="url" value={form.eventUrl} onChange={(e) => { setForm({ ...form, eventUrl: e.target.value }); clearInvalid(setInvalid, 'eventUrl'); }} className="input-field pr-10" placeholder="https://instagram.com/..." dir="ltr" />
            </div>
            <p className="mt-1 text-xs text-gray-400">اختياري: رابط منشور إنستغرام/فيسبوك للفعالية. يظهر زر "زيارة الفعالية" على الكرت عند إدخاله.</p>
          </div>
          <div>
            <label className="label-field">الحالة <RequiredMark /></label>
            <select id={fieldId('status')} value={form.status} onChange={(e) => { setForm({ ...form, status: e.target.value as 'upcoming' | 'past' }); clearInvalid(setInvalid, 'status'); }} className={`${isInvalid(invalid, 'status') ? 'input-field-error' : 'input-field'}`}>
              <option value="">اختر حالة الفعالية...</option>
              <option value="upcoming">قادمة</option>
              <option value="past">منتهية</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editId ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/* ---------------- News Tab ---------------- */
function NewsTab({ news, currentUser, submitSiteEdit }: {
  news: NewsItem[];
  currentUser: ReturnType<typeof useApp>['currentUser'];
  submitSiteEdit: ReturnType<typeof useApp>['submitSiteEdit'];
}) {
  const { uploadManagedFile, savePublishedSiteTarget } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', category: '', date: new Date().toISOString().slice(0, 10),
    excerpt: '', fullContent: '', image: '', externalUrl: '', pinnedOnHomepage: true,
  });

  const mediaNotice = () => undefined;

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (typeof v === 'object') return String(JSON.stringify(v));
    return String(v);
  };

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
      ['رابط المنشور الخارجي', 'externalUrl', current?.externalUrl ?? '', next.externalUrl ?? '', true],
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
    setForm({ title: '', category: '', date: new Date().toISOString().slice(0, 10), excerpt: '', fullContent: '', image: '', externalUrl: '', pinnedOnHomepage: true });
    setModalOpen(true);
  };

  const openEdit = (n: NewsItem) => {
    setEditId(n.id);
    setForm({
      title: n.title, category: n.category, date: n.date, excerpt: n.excerpt,
      fullContent: n.fullContent || '', image: n.image, externalUrl: n.externalUrl ?? '',
      pinnedOnHomepage: n.pinnedOnHomepage ?? false,
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(form, ['title', 'category', 'date', 'excerpt', 'fullContent', 'image'], setInvalid)) return;
    const image = form.image;
    const externalUrl = form.externalUrl.trim() || undefined;
    if (editId) {
      const current = news.find((n) => n.id === editId);
      const next: NewsItem = {
        ...current!,
        title: form.title, category: form.category, date: form.date, excerpt: form.excerpt,
        fullContent: form.fullContent, image, externalUrl, pinnedOnHomepage: form.pinnedOnHomepage,
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
      const saved = await savePublishedSiteTarget('news', news.map((n) => n.id === editId ? next : n));
      if (!saved.ok) return;
    } else {
      const newNews: NewsItem = {
        id: 'n' + Date.now(), title: form.title, category: form.category, date: form.date,
        excerpt: form.excerpt, fullContent: form.fullContent, image, externalUrl,
        pinnedOnHomepage: form.pinnedOnHomepage,
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
      const saved = await savePublishedSiteTarget('news', [newNews, ...news]);
      if (!saved.ok) return;
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
    await savePublishedSiteTarget('news', news.filter((n) => n.id !== id));
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
    await savePublishedSiteTarget('news', news.map((n) => n.id === id ? next : n));
  };

  const sorted = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> إضافة خبر جديد
        </button>
      </div>

      <div className="space-y-2">
        {sorted.map((n) => (
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
            <button onClick={() => openEdit(n)} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 hover:bg-navy-50" title="تعديل"><Edit3 className="h-4 w-4" /></button>
            <button onClick={() => remove(n.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">لا توجد أخبار بعد.</div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل الخبر' : 'إضافة خبر جديد'} maxWidth="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label-field">عنوان الخبر <RequiredMark /></label>
            <input id={fieldId('title')} type="text" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} placeholder="عنوان الخبر" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">التصنيف <RequiredMark /></label>
              <input id={fieldId('category')} type="text" value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); clearInvalid(setInvalid, 'category'); }} className={`${isInvalid(invalid, 'category') ? 'input-field-error' : 'input-field'}`} placeholder="مثال: شراكات / إنجازات" />
            </div>
            <div>
              <label className="label-field">التاريخ <RequiredMark /></label>
              <input id={fieldId('date')} type="date" value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); clearInvalid(setInvalid, 'date'); }} className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`} />
            </div>
          </div>
          <div>
            <label className="label-field">الملخص للصفحة الرئيسية <RequiredMark /></label>
            <textarea id={fieldId('excerpt')} rows={2} value={form.excerpt} onChange={(e) => { setForm({ ...form, excerpt: e.target.value }); clearInvalid(setInvalid, 'excerpt'); }} className={`${isInvalid(invalid, 'excerpt') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="ملخص قصير يظهر على بطاقة الخبر" />
          </div>
          <div>
            <label className="label-field">النص الكامل <RequiredMark /></label>
            <textarea id={fieldId('fullContent')} rows={5} value={form.fullContent} onChange={(e) => { setForm({ ...form, fullContent: e.target.value }); clearInvalid(setInvalid, 'fullContent'); }} className={`${isInvalid(invalid, 'fullContent') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="المحتوى الكامل للخبر" />
          </div>
          <ManagedFileField
            usage="news-image"
            label="صورة الخبر"
            currentUrl={form.image}
            required
            error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الخبر قبل الحفظ.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('news-image', file, onProgress)}
            onUploaded={(asset) => {
              setForm((current) => ({ ...current, image: asset.publicUrl }));
              clearInvalid(setInvalid, 'image');
            }}
          />
          <div>
            <label className="label-field">رابط المنشور الخارجي <span className="text-gray-400">(اختياري)</span></label>
            <div className="relative">
              <Link2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input id={fieldId('externalUrl')} type="url" value={form.externalUrl} onChange={(e) => { setForm({ ...form, externalUrl: e.target.value }); clearInvalid(setInvalid, 'externalUrl'); }} className="input-field pr-10" placeholder="https://instagram.com/..." dir="ltr" />
            </div>
            <p className="mt-1 text-xs text-gray-400">اختياري: رابط منشور إنستغرام/فيسبوك للخبر. يظهر زر "زيارة الخبر" على الكرت والتفاصيل عند إدخاله.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={form.pinnedOnHomepage} onChange={(e) => setForm({ ...form, pinnedOnHomepage: e.target.checked })} className="h-4 w-4 accent-navy-700" />
            <span className="text-sm font-semibold text-navy-900">تثبيت في الصفحة الرئيسية</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editId ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ---------------- Members Tab ---------------- */
function MembersTab({ members, currentUser, transferMemberRole, revokeExecutiveAssignment, getRoleHolder, removeMember }: {
  members: ReturnType<typeof useApp>['members'];
  currentUser: ReturnType<typeof useApp>['currentUser'];
  transferMemberRole: ReturnType<typeof useApp>['transferMemberRole'];
  revokeExecutiveAssignment: ReturnType<typeof useApp>['revokeExecutiveAssignment'];
  getRoleHolder: ReturnType<typeof useApp>['getRoleHolder'];
  removeMember: ReturnType<typeof useApp>['removeMember'];
}) {
  const [search, setSearch] = useState('');
  const [roleModal, setRoleModal] = useState<ReturnType<typeof useApp>['members'][0] | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<ReturnType<typeof useApp>['members'][0] | null>(null);
  const [roleForm, setRoleForm] = useState<UserRole | ''>('');
  const [pendingAssignment, setPendingAssignment] = useState<{
    role: Exclude<UserRole, 'STUDENT'>;
    message: string;
  } | null>(null);
  const [pendingRevocation, setPendingRevocation] = useState<{
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const filtered = members.filter((member) =>
    member.name.includes(search) || member.email.toLowerCase().includes(search.toLowerCase()));

  const openRoleModal = (member: ReturnType<typeof useApp>['members'][0]) => {
    setRoleModal(member);
    setRoleForm(member.role);
    setPendingAssignment(null);
    setPendingRevocation(null);
    setFeedback(null);
  };

  const selectRole = (role: Exclude<UserRole, 'STUDENT'>) => {
    if (!roleModal) return;
    const holder = getRoleHolder(role);
    if (holder?.id === roleModal.id) {
      setRoleForm(role);
      setPendingAssignment(null);
      setPendingRevocation(null);
      setFeedback({ kind: 'warning', text: 'هذا العضو يشغل المنصب المحدد بالفعل.' });
      return;
    }
    setFeedback(null);
    setRoleForm(role);
    setPendingRevocation(null);
    setPendingAssignment({
      role,
      message: buildTransferConfirmation({
        position: role,
        previousHolder: holder ? { id: holder.id, name: holder.name } : null,
        newHolder: { id: roleModal.id, name: roleModal.name },
      }),
    });
  };

  const selectStudent = () => {
    if (!roleModal) return;
    if (roleModal.role === 'PRESIDENT') {
      setFeedback({
        kind: 'warning',
        text: 'لا يمكن إنهاء منصب الرئيس وإعادته إلى طالب مباشرة. يجب نقل الرئاسة إلى عضو آخر أولاً.',
      });
      return;
    }
    if (roleModal.role === 'STUDENT') {
      setRoleForm('STUDENT');
      setPendingAssignment(null);
      setPendingRevocation(null);
      setFeedback({ kind: 'warning', text: 'هذا العضو طالب عادي بالفعل.' });
      return;
    }
    setFeedback(null);
    setRoleForm('STUDENT');
    setPendingAssignment(null);
    setPendingRevocation({
      message: buildRevocationConfirmation({
        targetName: roleModal.name,
        position: roleModal.role as ExecutiveRole,
      }),
    });
  };

  const confirmAssignment = async () => {
    if (!roleModal || !pendingAssignment || busy || currentUser?.role !== 'PRESIDENT') return;
    setFeedback(null);
    try {
      const result = await runTransferWithBusyState(
        () => transferMemberRole(roleModal.id, pendingAssignment.role),
        setBusy,
      );
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'تعذر نقل المنصب.' });
        return;
      }
      setFeedback({
        kind: result.error ? 'warning' : 'success',
        text: result.error ?? `تم نقل ${ROLE_LABEL[pendingAssignment.role]} إلى ${result.newHolder?.name ?? roleModal.name} بنجاح.`,
      });
      setPendingAssignment(null);
      setRoleModal(null);
    } catch {
      setFeedback({ kind: 'error', text: 'حدث خطأ غير متوقع أثناء نقل المنصب. تم حجب الصلاحيات مؤقتاً للأمان.' });
    }
  };

  const confirmRevocation = async () => {
    if (!roleModal || !pendingRevocation || busy || currentUser?.role !== 'PRESIDENT') return;
    setFeedback(null);
    try {
      const result = await runTransferWithBusyState(
        () => revokeExecutiveAssignment(roleModal.id),
        setBusy,
      );
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'تعذر إنهاء المنصب.' });
        return;
      }
      setFeedback({
        kind: result.error ? 'warning' : 'success',
        text: result.error ?? `تم إنهاء منصب ${getOfficeName(roleModal.role as ExecutiveRole)} لـ ${roleModal.name} بنجاح وإعادته إلى طالب عادي.`,
      });
      setPendingRevocation(null);
      setRoleModal(null);
    } catch {
      setFeedback({ kind: 'error', text: 'حدث خطأ غير متوقع أثناء إنهاء المنصب.' });
    }
  };

  const confirmRemoval = async () => {
    if (!removeCandidate || busy || currentUser?.role !== 'PRESIDENT') return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await removeMember(removeCandidate.id);
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'تعذر طرد العضو.' });
        return;
      }
      setFeedback({
        kind: result.error ? 'warning' : 'success',
        text: result.error ?? `تم طرد ${removeCandidate.name} وسحب صلاحيات العضوية منه.`,
      });
      setRemoveCandidate(null);
    } catch {
      setFeedback({ kind: 'error', text: 'حدث خطأ غير متوقع أثناء طرد العضو.' });
    } finally {
      setBusy(false);
    }
  };

  if (currentUser?.role !== 'PRESIDENT') return null;

  return (
    <div>
      {feedback && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${
          feedback.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : feedback.kind === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>{feedback.text}</div>
      )}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pr-10" placeholder="ابحث بالاسم أو بريد الدخول..." />
        </div>
        <span className="text-sm text-gray-500">{members.length} حساب مرتبط</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-bold">العضو</th>
                <th className="px-4 py-3 font-bold">بريد الدخول (للقراءة)</th>
                <th className="px-4 py-3 font-bold">المنصب الحالي</th>
                <th className="px-4 py-3 font-bold">الجامعة</th>
                <th className="px-4 py-3 font-bold">التخصص</th>
                <th className="px-4 py-3 font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((member) => (
                <tr key={member.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 font-bold text-navy-900">
                      <UserAvatar name={member.name} photo={member.photo} avatarPath={member.photo} updatedAt={member.updatedAt} className="h-9 w-9" />
                      {member.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500" dir="ltr">{member.email || '—'}</td>
                  <td className="px-4 py-3">
                    {member.role === 'STUDENT'
                      ? <span className="text-xs text-gray-400">طالب</span>
                      : <span className="inline-block rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-bold text-gold-800">{ROLE_LABEL[member.role]}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{member.university || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{member.major || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button disabled={busy} onClick={() => openRoleModal(member)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gold-600 transition-colors hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-50" title="نقل منصب تنفيذي">
                        <Crown className="h-4 w-4" />
                      </button>
                      {currentUser?.role === 'PRESIDENT' && (
                        <button
                          disabled={busy || member.id === currentUser.userId}
                          onClick={() => { setFeedback(null); setRemoveCandidate(member); }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                          title={member.id === currentUser.userId ? 'لا يمكن للرئيس طرد حسابه الحالي' : 'طرد العضو'}
                          aria-label={`طرد ${member.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!roleModal} onClose={() => { if (!busy) setRoleModal(null); }} title="إدارة منصب العضو" maxWidth="max-w-lg">
        {roleModal && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs text-gray-400">العضو المحدد</div>
              <div className="text-sm font-bold text-navy-900">{roleModal.name}</div>
              <div className="mt-1 text-xs text-gray-500" dir="ltr">{roleModal.email}</div>
              <div className="mt-1 text-xs font-semibold text-gold-700">
                المنصب الحالي: {roleModal.role === 'STUDENT' ? 'طالب عادي' : ROLE_LABEL[roleModal.role]}
              </div>
            </div>
            {roleModal.role === 'PRESIDENT' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                ملاحظة: لا يمكن إنهاء منصب الرئيس وإعادته إلى طالب مباشرة. لنقل الرئاسة، يرجى اختيار منصب الرئيس لعضو آخر.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || roleModal.role === 'STUDENT' || roleModal.role === 'PRESIDENT'}
                onClick={() => selectStudent()}
                title={
                  roleModal.role === 'STUDENT'
                    ? 'العضو طالب بالفعل'
                    : roleModal.role === 'PRESIDENT'
                      ? 'يجب نقل الرئاسة لعضو آخر أولاً'
                      : 'إنهاء المنصب التنفيذي وإعادة العضو إلى طالب عادي'
                }
                className={`col-span-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  roleForm === 'STUDENT'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                طالب عادي
                {roleModal.role === 'STUDENT' ? ' (الحالي)' : ''}
              </button>
              {LEADERSHIP_ROLES
                .filter((role): role is Exclude<UserRole, 'STUDENT'> => role !== 'STUDENT')
                .map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={busy}
                  onClick={() => selectRole(role)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:opacity-50 ${
                    roleForm === role
                      ? 'border-gold-400 bg-gold-50 text-gold-800'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {ROLE_LABEL[role]}
                  {roleModal.role === role ? ' (الحالي)' : ''}
                </button>
              ))}
            </div>
            {pendingAssignment && (
              <div className={`rounded-xl border px-3 py-3 text-sm font-bold ${pendingAssignment.role === 'PRESIDENT' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {pendingAssignment.message}
              </div>
            )}
            {pendingRevocation && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800">
                {pendingRevocation.message}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => setRoleModal(null)} className="btn-ghost">إلغاء</button>
              <button
                type="button"
                disabled={(!pendingAssignment && !pendingRevocation) || busy}
                onClick={() => {
                  if (pendingRevocation) {
                    void confirmRevocation();
                  } else if (pendingAssignment) {
                    void confirmAssignment();
                  }
                }}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : pendingRevocation ? (
                  <UserX className="h-4 w-4" />
                ) : (
                  <Crown className="h-4 w-4" />
                )}
                {busy
                  ? (pendingRevocation ? 'جارٍ إنهاء المنصب...' : 'جارٍ تأكيد النقل...')
                  : (pendingRevocation ? 'تأكيد إنهاء المنصب' : 'تأكيد نقل المنصب')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!removeCandidate} onClose={() => { if (!busy) setRemoveCandidate(null); }} title="تأكيد طرد العضو" maxWidth="max-w-lg">
        {removeCandidate && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-800">
              سيتم طرد <strong>{removeCandidate.name}</strong> طرداً ناعماً وسحب عضويته وأي منصب تنفيذي منه. سيبقى حسابه وسجله محفوظين ولن يستطيع استخدام بوابة الأعضاء.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setRemoveCandidate(null)} className="btn-ghost">إلغاء</button>
              <button type="button" disabled={busy} onClick={() => { void confirmRemoval(); }} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {busy ? 'جارٍ سحب العضوية...' : 'تأكيد الطرد'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Applications Tab ---------------- */
function ApplicationsTab({
  applications,
  scheduleInterview,
  decideApplication,
  applicationEmailNotifications,
  retryApplicationEmailNotification,
}: {
  applications: StudentApplication[];
  scheduleInterview: (id: string, interview: InterviewInfo) => Promise<{ ok: boolean; error?: string; emailWarning?: string }>;
  decideApplication: (id: string, status: 'accepted' | 'rejected', rejectionReason?: string) => Promise<{ ok: boolean; error?: string; emailWarning?: string }>;
  applicationEmailNotifications: ApplicationEmailNotification[];
  retryApplicationEmailNotification: (applicationId: string, eventType: ApplicationEmailEventType) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [interviewModal, setInterviewModal] = useState<StudentApplication | null>(null);
  const [decisionModal, setDecisionModal] = useState<StudentApplication | null>(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '16:00', meetingUrl: '' });
  const [interviewError, setInterviewError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [applicationActionBusy, setApplicationActionBusy] = useState(false);
  const [retryingNotificationId, setRetryingNotificationId] = useState<string | null>(null);
  const [applicationNotice, setApplicationNotice] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [decisionForm, setDecisionForm] = useState({ status: 'accepted' as 'accepted' | 'rejected', reason: '' });

  // Minimum selectable interview date: today (local time, YYYY-MM-DD)
  const todayMin = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const filtered = applications.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search && !(a.name ?? '').includes(search) && !(a.email ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === 'pending').length,
    interview: applications.filter((a) => a.status === 'interview').length,
    accepted: applications.filter((a) => a.status === 'accepted').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const openInterview = (app: StudentApplication) => {
    setInterviewModal(app);
    setInterviewForm({ date: '', time: '16:00', meetingUrl: '' });
    setInterviewError('');
  };

  const submitInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewModal) return;
    if (!validateRequired(interviewForm, ['date', 'time', 'meetingUrl'], setInvalid)) return;
    const date = interviewForm.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setInterviewError('صيغة التاريخ غير صالحة — يجب أن تكون YYYY-MM-DD (مثال: 2026-08-10)');
      return;
    }
    if (date < todayMin) {
      setInterviewError('لا يمكن اختيار تاريخ في الماضي — يجب أن يكون تاريخ المقابلة اليوم أو في المستقبل');
      return;
    }
    setApplicationActionBusy(true);
    const result = await scheduleInterview(interviewModal.id, {
      date,
      time: interviewForm.time,
      meetingUrl: interviewForm.meetingUrl,
    });
    setApplicationActionBusy(false);
    if (!result.ok) {
      setInterviewError(result.error ?? 'تعذر حفظ موعد المقابلة.');
      return;
    }
    setApplicationNotice(result.emailWarning
      ? { kind: 'warning', text: result.emailWarning }
      : { kind: 'success', text: 'تم حفظ موعد المقابلة وإرسال البريد للطالب.' });
    setInterviewModal(null);
    setInterviewError('');
  };

  const openDecision = (app: StudentApplication, status: 'accepted' | 'rejected') => {
    setDecisionModal(app);
    setDecisionForm({ status, reason: '' });
    setDecisionError('');
  };

  const submitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModal) return;
    if (decisionForm.status === 'rejected' && !validateRequired({ reason: decisionForm.reason }, ['reason'], setInvalid)) return;
    setApplicationActionBusy(true);
    const result = await decideApplication(
      decisionModal.id,
      decisionForm.status,
      decisionForm.status === 'rejected' ? decisionForm.reason : undefined,
    );
    setApplicationActionBusy(false);
    if (!result.ok) {
      setDecisionError(result.error ?? 'تعذر حفظ القرار.');
      return;
    }
    setApplicationNotice(result.emailWarning
      ? { kind: 'warning', text: result.emailWarning }
      : { kind: 'success', text: 'تم حفظ القرار وإرسال البريد للطالب.' });
    setDecisionModal(null);
  };

  const retryEmail = async (
    notificationId: string,
    applicationId: string,
    eventType: ApplicationEmailEventType,
  ) => {
    setRetryingNotificationId(notificationId);
    const result = await retryApplicationEmailNotification(applicationId, eventType);
    setRetryingNotificationId(null);
    setApplicationNotice(result.ok
      ? { kind: 'success', text: 'تم إرسال البريد بنجاح.' }
      : { kind: 'warning', text: result.error ?? 'تعذر إرسال البريد حالياً.' });
  };

  return (
    <div>
      {applicationNotice && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${applicationNotice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {applicationNotice.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          {applicationNotice.text}
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          { key: 'all', label: 'الإجمالي', color: 'bg-navy-800' },
          { key: 'pending', label: 'قيد المراجعة', color: 'bg-gold-500' },
          { key: 'interview', label: 'مقابلة مجدولة', color: 'bg-sky-500' },
          { key: 'accepted', label: 'مقبول', color: 'bg-emerald-500' },
          { key: 'rejected', label: 'مرفوض', color: 'bg-rose-500' },
        ] as { key: keyof typeof counts; label: string; color: string }[]).map((c) => (
          <button key={c.key} onClick={() => setStatusFilter(c.key)} className={`card flex items-center gap-3 p-4 text-right transition-all hover:shadow-md ${statusFilter === c.key ? 'ring-2 ring-navy-400' : ''}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.color} text-white`}><Inbox className="h-5 w-5" /></div>
            <div>
              <div className="text-xl font-extrabold text-navy-900">{counts[c.key]}</div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pr-10" placeholder="ابحث عن متقدم..." />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} طلب</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-bold">المتقدم</th>
                <th className="px-4 py-3 font-bold">الجامعة</th>
                <th className="px-4 py-3 font-bold">تاريخ التقديم</th>
                <th className="px-4 py-3 font-bold">الحالة</th>
                <th className="px-4 py-3 font-bold">المقابلة</th>
                <th className="px-4 py-3 font-bold">البريد</th>
                <th className="px-4 py-3 font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={a.name} className="h-9 w-9" fallbackClassName="bg-navy-800 text-xs text-white" />
                      <div>
                        <div className="font-bold text-navy-900">{a.name}</div>
                        <div className="text-xs text-gray-400" dir="ltr">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.university}<div className="text-xs text-gray-400">{a.major}</div></td>
                  <td className="px-4 py-3 text-gray-600">{a.appliedAt}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${applicationStatusColors[a.status]}`}>{applicationStatusLabels[a.status]}</span></td>
                  <td className="px-4 py-3">
                    {a.interview ? (
                      <div className="text-xs text-gray-600">
                        <div className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-sky-500" />{new Date(a.interview.date).toLocaleDateString('ar-EG')}</div>
                        <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-sky-500" />{a.interview.time}</div>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ApplicationEmailStatus
                      application={a}
                      notifications={applicationEmailNotifications}
                      retryingNotificationId={retryingNotificationId}
                      onRetry={retryEmail}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.status === 'pending' && (
                        <button onClick={() => openInterview(a)} className="flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100">
                          <Video className="h-3.5 w-3.5" /> قبول للمقابلة
                        </button>
                      )}
                      {a.status === 'interview' && (
                        <>
                          <button onClick={() => openDecision(a, 'accepted')} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
                            <UserCheck className="h-3.5 w-3.5" /> قبول نهائي
                          </button>
                          <button onClick={() => openDecision(a, 'rejected')} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100">
                            <UserX className="h-3.5 w-3.5" /> رفض
                          </button>
                        </>
                      )}
                      {(a.status === 'accepted' || a.status === 'rejected') && (
                        <span className="text-xs text-gray-400">تم البت بتاريخ {a.decidedAt}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!interviewModal} onClose={() => setInterviewModal(null)} title="جدولة مقابلة شخصية" maxWidth="max-w-lg">
        {interviewModal && (
          <form onSubmit={submitInterview} className="space-y-4">
            <div className="rounded-xl bg-navy-50 p-3 text-sm">
              <span className="font-bold text-navy-900">{interviewModal.name}</span>
              <span className="text-gray-500"> - {interviewModal.university}</span>
            </div>
            {interviewError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <Info className="h-4 w-4 shrink-0" />
                {interviewError}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-field">تاريخ المقابلة <RequiredMark /></label>
                <input
                  id={fieldId('date')}
                  type="date"
                  min={todayMin}
                  value={interviewForm.date}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInterviewForm({ ...interviewForm, date: v });
                    setInterviewError('');
                    clearInvalid(setInvalid, 'date');
                  }}
                  className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`}
                />
                <p className="mt-1.5 text-xs text-gray-400">الصيغة: YYYY-MM-DD — لا يمكن اختيار تاريخ في الماضي</p>
              </div>
              <div>
                <label className="label-field">الوقت <RequiredMark /></label>
                <input id={fieldId('time')} type="time" value={interviewForm.time} onChange={(e) => { setInterviewForm({ ...interviewForm, time: e.target.value }); clearInvalid(setInvalid, 'time'); }} className={`${isInvalid(invalid, 'time') ? 'input-field-error' : 'input-field'}`} />
              </div>
            </div>
            <div>
              <label className="label-field">رابط المقابلة (Zoom / Meet) <RequiredMark /></label>
              <div className="relative">
                <Link2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input id={fieldId('meetingUrl')} type="url" value={interviewForm.meetingUrl} onChange={(e) => { setInterviewForm({ ...interviewForm, meetingUrl: e.target.value }); clearInvalid(setInvalid, 'meetingUrl'); }} className={`${isInvalid(invalid, 'meetingUrl') ? 'input-field-error' : 'input-field'} pr-10`} placeholder="https://meet.google.com/..." dir="ltr" />
              </div>
              <p className="mt-1 text-xs text-gray-400">أدخل رابط الجلسة الافتراضية للمقابلة.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={applicationActionBusy} onClick={() => setInterviewModal(null)} className="btn-ghost">إلغاء</button>
              <button type="submit" disabled={applicationActionBusy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                {applicationActionBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                {applicationActionBusy ? 'جارٍ الحفظ...' : 'تأكيد وجدولة'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!decisionModal} onClose={() => setDecisionModal(null)} title={decisionForm.status === 'accepted' ? 'تأكيد القبول النهائي' : 'رفض الطلب'} maxWidth="max-w-md">
        {decisionModal && (
          <form onSubmit={submitDecision} className="space-y-4">
            <div className={`rounded-xl p-3 text-sm ${decisionForm.status === 'accepted' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
              <span className="font-bold">{decisionModal.name}</span>
              <span> - {decisionModal.email}</span>
            </div>
            {decisionError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <Info className="h-4 w-4 shrink-0" />
                {decisionError}
              </div>
            )}
            {decisionForm.status === 'accepted' ? (
              <p className="text-sm text-gray-600">سيتم منح الطالب صلاحيات العضو الكاملة وتفعيل حسابه. سيظهر له تنبيه القبول في لوحة التحكم.</p>
            ) : (
              <div>
                <p className="mb-3 text-sm text-gray-600">سيتم إرسال رسالة شكر واعتذار للطالب.</p>
                <label className="label-field">سبب الرفض <RequiredMark /></label>
                <textarea id={fieldId('reason')} rows={3} value={decisionForm.reason} onChange={(e) => { setDecisionForm({ ...decisionForm, reason: e.target.value }); clearInvalid(setInvalid, 'reason'); }} className={`${isInvalid(invalid, 'reason') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="سبب الرفض..." />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={applicationActionBusy} onClick={() => setDecisionModal(null)} className="btn-ghost">إلغاء</button>
              <button type="submit" disabled={applicationActionBusy} className={`${decisionForm.status === 'accepted' ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[0.98]' : 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition-all hover:bg-rose-700 active:scale-[0.98]'} disabled:cursor-not-allowed disabled:opacity-60`}>
                {applicationActionBusy
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />جارٍ الحفظ...</>
                  : decisionForm.status === 'accepted'
                    ? <><UserCheck className="h-4 w-4" />تأكيد القبول</>
                    : <><UserX className="h-4 w-4" />تأكيد الرفض</>}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

const APPLICATION_EVENT_BY_STATUS: Record<StudentApplication['status'], ApplicationEmailEventType> = {
  pending: 'NEW_APPLICATION',
  interview: 'INTERVIEW_SCHEDULED',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
};

function ApplicationEmailStatus({
  application,
  notifications,
  retryingNotificationId,
  onRetry,
}: {
  application: StudentApplication;
  notifications: ApplicationEmailNotification[];
  retryingNotificationId: string | null;
  onRetry: (notificationId: string, applicationId: string, eventType: ApplicationEmailEventType) => Promise<void>;
}) {
  const eventType = APPLICATION_EVENT_BY_STATUS[application.status];
  const notification = notifications.find((row) => (
    row.applicationId === application.id && row.eventType === eventType
  ));

  if (!notification) return <span className="text-xs text-gray-400">لا يوجد سجل بريد</span>;
  if (notification.deliveryStatus === 'SENT') {
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />تم إرسال البريد</span>;
  }
  if (notification.deliveryStatus === 'FAILED') {
    const retrying = retryingNotificationId === notification.id;
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-xs font-bold text-rose-700">تعذر إرسال البريد</span>
        <button
          type="button"
          disabled={retrying}
          onClick={() => void onRetry(notification.id, application.id, eventType)}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'جارٍ الإرسال...' : 'إعادة إرسال البريد'}
        </button>
      </div>
    );
  }
  return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><Clock className="h-3.5 w-3.5" />قيد الإرسال</span>;
}

/* ---------------- Plans & Reports Tab ---------------- */
const COMMITTEE_LABELS: Record<CommitteeId, string> = {
  presidency: 'الرئاسة',
  'vice-presidency': 'النيابة',
  media: 'اللجنة الإعلامية',
  academic: 'اللجنة الأكاديمية',
  activities: 'اللجنة الأنشطة',
  finance: 'اللجنة المالية',
  supervisory: 'اللجنة الرقابية',
};

const COMMITTEE_BADGE_CLS: Record<CommitteeId, string> = {
  presidency: 'bg-gold-100 text-gold-700',
  'vice-presidency': 'bg-navy-100 text-navy-700',
  media: 'bg-sky-100 text-sky-700',
  academic: 'bg-emerald-100 text-emerald-700',
  activities: 'bg-rose-100 text-rose-700',
  finance: 'bg-amber-100 text-amber-700',
  supervisory: 'bg-violet-100 text-violet-700',
};

function PlansTab({ plans, setPlans, reports, setReports, currentUser }: {
  plans: ReturnType<typeof useApp>['plans'];
  setPlans: React.Dispatch<React.SetStateAction<ReturnType<typeof useApp>['plans']>>;
  reports: ReturnType<typeof useApp>['reports'];
  setReports: React.Dispatch<React.SetStateAction<ReturnType<typeof useApp>['reports']>>;
  currentUser: ReturnType<typeof useApp>['currentUser'];
}) {
  const { uploadManagedFile, savePublishedSiteTarget } = useApp();
  const isPresident = currentUser?.role === 'PRESIDENT';

  const myCommittee = currentUser?.committee;

  const visiblePlans = useMemo(() => {
    if (isPresident) return plans;
    return plans.filter((p) => !p.committee || p.committee === myCommittee);
  }, [plans, isPresident, myCommittee]);

  const visibleReports = useMemo(() => {
    if (isPresident) return reports;
    return reports.filter((r) => r.isGeneral || !r.committee || r.committee === myCommittee);
  }, [reports, isPresident, myCommittee]);

  const canModifyPlan = (p: ReturnType<typeof useApp>['plans'][0]) => {
    if (isPresident) return true;
    return p.authorId === currentUser?.email;
  };
  const canModifyReport = (r: ReturnType<typeof useApp>['reports'][0]) => {
    if (isPresident) return true;
    return r.authorId === currentUser?.email;
  };

  const [planModal, setPlanModal] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [planForm, setPlanForm] = useState({ title: '', description: '', quarter: '', owner: '', status: 'planned' as 'planned' | 'in-progress' | 'completed', progress: 0, committee: (myCommittee ?? 'presidency') as CommitteeId, pdfUrl: '' });

  const openAddPlan = () => {
    setEditPlanId(null);
    setPlanForm({ title: '', description: '', quarter: '', owner: currentUser?.name ?? '', status: 'planned', progress: 0, committee: (myCommittee ?? 'presidency') as CommitteeId, pdfUrl: '' });
    setPlanModal(true);
  };
  const openEditPlan = (p: ReturnType<typeof useApp>['plans'][0]) => {
    setEditPlanId(p.id);
    setPlanForm({ title: p.title, description: p.description, quarter: p.quarter, owner: p.owner, status: p.status, progress: p.progress, committee: (p.committee ?? 'presidency') as CommitteeId, pdfUrl: p.pdfUrl ?? '' });
    setPlanModal(true);
  };
  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(planForm, ['title', 'description', 'quarter', 'owner', 'pdfUrl'], setInvalid)) return;
    const payload = { ...planForm, progress: Number(planForm.progress), committee: planForm.committee as CommitteeId, authorRole: currentUser?.role, authorId: currentUser?.email ?? '', pdfUrl: planForm.pdfUrl.trim() };
    if (editPlanId) {
      const next = plans.map((p) => p.id === editPlanId ? { ...p, ...payload } : p);
      if (isPresident) {
        const saved = await savePublishedSiteTarget('plans', next);
        if (!saved.ok) return;
      } else setPlans(next);
    } else {
      const next = [{ id: 'p' + Date.now(), ...payload }, ...plans];
      if (isPresident) {
        const saved = await savePublishedSiteTarget('plans', next);
        if (!saved.ok) return;
      } else setPlans(next);
    }
    setPlanModal(false);
  };
  const removePlan = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    const next = plans.filter((p) => p.id !== id);
    if (isPresident) await savePublishedSiteTarget('plans', next);
    else setPlans(next);
  };

  const [reportModal, setReportModal] = useState(false);
  const [editReportId, setEditReportId] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState({ title: '', type: 'تقرير لجنة', period: '', date: '', summary: '', committee: (myCommittee ?? 'presidency') as CommitteeId, pdfUrl: '', isGeneral: false });

  const openAddReport = () => {
    setEditReportId(null);
    setReportForm({ title: '', type: 'تقرير لجنة', period: '', date: new Date().toISOString().slice(0, 10), summary: '', committee: (myCommittee ?? 'presidency') as CommitteeId, pdfUrl: '', isGeneral: false });
    setReportModal(true);
  };
  const openEditReport = (r: ReturnType<typeof useApp>['reports'][0]) => {
    setEditReportId(r.id);
    setReportForm({ title: r.title, type: r.type, period: r.period, date: r.date, summary: r.summary, committee: (r.committee ?? 'presidency') as CommitteeId, pdfUrl: r.pdfUrl ?? '', isGeneral: r.isGeneral ?? false });
    setReportModal(true);
  };
  const saveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(reportForm, ['title', 'type', 'date', 'period', 'summary', 'pdfUrl'], setInvalid)) return;
    const payload = { ...reportForm, committee: reportForm.committee as CommitteeId, authorRole: currentUser?.role, authorId: currentUser?.email ?? '', pdfUrl: reportForm.pdfUrl.trim() };
    if (editReportId) {
      const next = reports.map((r) => r.id === editReportId ? { ...r, ...payload } : r);
      if (isPresident) {
        const saved = await savePublishedSiteTarget('reports', next);
        if (!saved.ok) return;
      } else setReports(next);
    } else {
      const next = [{ id: 'r' + Date.now(), ...payload }, ...reports];
      if (isPresident) {
        const saved = await savePublishedSiteTarget('reports', next);
        if (!saved.ok) return;
      } else setReports(next);
    }
    setReportModal(false);
  };
  const removeReport = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التقرير؟')) return;
    const next = reports.filter((r) => r.id !== id);
    if (isPresident) await savePublishedSiteTarget('reports', next);
    else setReports(next);
  };

  const [viewReport, setViewReport] = useState<ReturnType<typeof useApp>['reports'][0] | null>(null);

  const statusMap = {
    planned: { label: 'مخطط', cls: 'bg-gray-100 text-gray-600' },
    'in-progress': { label: 'قيد التنفيذ', cls: 'bg-gold-100 text-gold-700' },
    completed: { label: 'مكتمل', cls: 'bg-emerald-100 text-emerald-700' },
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900"><Target className="h-5 w-5 text-navy-600" /> الخطط الإدارية</h3>
          <button onClick={openAddPlan} className="btn-primary"><Plus className="h-4 w-4" /> خطة جديدة</button>
        </div>
        {visiblePlans.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-400">لا توجد خطط متاحة لعرضها حالياً.</div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visiblePlans.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="text-base font-bold text-navy-900">{p.title}</h4>
                  {p.committee && (
                    <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${COMMITTEE_BADGE_CLS[p.committee]}`}>خطة {COMMITTEE_LABELS[p.committee]}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusMap[p.status].cls}`}>{statusMap[p.status].label}</span>
                  {canModifyPlan(p) && (
                    <>
                      <button onClick={() => openEditPlan(p)} className="flex h-7 w-7 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50" title="تعديل"><Edit3 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removePlan(p.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{p.description}</p>
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-500">التقدم</span>
                  <span className="font-bold text-navy-900">{p.progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all ${p.progress === 100 ? 'bg-emerald-500' : 'bg-navy-600'}`} style={{ width: `${p.progress}%` }} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.quarter}</span>
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{p.owner}</span>
              </div>
              {p.pdfUrl && (
                <a href={p.pdfUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-100">
                  <FileText className="h-3.5 w-3.5" /> معاينة/تحميل ملف PDF التصور
                </a>
              )}
            </div>
          ))}
        </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900"><FileText className="h-5 w-5 text-navy-600" /> التقارير</h3>
          <button onClick={openAddReport} className="btn-primary"><Plus className="h-4 w-4" /> تقرير جديد</button>
        </div>
        {visibleReports.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-400">لا توجد تقارير متاحة لعرضها حالياً.</div>
        ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {visibleReports.map((r) => (
            <div key={r.id} className="card flex flex-col p-5 transition-all hover:shadow-md">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{r.type}</span>
                {r.isGeneral && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">عام</span>}
                {r.committee && !r.isGeneral && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COMMITTEE_BADGE_CLS[r.committee]}`}>{COMMITTEE_LABELS[r.committee]}</span>}
              </div>
              <h4 className="mt-3 text-base font-bold text-navy-900">{r.title}</h4>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">{r.summary}</p>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">{r.date}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewReport(r)} className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-navy-900">عرض التقرير <ChevronLeft className="h-3.5 w-3.5" /></button>
                  {canModifyReport(r) && (
                    <>
                      <button onClick={() => openEditReport(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50" title="تعديل"><Edit3 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeReport(r.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Plan Modal */}
      <Modal open={planModal} onClose={() => setPlanModal(false)} title={editPlanId ? 'تعديل الخطة' : 'إضافة خطة إدارية'} maxWidth="max-w-lg">
        <form onSubmit={savePlan} className="space-y-4">
          <div>
            <label className="label-field">عنوان الخطة <RequiredMark /></label>
            <input id={fieldId('title')} type="text" value={planForm.title} onChange={(e) => { setPlanForm({ ...planForm, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} />
          </div>
          <div>
            <label className="label-field">اللجنة / المكتب التابع <RequiredMark /></label>
            <select id={fieldId('committee')} value={planForm.committee} onChange={(e) => { setPlanForm({ ...planForm, committee: e.target.value as CommitteeId }); clearInvalid(setInvalid, 'committee'); }} className={`${isInvalid(invalid, 'committee') ? 'input-field-error' : 'input-field'}`} disabled={!isPresident}>
              {Object.entries(COMMITTEE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">الوصف التفصيلي <RequiredMark /></label>
            <textarea id={fieldId('description')} rows={3} value={planForm.description} onChange={(e) => { setPlanForm({ ...planForm, description: e.target.value }); clearInvalid(setInvalid, 'description'); }} className={`${isInvalid(invalid, 'description') ? 'input-field-error' : 'input-field'} resize-none`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">الحالة <RequiredMark /></label>
              <select id={fieldId('status')} value={planForm.status} onChange={(e) => { setPlanForm({ ...planForm, status: e.target.value as 'planned' | 'in-progress' | 'completed' }); clearInvalid(setInvalid, 'status'); }} className={`${isInvalid(invalid, 'status') ? 'input-field-error' : 'input-field'}`}>
                <option value="planned">مخطط</option>
                <option value="in-progress">قيد التنفيذ</option>
                <option value="completed">مكتمل</option>
              </select>
            </div>
            <div>
              <label className="label-field">نسبة التقدم: {planForm.progress}% <RequiredMark /></label>
              <input id={fieldId('progress')} type="range" min={0} max={100} value={planForm.progress} onChange={(e) => { setPlanForm({ ...planForm, progress: Number(e.target.value) }); clearInvalid(setInvalid, 'progress'); }} className="w-full accent-navy-700" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">الفترة الزمنية <RequiredMark /></label>
              <select id={fieldId('quarter')} value={planForm.quarter} onChange={(e) => { setPlanForm({ ...planForm, quarter: e.target.value }); clearInvalid(setInvalid, 'quarter'); }} className={`${isInvalid(invalid, 'quarter') ? 'input-field-error' : 'input-field'}`}>
                <option value="">اختر من القائمة...</option>
                <option>الربع الأول 2026</option>
                <option>الربع الثاني 2026</option>
                <option>الربع الثالث 2026</option>
                <option>الربع الرابع 2026</option>
                <option>السنة 2026</option>
                <option>الربع الأول 2027</option>
              </select>
            </div>
            <div>
              <label className="label-field">المسؤول <RequiredMark /></label>
              <input id={fieldId('owner')} type="text" value={planForm.owner} onChange={(e) => { setPlanForm({ ...planForm, owner: e.target.value }); clearInvalid(setInvalid, 'owner'); }} className={`${isInvalid(invalid, 'owner') ? 'input-field-error' : 'input-field'}`} />
            </div>
          </div>
          <ManagedFileField
            usage="plan-document"
            label="ملف تصور الخطة"
            currentUrl={planForm.pdfUrl}
            required
            error={isInvalid(invalid, 'pdfUrl') ? 'يرجى رفع ملف الخطة قبل الحفظ.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('plan-document', file, onProgress)}
            onUploaded={(asset) => {
              setPlanForm((current) => ({ ...current, pdfUrl: asset.publicUrl }));
              clearInvalid(setInvalid, 'pdfUrl');
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPlanModal(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editPlanId ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>

      {/* Report Modal */}
      <Modal open={reportModal} onClose={() => setReportModal(false)} title={editReportId ? 'تعديل التقرير' : 'إضافة تقرير'} maxWidth="max-w-lg">
        <form onSubmit={saveReport} className="space-y-4">
          <div>
            <label className="label-field">عنوان التقرير <RequiredMark /></label>
            <input id={fieldId('title')} type="text" value={reportForm.title} onChange={(e) => { setReportForm({ ...reportForm, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">نوع التقرير <RequiredMark /></label>
              <select id={fieldId('type')} value={reportForm.type} onChange={(e) => { setReportForm({ ...reportForm, type: e.target.value }); clearInvalid(setInvalid, 'type'); }} className={`${isInvalid(invalid, 'type') ? 'input-field-error' : 'input-field'}`}>
                <option>تقرير سنوي</option>
                <option>تقرير ربع سنوي</option>
                <option>تقرير لجنة</option>
              </select>
            </div>
            <div>
              <label className="label-field">اللجنة التابعة <RequiredMark /></label>
              <select id={fieldId('committee')} value={reportForm.committee} onChange={(e) => { setReportForm({ ...reportForm, committee: e.target.value as CommitteeId }); clearInvalid(setInvalid, 'committee'); }} className={`${isInvalid(invalid, 'committee') ? 'input-field-error' : 'input-field'}`} disabled={!isPresident}>
                {Object.entries(COMMITTEE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">تاريخ الصدور <RequiredMark /></label>
              <input id={fieldId('date')} type="date" value={reportForm.date} onChange={(e) => { setReportForm({ ...reportForm, date: e.target.value }); clearInvalid(setInvalid, 'date'); }} className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`} />
            </div>
            <div>
              <label className="label-field">الفترة <RequiredMark /></label>
              <input id={fieldId('period')} type="text" value={reportForm.period} onChange={(e) => { setReportForm({ ...reportForm, period: e.target.value }); clearInvalid(setInvalid, 'period'); }} className={`${isInvalid(invalid, 'period') ? 'input-field-error' : 'input-field'}`} placeholder="مثال: سنوي / ربع سنوي" />
            </div>
          </div>
          <div>
            <label className="label-field">ملخص التقرير <RequiredMark /></label>
            <textarea id={fieldId('summary')} rows={3} value={reportForm.summary} onChange={(e) => { setReportForm({ ...reportForm, summary: e.target.value }); clearInvalid(setInvalid, 'summary'); }} className={`${isInvalid(invalid, 'summary') ? 'input-field-error' : 'input-field'} resize-none`} />
          </div>
          <ManagedFileField
            usage="report-document"
            label="ملف التقرير الكامل"
            currentUrl={reportForm.pdfUrl}
            required
            error={isInvalid(invalid, 'pdfUrl') ? 'يرجى رفع ملف التقرير قبل الحفظ.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('report-document', file, onProgress)}
            onUploaded={(asset) => {
              setReportForm((current) => ({ ...current, pdfUrl: asset.publicUrl }));
              clearInvalid(setInvalid, 'pdfUrl');
            }}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={reportForm.isGeneral} onChange={(e) => setReportForm({ ...reportForm, isGeneral: e.target.checked })} className="h-4 w-4 accent-navy-700" />
            تقرير عام (متاح لجميع اللجان)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setReportModal(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> {editReportId ? 'حفظ التعديلات' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>

      {/* View Report Modal */}
      <Modal open={!!viewReport} onClose={() => setViewReport(null)} title="استعراض التقرير" maxWidth="max-w-xl">
        {viewReport && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{viewReport.type}</span>
              {viewReport.isGeneral && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">عام</span>}
              {viewReport.committee && !viewReport.isGeneral && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COMMITTEE_BADGE_CLS[viewReport.committee]}`}>{COMMITTEE_LABELS[viewReport.committee]}</span>}
              <span className="text-xs text-gray-400">{viewReport.date}</span>
            </div>
            <h4 className="text-lg font-bold text-navy-900">{viewReport.title}</h4>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-2 text-xs font-bold text-gray-400">الملخص التنفيذي</div>
              <p className="text-sm leading-relaxed text-gray-600">{viewReport.summary}</p>
            </div>
            {viewReport.pdfUrl ? (
              <a href={viewReport.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-navy-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy-700">
                <Download className="h-4 w-4" /> معاينة / تحميل التقرير PDF
              </a>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
                <FileText className="h-4 w-4" /> لا يوجد ملف PDF مرفق لهذا التقرير.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}


/* ---------------- Profile Tab ---------------- */
function ProfileTab({ currentUser }: { currentUser: ReturnType<typeof useApp>["currentUser"] }) {
  const {
    committees,
    updateOwnProfile,
    uploadOwnAvatar,
    deleteOwnAvatar,
    changeOwnPassword,
    ownProfileOperationResults,
    clearOwnProfileOperationResult,
    updateCommitteeVision,
  } = useApp();
  const myCommittee = currentUser?.committee;
  const committee = committees.find((c) => c.id === myCommittee);
  const [visionForm, setVisionForm] = useState({
    vision: committee?.vision ?? "",
    goals: committee?.goals ?? "",
  });
  const [invalid, setInvalid] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveVision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(visionForm, ['vision', 'goals'], setInvalid)) return;
    if (myCommittee) updateCommitteeVision(myCommittee, { ...visionForm });
    setSavedAt(Date.now());
  };

  return (
    <div className="space-y-6">
      {currentUser && (
        <ProfileSettings
          profile={currentUser}
          positionLabel={ROLE_LABEL[currentUser.role]}
          onUpdateProfile={updateOwnProfile}
          onUploadAvatar={uploadOwnAvatar}
          onDeleteAvatar={deleteOwnAvatar}
          onChangePassword={changeOwnPassword}
          operationResults={ownProfileOperationResults}
          onClearOperationResult={clearOwnProfileOperationResult}
        />
      )}
      <div className="grid gap-6">
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900"><Target className="h-5 w-5 text-navy-600" /> رؤية وأهداف اللجنة</h3>
          {committee ? (
            <form onSubmit={saveVision} className="space-y-4">
              <div className="rounded-lg bg-navy-50 px-4 py-2 text-sm font-bold text-navy-700">{committee.name}</div>
              <div>
                <label className="label-field">الرؤية <RequiredMark /></label>
                <textarea id={fieldId('vision')} rows={4} value={visionForm.vision} onChange={(e) => { setVisionForm({ ...visionForm, vision: e.target.value }); clearInvalid(setInvalid, 'vision'); }} className={`${isInvalid(invalid, 'vision') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="رؤية اللجنة المستقبلية..." />
              </div>
              <div>
                <label className="label-field">الأهداف <RequiredMark /></label>
                <textarea id={fieldId('goals')} rows={4} value={visionForm.goals} onChange={(e) => { setVisionForm({ ...visionForm, goals: e.target.value }); clearInvalid(setInvalid, 'goals'); }} className={`${isInvalid(invalid, 'goals') ? 'input-field-error' : 'input-field'} resize-none`} placeholder="أهداف اللجنة الاستراتيجية..." />
              </div>
              <button type="submit" className="btn-primary"><Save className="h-4 w-4" /> حفظ الرؤية والأهداف</button>
            </form>
          ) : (
            <p className="text-sm text-gray-400">لا توجد لجنة مرتبطة بحسابك.</p>
          )}
        </div>

        {savedAt && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg animate-fade-in-fast">
            <CheckCircle2 className="ml-2 inline h-4 w-4" /> تم حفظ التغييرات بنجاح
          </div>
        )}
      </div>
    </div>
  );
}
