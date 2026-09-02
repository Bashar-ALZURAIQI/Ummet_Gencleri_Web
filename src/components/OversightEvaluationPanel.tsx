import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import TransientToast, { type ToastMessage } from './TransientToast';
import UserAvatar from './UserAvatar';
import { activityDraftComplete } from '../domain/phaseThreeEconomy.ts';
import type { ActivityEvaluationRow, AttendanceStatus } from '../domain/internalEconomyTypes.ts';
import { finalizeActivityEvaluation, loadActivityEvaluations, saveActivityAttendance } from '../services/phaseThreeEconomyService.ts';

const attendanceLabels: Record<AttendanceStatus,string> = { ON_TIME:'في الوقت (100%)', LATE:'تأخر قليلاً (75%)', VERY_LATE:'تأخر جداً (30%)', ABSENT:'غائب' };
const groupRows = <T,>(rows: T[], keyOf: (row: T) => string): T[][] => (
  Array.from(rows.reduce((groups, row) => {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
    return groups;
  }, new Map<string, T[]>()).values())
);

export default function OversightEvaluationPanel() {
  const [activities,setActivities]=useState<ActivityEvaluationRow[]>([]);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState<string|null>(null); const [toast,setToast]=useState<ToastMessage|null>(null);
  const notify=(type:ToastMessage['type'],text:string)=>setToast({id:Date.now(),type,text});
  const refresh=useCallback(async()=>{setLoading(true); const a=await loadActivityEvaluations(); setLoading(false);
    if(!a.ok){console.error('activity evaluation load failed',a.error);notify('error',a.error.message);}else setActivities(a.data);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const activityGroups=useMemo(()=>groupRows(activities,row=>row.activityId),[activities]);

  const saveAttendance=async(row:ActivityEvaluationRow,status:AttendanceStatus)=>{setBusy(`${row.activityId}:${row.studentId}`); const result=await saveActivityAttendance(row.activityId,row.studentId,status); setBusy(null);
    if(!result.ok){console.error('attendance save failed',result.error);notify('error',result.error.message);return;} setActivities(cur=>cur.map(item=>item.activityId===row.activityId&&item.studentId===row.studentId?{...item,attendanceStatus:status}:item));};
  const closeActivity=async(rows:ActivityEvaluationRow[])=>{if(!activityDraftComplete(rows)||!confirm('سيتم إغلاق النشاط وتوزيع النقاط نهائياً. هل تريد المتابعة؟'))return;setBusy(rows[0].activityId);const result=await finalizeActivityEvaluation(rows[0].activityId);setBusy(null);if(!result.ok){console.error('activity finalization failed',result.error);notify('error',result.error.message);return;}setActivities(cur=>cur.filter(r=>r.activityId!==rows[0].activityId));notify('success','تم إغلاق النشاط وتوزيع النقاط بنجاح.');};

  return <section className="card p-6" dir="rtl"><TransientToast message={toast} onClose={()=>setToast(null)}/>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold text-navy-900">الرقابة والتحضير</h2><p className="text-sm text-gray-500">احفظ حضور كل طالب ثم أغلق النشاط لتوزيع النقاط ذرياً.</p></div><button className="btn-secondary" onClick={()=>void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/> تحديث</button></div>
    <div className="space-y-5">{activityGroups.map((group)=>{const rows=group??[];if(!rows.length)return null;return <article key={rows[0].activityId} className="rounded-2xl border border-gray-200 p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-extrabold text-navy-900">{rows[0].activityTitle}</h3><p className="text-xs text-gray-500">{rows[0].activityType==='PAID'?'مدفوع: لا تُمنح نقاط حضور':`قيمة النشاط: ${rows[0].pointsValue}`}</p></div><button disabled={!activityDraftComplete(rows)||busy===rows[0].activityId} onClick={()=>void closeActivity(rows)} className="btn-primary"><CheckCircle2 className="h-4 w-4"/> إغلاق وتوزيع النقاط</button></div><div className="space-y-2">{rows.map(row=><div key={row.studentId} className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3"><UserAvatar name={row.studentName} avatarPath={row.avatarPath} className="h-9 w-9"/><span className="min-w-36 flex-1 font-semibold">{row.studentName}</span><select value={row.attendanceStatus??''} disabled={busy===`${row.activityId}:${row.studentId}`} onChange={e=>void saveAttendance(row,e.target.value as AttendanceStatus)} className="input-field max-w-xs"><option value="" disabled>اختر الحضور</option>{Object.entries(attendanceLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>)}</div></article>})}</div>
  </section>;
}
