export interface SiteContentError {
  code: string;
  message: string;
  details?: string;
}

export type SiteContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SiteContentError };

export interface PublishedSiteContent<TContent extends Record<string, unknown> = Record<string, unknown>> {
  content: TContent;
  version: number;
  updatedAt: string;
}

interface QueryErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface QueryResponse {
  data: unknown;
  error: QueryErrorLike | null;
}

interface SiteContentQuery {
  select(columns: string): SiteContentQuery;
  eq(column: string, value: string): SiteContentQuery;
  maybeSingle(): Promise<QueryResponse>;
}

export interface SiteContentClient {
  from(table: 'published_site_content'): SiteContentQuery;
  rpc(name: 'publish_site_content', args: {
    new_content: Record<string, unknown>;
    expected_version: number;
  }): Promise<QueryResponse>;
}

const failure = <T>(code: string, message: string, error?: QueryErrorLike | null): SiteContentResult<T> => ({
  ok: false,
  error: {
    code,
    message,
    ...(typeof error?.details === 'string' && error.details ? { details: error.details } : {}),
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapPublishedRow(value: unknown): SiteContentResult<PublishedSiteContent> {
  if (!isRecord(value)
    || !isRecord(value.content)
    || !Number.isSafeInteger(value.version)
    || Number(value.version) < 1
    || typeof value.updated_at !== 'string'
    || !value.updated_at) {
    return failure(
      'SITE_CONTENT_RESPONSE_INVALID',
      'أعاد الخادم محتوى غير صالح، لذلك لم يتم نشره في الواجهة.',
    );
  }
  return {
    ok: true,
    data: {
      content: value.content,
      version: Number(value.version),
      updatedAt: value.updated_at,
    },
  };
}

export function createSiteContentRepository(client: SiteContentClient) {
  return {
    async load(): Promise<SiteContentResult<PublishedSiteContent | null>> {
      const response = await client
        .from('published_site_content')
        .select('content,version,updated_at')
        .eq('id', 'main')
        .maybeSingle();
      if (response.error) {
        return failure(
          typeof response.error.code === 'string' ? response.error.code : 'SITE_CONTENT_LOAD_FAILED',
          'تعذر تحميل محتوى الموقع الرسمي من الخادم.',
          response.error,
        );
      }
      if (response.data === null) return { ok: true, data: null };
      return mapPublishedRow(response.data);
    },

    async publish(
      content: Record<string, unknown>,
      expectedVersion: number,
    ): Promise<SiteContentResult<PublishedSiteContent>> {
      const response = await client.rpc('publish_site_content', {
        new_content: content,
        expected_version: expectedVersion,
      });
      if (response.error) {
        const isConflict = response.error.code === '40001'
          || response.error.message === 'CONTENT_VERSION_CONFLICT';
        return failure(
          isConflict
            ? 'CONTENT_VERSION_CONFLICT'
            : typeof response.error.code === 'string'
              ? response.error.code
              : 'SITE_CONTENT_PUBLISH_FAILED',
          isConflict
            ? 'نُشر تعديل أحدث على الموقع. حدّث الصفحة ثم أعد المحاولة.'
            : 'تعذر حفظ محتوى الموقع على الخادم.',
          response.error,
        );
      }
      return mapPublishedRow(response.data);
    },
  };
}
