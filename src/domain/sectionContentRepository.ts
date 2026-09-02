export interface RepositoryError {
  code: string;
  message: string;
  details?: string;
}

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RepositoryError };

export interface StudentGuideContent {
  quickInfo: string;
  sections: unknown[];
  version: number;
  updatedAt: string;
}

export interface FaqContent {
  categories: unknown[];
  version: number;
  updatedAt: string;
}

export interface CmsPublication {
  target: string;
  payload: unknown;
  version: number;
  updatedAt: string;
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface QueryResponse {
  data: unknown;
  error: ErrorLike | null;
}

interface SingletonQuery {
  select(columns: string): SingletonQuery;
  eq(column: string, value: string): SingletonQuery;
  maybeSingle(): Promise<QueryResponse>;
}

export interface SectionContentClient {
  from(table: 'student_guide' | 'faq'): SingletonQuery;
  rpc(
    name: 'publish_cms_target' | 'create_published_event',
    args: Record<string, unknown>,
  ): Promise<QueryResponse>;
}

const fail = <T>(code: string, message: string, error?: ErrorLike | null): RepositoryResult<T> => ({
  ok: false,
  error: {
    code,
    message,
    ...(typeof error?.details === 'string' && error.details ? { details: error.details } : {}),
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const validVersionedRow = (row: Record<string, unknown>): boolean => (
  Number.isSafeInteger(row.version)
  && Number(row.version) > 0
  && typeof row.updated_at === 'string'
  && row.updated_at.length > 0
);

export function parseCmsPublication(value: unknown): CmsPublication | null {
  if (!isRecord(value)
    || typeof value.target !== 'string'
    || !value.target
    || !Object.prototype.hasOwnProperty.call(value, 'payload')
    || !validVersionedRow(value)) return null;
  return {
    target: value.target,
    payload: value.payload,
    version: Number(value.version),
    updatedAt: value.updated_at as string,
  };
}

export function createSectionContentRepository(client: SectionContentClient) {
  return {
    async loadGuide(): Promise<RepositoryResult<StudentGuideContent | null>> {
      const response = await client
        .from('student_guide')
        .select('quick_info,sections,version,updated_at')
        .eq('id', 'main')
        .maybeSingle();
      if (response.error) {
        return fail(
          typeof response.error.code === 'string' ? response.error.code : 'GUIDE_CONTENT_LOAD_FAILED',
          'تعذر تحميل دليل الطالب من الخادم.',
          response.error,
        );
      }
      if (response.data === null) return { ok: true, data: null };
      if (!isRecord(response.data)
        || typeof response.data.quick_info !== 'string'
        || !response.data.quick_info.trim()
        || !Array.isArray(response.data.sections)
        || !validVersionedRow(response.data)) {
        return fail('SECTION_CONTENT_RESPONSE_INVALID', 'أعاد الخادم محتوى دليل غير صالح.');
      }
      return {
        ok: true,
        data: {
          quickInfo: response.data.quick_info,
          sections: response.data.sections,
          version: Number(response.data.version),
          updatedAt: response.data.updated_at as string,
        },
      };
    },

    async loadFaq(): Promise<RepositoryResult<FaqContent | null>> {
      const response = await client
        .from('faq')
        .select('categories,version,updated_at')
        .eq('id', 'main')
        .maybeSingle();
      if (response.error) {
        return fail(
          typeof response.error.code === 'string' ? response.error.code : 'FAQ_CONTENT_LOAD_FAILED',
          'تعذر تحميل الأسئلة الشائعة من الخادم.',
          response.error,
        );
      }
      if (response.data === null) return { ok: true, data: null };
      if (!isRecord(response.data)
        || !Array.isArray(response.data.categories)
        || !validVersionedRow(response.data)) {
        return fail('SECTION_CONTENT_RESPONSE_INVALID', 'أعاد الخادم محتوى أسئلة غير صالح.');
      }
      return {
        ok: true,
        data: {
          categories: response.data.categories,
          version: Number(response.data.version),
          updatedAt: response.data.updated_at as string,
        },
      };
    },

    async publish(target: string, payload: unknown, expectedVersion: number): Promise<RepositoryResult<CmsPublication>> {
      const response = await client.rpc('publish_cms_target', {
        p_target: target,
        p_payload: payload,
        p_expected_version: expectedVersion,
      });
      if (response.error) {
        const conflict = response.error.code === '40001'
          || response.error.message === 'CONTENT_VERSION_CONFLICT';
        return fail(
          conflict
            ? 'CONTENT_VERSION_CONFLICT'
            : typeof response.error.code === 'string'
              ? response.error.code
              : 'CMS_TARGET_PUBLISH_FAILED',
          conflict
            ? 'نُشر تعديل أحدث. حدّث الصفحة ثم أعد المحاولة.'
            : 'تعذر نشر المحتوى على الخادم.',
          response.error,
        );
      }
      const publication = parseCmsPublication(response.data);
      return publication
        ? { ok: true, data: publication }
        : fail('SECTION_CONTENT_RESPONSE_INVALID', 'أعاد الخادم نتيجة نشر غير صالحة.');
    },

    async createEvent(event: unknown, expectedVersion: number): Promise<RepositoryResult<CmsPublication>> {
      const response = await client.rpc('create_published_event', {
        p_event: event,
        p_expected_version: expectedVersion,
      });
      if (response.error) {
        const conflict = response.error.code === '40001'
          || response.error.message === 'CONTENT_VERSION_CONFLICT';
        return fail(
          conflict
            ? 'CONTENT_VERSION_CONFLICT'
            : typeof response.error.code === 'string'
              ? response.error.code
              : 'EVENT_CREATION_FAILED',
          conflict
            ? 'أضيفت فعالية أحدث. حدّث الصفحة ثم أعد المحاولة.'
            : 'تعذر إنشاء الفعالية على الخادم.',
          response.error,
        );
      }
      const publication = parseCmsPublication(response.data);
      return publication?.target === 'events'
        ? { ok: true, data: publication }
        : fail('SECTION_CONTENT_RESPONSE_INVALID', 'أعاد الخادم نتيجة إنشاء فعالية غير صالحة.');
    },
  };
}
