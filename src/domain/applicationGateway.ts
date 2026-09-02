import type {
  ApplicationStatus,
  InterviewInfo,
  StudentApplication,
} from '../data/mockData.ts';

interface ServiceError {
  code: string;
  message: string;
  details?: string;
}

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export interface ApplicationClient {
  from(table: 'student_applications'): {
    select(columns: string): {
      order(column: 'created_at', options: { ascending: false }): Promise<{ data: unknown; error: unknown }>;
    };
  };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

const APPLICATION_SELECT_COLUMNS = [
  'id',
  'student_user_id',
  'name',
  'email',
  'university',
  'major',
  'year',
  'phone',
  'motivation',
  'applied_at',
  'status',
  'interview_date',
  'interview_time',
  'interview_meeting_url',
  'decided_at',
  'rejection_reason',
  'created_at',
].join(',');

const text = (value: unknown): string => (
  typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
);

const nullableText = (value: unknown): string | undefined => text(value) || undefined;

const firstRpcRow = (data: unknown): Record<string, unknown> | null => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_CONFIRMED_TEXT_FIELDS = [
  'id',
  'student_user_id',
  'name',
  'email',
  'university',
  'major',
  'year',
  'applied_at',
] as const;

const confirmedRpcRow = (
  data: unknown,
  applicationId: string,
  expectedStatus: ApplicationStatus,
): Record<string, unknown> | null => {
  const row = firstRpcRow(data);
  if (!row) return null;
  if (REQUIRED_CONFIRMED_TEXT_FIELDS.some((field) => !text(row[field]).trim())) return null;
  if (!UUID_PATTERN.test(text(row.student_user_id))) return null;
  if (text(row.id) !== applicationId || text(row.status) !== expectedStatus) return null;
  return row;
};

const failure = <T>(error: unknown, fallbackCode: string, fallbackMessage: string): ServiceResult<T> => {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  return {
    ok: false,
    error: {
      code: typeof candidate?.code === 'string' && candidate.code ? candidate.code : fallbackCode,
      message: typeof candidate?.message === 'string' && candidate.message
        ? candidate.message
        : fallbackMessage,
      ...(typeof candidate?.details === 'string' && candidate.details
        ? { details: candidate.details }
        : {}),
    },
  };
};

export const mapStudentApplication = (row: Record<string, unknown>): StudentApplication => {
  const interviewDate = nullableText(row.interview_date);
  return {
    id: text(row.id),
    studentId: text(row.student_user_id),
    name: text(row.name),
    email: text(row.email),
    university: text(row.university),
    major: text(row.major),
    year: text(row.year),
    phone: nullableText(row.phone),
    motivation: text(row.motivation),
    appliedAt: text(row.applied_at),
    status: text(row.status) as ApplicationStatus,
    ...(interviewDate
      ? {
          interview: {
            date: interviewDate,
            time: text(row.interview_time),
            meetingUrl: text(row.interview_meeting_url),
          },
        }
      : {}),
    decidedAt: nullableText(row.decided_at),
    rejectionReason: nullableText(row.rejection_reason),
  };
};

export function createApplicationService(client: ApplicationClient) {
  return {
    async listVisible(): Promise<ServiceResult<StudentApplication[]>> {
      try {
        const { data, error } = await client
          .from('student_applications')
          .select(APPLICATION_SELECT_COLUMNS)
          .order('created_at', { ascending: false });
        if (error) return failure(error, 'APPLICATIONS_LOAD_FAILED', 'Unable to load applications.');
        return {
          ok: true,
          data: ((data ?? []) as Array<Record<string, unknown>>).map(mapStudentApplication),
        };
      } catch (error) {
        return failure(error, 'APPLICATIONS_LOAD_FAILED', 'Unable to load applications.');
      }
    },

    async scheduleInterview(
      applicationId: string,
      interview: InterviewInfo,
    ): Promise<ServiceResult<StudentApplication>> {
      try {
        const { data, error } = await client.rpc('schedule_student_application_interview', {
          p_application_id: applicationId,
          p_interview_date: interview.date,
          p_interview_time: interview.time,
          p_interview_meeting_url: interview.meetingUrl,
        });
        if (error) return failure(error, 'APPLICATION_INTERVIEW_FAILED', 'Unable to schedule interview.');
        const row = confirmedRpcRow(data, applicationId, 'interview');
        return row
          ? { ok: true, data: mapStudentApplication(row) }
          : data === null || data === undefined || (Array.isArray(data) && data.length === 0)
            ? failure(null, 'APPLICATION_INTERVIEW_EMPTY', 'Interview RPC returned no confirmed row.')
            : failure(null, 'APPLICATION_INTERVIEW_INVALID', 'Interview RPC returned an invalid row.');
      } catch (error) {
        return failure(error, 'APPLICATION_INTERVIEW_FAILED', 'Unable to schedule interview.');
      }
    },

    async decide(
      applicationId: string,
      decision: 'accepted' | 'rejected',
      rejectionReason?: string,
    ): Promise<ServiceResult<StudentApplication>> {
      try {
        const { data, error } = await client.rpc('decide_student_application', {
          p_application_id: applicationId,
          p_decision: decision,
          p_rejection_reason: rejectionReason ?? null,
        });
        if (error) return failure(error, 'APPLICATION_DECISION_FAILED', 'Unable to decide application.');
        const row = confirmedRpcRow(data, applicationId, decision);
        return row
          ? { ok: true, data: mapStudentApplication(row) }
          : data === null || data === undefined || (Array.isArray(data) && data.length === 0)
            ? failure(null, 'APPLICATION_DECISION_EMPTY', 'Decision RPC returned no confirmed row.')
            : failure(null, 'APPLICATION_DECISION_INVALID', 'Decision RPC returned an invalid row.');
      } catch (error) {
        return failure(error, 'APPLICATION_DECISION_FAILED', 'Unable to decide application.');
      }
    },
  };
}
