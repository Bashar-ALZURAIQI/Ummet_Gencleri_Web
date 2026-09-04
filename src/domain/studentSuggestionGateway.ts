import {
  type Suggestion,
  type SuggestionResponse,
  type SuggestionTargetRole,
  type SuggestionStatus,
  SUGGESTION_TARGET_LABEL,
} from '../data/mockData.ts';

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface StudentSuggestionClient {
  rpc(
    name: 'list_visible_student_suggestions',
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
  rpc(
    name: 'submit_student_suggestion',
    args: {
      p_target_role: string;
      p_category: string;
      p_title: string;
      p_content: string;
    },
  ): Promise<{ data: unknown; error: unknown }>;
  rpc(
    name: 'respond_to_student_suggestion',
    args: {
      p_suggestion_id: string;
      p_response_text: string;
      p_new_status: string;
    },
  ): Promise<{ data: unknown; error: unknown }>;
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

const VALID_TARGET_ROLES = new Set<SuggestionTargetRole>([
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
]);

const VALID_STATUSES = new Set<SuggestionStatus>([
  'new',
  'reviewing',
  'implemented',
  'closed',
]);

function normalizeTargetRole(val: unknown): SuggestionTargetRole {
  if (typeof val === 'string' && VALID_TARGET_ROLES.has(val as SuggestionTargetRole)) {
    return val as SuggestionTargetRole;
  }
  return 'PRESIDENT';
}

function normalizeStatus(val: unknown): SuggestionStatus {
  if (typeof val === 'string' && VALID_STATUSES.has(val as SuggestionStatus)) {
    return val as SuggestionStatus;
  }
  return 'new';
}

function normalizeRoleLabel(roleKey: string): string {
  if (roleKey in SUGGESTION_TARGET_LABEL) {
    return SUGGESTION_TARGET_LABEL[roleKey as SuggestionTargetRole];
  }
  return roleKey || 'الإدارة';
}

function formatDateSlice(val: unknown): string {
  if (typeof val === 'string' && val.trim()) {
    return val.trim().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function mapServerResponseToDomain(raw: unknown): SuggestionResponse {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      by: 'الإدارة',
      byRole: 'الإدارة',
      text: '',
      at: new Date().toISOString().slice(0, 10),
    };
  }

  const rec = raw as Record<string, unknown>;
  const rawRole = typeof rec.by_role === 'string' ? rec.by_role : '';
  const byRole = normalizeRoleLabel(rawRole);

  return {
    id: typeof rec.id === 'string' ? rec.id : '',
    by: typeof rec.by === 'string' && rec.by.trim() ? rec.by.trim() : 'الإدارة',
    byRole,
    text: typeof rec.text === 'string' ? rec.text.trim() : '',
    at: formatDateSlice(rec.created_at ?? rec.at),
  };
}

export function mapServerSuggestionToDomain(raw: unknown): Suggestion {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      studentId: '',
      studentName: 'طالب',
      targetRole: 'PRESIDENT',
      category: 'عام',
      title: '',
      content: '',
      status: 'new',
      createdAt: new Date().toISOString().slice(0, 10),
      responses: [],
    };
  }

  const rec = raw as Record<string, unknown>;
  const rawResponses = Array.isArray(rec.responses) ? rec.responses : [];

  return {
    id: typeof rec.id === 'string' ? rec.id : '',
    studentId: typeof rec.student_user_id === 'string' ? rec.student_user_id : '',
    studentName: typeof rec.student_name === 'string' && rec.student_name.trim() ? rec.student_name.trim() : 'طالب',
    studentEmail: typeof rec.student_email === 'string' && rec.student_email.trim() ? rec.student_email.trim() : undefined,
    studentUniversity: typeof rec.student_university === 'string' && rec.student_university.trim() ? rec.student_university.trim() : undefined,
    studentMajor: typeof rec.student_major === 'string' && rec.student_major.trim() ? rec.student_major.trim() : undefined,
    targetRole: normalizeTargetRole(rec.target_role),
    category: typeof rec.category === 'string' && rec.category.trim() ? rec.category.trim() : 'عام',
    title: typeof rec.title === 'string' ? rec.title.trim() : '',
    content: typeof rec.content === 'string' ? rec.content.trim() : '',
    status: normalizeStatus(rec.status),
    createdAt: formatDateSlice(rec.created_at),
    responses: rawResponses.map(mapServerResponseToDomain),
  };
}

export function mapServerSuggestionsToDomain(raw: unknown): Suggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapServerSuggestionToDomain);
}

function parseRpcError(error: unknown): ServiceError {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    return {
      code: typeof err.code === 'string' ? err.code : 'UNKNOWN_ERROR',
      message: typeof err.message === 'string' ? err.message : 'حدث خطأ غير متوقع أثناء معالجة الطلب',
      details: typeof err.details === 'string' ? err.details : undefined,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى',
  };
}

export interface SubmitSuggestionParams {
  targetRole: SuggestionTargetRole;
  category: string;
  title: string;
  content: string;
}

export interface RespondToSuggestionParams {
  suggestionId: string;
  responseText: string;
  newStatus: SuggestionStatus;
}

export function createStudentSuggestionGateway(client: StudentSuggestionClient) {
  return {
    async listSuggestions(): Promise<ServiceResult<Suggestion[]>> {
      try {
        const response = await client.rpc('list_visible_student_suggestions');
        if (response.error) {
          return { ok: false, error: parseRpcError(response.error) };
        }
        return { ok: true, data: mapServerSuggestionsToDomain(response.data) };
      } catch (err) {
        return { ok: false, error: parseRpcError(err) };
      }
    },

    async submitSuggestion(params: SubmitSuggestionParams): Promise<ServiceResult<{ id: string; message: string }>> {
      try {
        const response = await client.rpc('submit_student_suggestion', {
          p_target_role: params.targetRole.trim(),
          p_category: params.category.trim(),
          p_title: params.title.trim(),
          p_content: params.content.trim(),
        });
        if (response.error) {
          return { ok: false, error: parseRpcError(response.error) };
        }
        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          ok: true,
          data: {
            id: typeof rec.suggestion_id === 'string' ? rec.suggestion_id : '',
            message: typeof rec.message === 'string' ? rec.message : 'تم إرسال الاقتراح بنجاح',
          },
        };
      } catch (err) {
        return { ok: false, error: parseRpcError(err) };
      }
    },

    async respondToSuggestion(params: RespondToSuggestionParams): Promise<ServiceResult<{ message: string }>> {
      try {
        const response = await client.rpc('respond_to_student_suggestion', {
          p_suggestion_id: params.suggestionId.trim(),
          p_response_text: params.responseText.trim(),
          p_new_status: params.newStatus.trim(),
        });
        if (response.error) {
          return { ok: false, error: parseRpcError(response.error) };
        }
        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          ok: true,
          data: {
            message: typeof rec.message === 'string' ? rec.message : 'تم إضافة الرد وتحديث الحالة بنجاح',
          },
        };
      } catch (err) {
        return { ok: false, error: parseRpcError(err) };
      }
    },
  };
}
