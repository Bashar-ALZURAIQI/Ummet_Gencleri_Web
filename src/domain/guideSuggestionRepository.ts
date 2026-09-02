import {
  isGuideSuggestionStatus,
  validateGuideSuggestionInput,
  type GuideSuggestionInput,
  type GuideSuggestionStatus,
} from './guideSuggestionPolicy.ts';

export interface GuideSuggestion {
  id: string;
  studentName: string;
  subject: string;
  description: string;
  status: GuideSuggestionStatus;
  createdAt: string;
}

interface ErrorLike { code?: unknown; message?: unknown; details?: unknown }
interface Response { data: unknown; error: ErrorLike | null }
interface MutationFilter { eq(column: 'id', value: string): Promise<Response> }
interface SuggestionSelect {
  order(column: 'created_at', options: { ascending: false }): Promise<Response>;
}
interface SuggestionTable {
  insert(payload: { student_name: string; subject: string; description: string }[]): Promise<Response>;
  select(columns: string): SuggestionSelect;
  update(payload: { status: GuideSuggestionStatus }): MutationFilter;
  delete(): MutationFilter;
}

export interface GuideSuggestionClient {
  from(table: 'guide_suggestions'): SuggestionTable;
}

export type GuideSuggestionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: string } };

const SELECT_COLUMNS = 'id,student_name,subject,description,status,created_at';

const fail = <T>(error: ErrorLike | null | undefined, code: string, message: string): GuideSuggestionResult<T> => ({
  ok: false,
  error: {
    code: typeof error?.code === 'string' && error.code ? error.code : code,
    message: typeof error?.message === 'string' && error.message ? error.message : message,
    ...(typeof error?.details === 'string' && error.details ? { details: error.details } : {}),
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function mapGuideSuggestion(value: unknown): GuideSuggestion | null {
  if (!isRecord(value)
    || !nonEmptyString(value.id)
    || !nonEmptyString(value.student_name)
    || !nonEmptyString(value.subject)
    || !nonEmptyString(value.description)
    || !isGuideSuggestionStatus(value.status)
    || !nonEmptyString(value.created_at)) return null;

  return {
    id: value.id,
    studentName: value.student_name,
    subject: value.subject,
    description: value.description,
    status: value.status,
    createdAt: value.created_at,
  };
}

export function createGuideSuggestionRepository(client: GuideSuggestionClient) {
  return {
    async submit(input: GuideSuggestionInput): Promise<GuideSuggestionResult<void>> {
      const validation = validateGuideSuggestionInput(input);
      if (!validation.ok) {
        return fail(null, 'GUIDE_SUGGESTION_VALIDATION_FAILED', 'يرجى إكمال الحقول المطلوبة بشكل صحيح.');
      }
      try {
        const response = await client.from('guide_suggestions').insert([{
          student_name: validation.value.studentName,
          subject: validation.value.subject,
          description: validation.value.description,
        }]);
        return response.error
          ? fail(response.error, 'GUIDE_SUGGESTION_SUBMIT_FAILED', 'تعذر إرسال الاقتراح.')
          : { ok: true, data: undefined };
      } catch (error) {
        return fail(error as ErrorLike, 'GUIDE_SUGGESTION_SUBMIT_FAILED', 'تعذر إرسال الاقتراح.');
      }
    },

    async list(): Promise<GuideSuggestionResult<GuideSuggestion[]>> {
      try {
        const response = await client.from('guide_suggestions')
          .select(SELECT_COLUMNS)
          .order('created_at', { ascending: false });
        if (response.error) return fail(response.error, 'GUIDE_SUGGESTIONS_LOAD_FAILED', 'تعذر تحميل اقتراحات الدليل.');
        if (!Array.isArray(response.data)) return fail(null, 'GUIDE_SUGGESTIONS_RESPONSE_INVALID', 'أعاد الخادم قائمة غير صالحة.');
        const rows = response.data.map(mapGuideSuggestion);
        return rows.every(Boolean)
          ? { ok: true, data: rows as GuideSuggestion[] }
          : fail(null, 'GUIDE_SUGGESTIONS_RESPONSE_INVALID', 'أعاد الخادم اقتراحاً غير صالح.');
      } catch (error) {
        return fail(error as ErrorLike, 'GUIDE_SUGGESTIONS_LOAD_FAILED', 'تعذر تحميل اقتراحات الدليل.');
      }
    },

    async updateStatus(id: string, status: GuideSuggestionStatus): Promise<GuideSuggestionResult<void>> {
      if (!isGuideSuggestionStatus(status)) return fail(null, 'GUIDE_SUGGESTION_STATUS_INVALID', 'حالة الاقتراح غير صالحة.');
      try {
        const response = await client.from('guide_suggestions').update({ status }).eq('id', id);
        return response.error
          ? fail(response.error, 'GUIDE_SUGGESTION_UPDATE_FAILED', 'تعذر تحديث حالة الاقتراح.')
          : { ok: true, data: undefined };
      } catch (error) {
        return fail(error as ErrorLike, 'GUIDE_SUGGESTION_UPDATE_FAILED', 'تعذر تحديث حالة الاقتراح.');
      }
    },

    async remove(id: string): Promise<GuideSuggestionResult<void>> {
      try {
        const response = await client.from('guide_suggestions').delete().eq('id', id);
        return response.error
          ? fail(response.error, 'GUIDE_SUGGESTION_DELETE_FAILED', 'تعذر حذف الاقتراح.')
          : { ok: true, data: undefined };
      } catch (error) {
        return fail(error as ErrorLike, 'GUIDE_SUGGESTION_DELETE_FAILED', 'تعذر حذف الاقتراح.');
      }
    },
  };
}
