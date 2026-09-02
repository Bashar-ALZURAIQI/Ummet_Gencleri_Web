export const ACTIVITY_TYPES = ['MANDATORY', 'OPTIONAL', 'PAID'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_DECISIONS = ['JOINING', 'DECLINING', 'IGNORED'] as const;
export type ActivityDecision = (typeof ACTIVITY_DECISIONS)[number];

export const EXCUSE_REVIEW_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PARTIAL',
  'REJECTED',
] as const;
export type ExcuseReviewStatus = (typeof EXCUSE_REVIEW_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['ON_TIME', 'LATE', 'VERY_LATE', 'ABSENT'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const TASK_STATUSES = ['OPEN', 'FULL', 'CLOSED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_COMPLETION_STATUSES = ['PENDING', 'PERFECT', 'PARTIAL', 'FAILED'] as const;
export type TaskCompletionStatus = (typeof TASK_COMPLETION_STATUSES)[number];

export interface ProfileEconomyFields {
  total_points: number;
  current_tier: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  created_by: string;
  type: ActivityType;
  points_value: number;
  max_capacity: number | null;
  deadline: string;
  created_at: string;
  updated_at: string;
  public_event_id?: string | null;
  evaluation_closed_at?: string | null;
  evaluation_closed_by?: string | null;
}

export interface ActivityEnrollment {
  id?: string;
  activity_id: string;
  student_id: string;
  decision: ActivityDecision;
  excuse_text: string | null;
  excuse_status: ExcuseReviewStatus | null;
  attendance_status: AttendanceStatus | null;
  paid_charge_cycle?: number;
  paid_fee_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface InternalEconomyTask {
  id: string;
  title: string;
  description: string;
  points_reward: number;
  created_by: string;
  required_students: number;
  deadline: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  evaluation_closed_at?: string | null;
  evaluation_closed_by?: string | null;
}

export interface TaskEnrollment {
  task_id: string;
  student_id: string;
  completion_status: TaskCompletionStatus;
  created_at: string;
  updated_at: string;
}

export interface PointsLedgerEntry {
  id: string;
  student_id: string;
  amount: number;
  reason: string;
  created_by: string;
  source_key: string;
  created_at: string;
}

export interface CreateActivityInput {
  title: string;
  description: string;
  created_by: string;
  type: ActivityType;
  points_value: number;
  max_capacity: number | null;
  deadline: string;
}

export interface StudentActivityEnrollmentInput {
  activity_id: string;
  decision: ActivityDecision;
  excuse_text?: string | null;
}

export interface StudentActivityEnrollmentUpdate {
  decision?: ActivityDecision;
  excuse_text?: string | null;
}

export interface ActivityEnrollmentReviewInput {
  activity_id: string;
  student_id: string;
  excuse_status: ExcuseReviewStatus | null;
  attendance_status: AttendanceStatus | null;
}

export interface CreateInternalEconomyTaskInput {
  title: string;
  description: string;
  points_reward: number;
  created_by: string;
  required_students: number;
  deadline: string;
  status?: TaskStatus;
}

export interface StudentTaskEnrollmentInput {
  task_id: string;
}

export interface TaskEnrollmentReviewInput {
  task_id: string;
  student_id: string;
  completion_status: TaskCompletionStatus;
}

export interface RecordPointsTransactionInput {
  student_id: string;
  amount: number;
  reason: string;
  source_key: string;
}

export interface SetMemberTierInput {
  student_id: string;
  current_tier: string;
}

export interface SetMemberTierResult extends ProfileEconomyFields {
  student_id: string;
}

export interface SetOwnActivityEnrollmentRpcArgs {
  p_activity_id: string;
  p_decision: ActivityDecision;
  p_excuse_text?: string | null;
}

export interface RegisterForTaskRpcArgs {
  p_task_id: string;
}

export interface RecordPointsTransactionRpcArgs {
  p_student_id: string;
  p_amount: number;
  p_reason: string;
  p_source_key: string;
}

export interface ReviewActivityEnrollmentRpcArgs {
  p_activity_id: string;
  p_student_id: string;
  p_excuse_status: ExcuseReviewStatus | null;
  p_attendance_status: AttendanceStatus | null;
}

export interface ReviewTaskEnrollmentRpcArgs {
  p_task_id: string;
  p_student_id: string;
  p_completion_status: TaskCompletionStatus;
}

export interface SetMemberTierRpcArgs {
  p_student_id: string;
  p_current_tier: string;
}

export interface StudentActivityBoardItem {
  activityId: string;
  publicEventId: string;
  title: string;
  description: string;
  type: ActivityType;
  pointsValue: number;
  maxCapacity: number | null;
  deadline: string;
  joiningCount: number;
  remainingCapacity: number | null;
  decision: ActivityDecision | null;
  excuseText: string | null;
  totalPoints: number;
  canParticipate: boolean;
  economyExempt: boolean;
}

export interface StudentTaskBoardItem {
  taskId: string;
  title: string;
  description: string;
  pointsReward: number;
  requiredStudents: number;
  deadline: string;
  status: TaskStatus;
  enrollmentCount: number;
  isEnrolled: boolean;
  completionStatus: TaskCompletionStatus | null;
}

export interface UpsertEventActivityInput {
  publicEventId: string;
  title: string;
  description: string;
  type: ActivityType;
  pointsValue: number;
  maxCapacity: number;
  deadline: string;
}

export interface CreateInternalTaskInput {
  title: string;
  description: string;
  pointsReward: number;
  requiredStudents: number;
  deadline: string;
}

export interface PendingMandatoryExcuse {
  enrollmentId: string;
  activityId: string;
  activityTitle: string;
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  excuseText: string;
  submittedAt: string;
}

export interface ActivityEvaluationRow {
  activityId: string;
  activityTitle: string;
  activityType: ActivityType;
  pointsValue: number;
  deadline: string;
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  attendanceStatus: AttendanceStatus | null;
}

export interface TaskEvaluationRow {
  taskId: string;
  taskTitle: string;
  pointsReward: number;
  deadline: string;
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  completionStatus: TaskCompletionStatus;
}

export interface ManagedTaskSummary {
  taskId: string;
  title: string;
  description: string;
  pointsReward: number;
  requiredStudents: number;
  deadline: string;
  status: Exclude<TaskStatus, 'CLOSED'>;
  enrollmentCount: number;
  createdBy: string;
  createdByName: string;
}

export interface MemberPointsRow {
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  totalPoints: number;
  currentTier: string;
  needsWarning: boolean;
}

export interface EconomySeason {
  id: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
}

export interface PublicLeaderboardRow {
  rank: number;
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  totalPoints: number;
  currentTier: string;
}

export interface MonthlyStar {
  studentId: string;
  studentName: string;
  avatarPath: string | null;
  pointsLast30Days: number;
}

export interface RecentPointsLedgerEntry {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  createdByName: string | null;
  createdByRole: string | null;
  createdByIsSelf: boolean;
}

export interface OwnGamificationSummary {
  studentId: string;
  totalPoints: number;
  currentTier: string;
  rank: number;
  isTopTen: boolean;
  recentLedger: RecentPointsLedgerEntry[];
}

export interface FinalizationResult {
  entityId: string;
  alreadyFinalized: boolean;
  ledgerEntries: number;
}
