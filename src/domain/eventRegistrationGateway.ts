export interface EventRegistrationResult {
  eventId: string;
  isRegistered: boolean;
  registeredCount: number;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface EventRegistrationClient {
  rpc(
    name: 'register_event_participation' | 'unregister_event_participation' | 'list_my_event_registrations',
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

const safeNumber = (val: unknown): number =>
  typeof val === 'number' && Number.isFinite(val) ? val : 0;

function mapError(error: unknown): ServiceError {
  const err = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  const rawCode = typeof err.code === 'string' ? err.code : '';
  const rawMessage = typeof err.message === 'string' ? err.message : '';

  if (rawCode === '23514' || rawMessage.includes('capacity')) {
    return {
      code: 'EVENT_FULL',
      message: 'اكتمل العدد المحدد للفعالية.',
      details: rawMessage,
    };
  }

  if (rawCode === '22023' && rawMessage.includes('deadline')) {
    return {
      code: 'DEADLINE_PASSED',
      message: 'انتهت مهلة التسجيل في هذه الفعالية.',
      details: rawMessage,
    };
  }

  if (rawCode === '42501') {
    if (rawMessage.includes('suspended') || rawMessage.includes('موقوف')) {
      return {
        code: 'ACCOUNT_SUSPENDED',
        message: 'الحساب موقوف حالياً.',
        details: rawMessage,
      };
    }
    return {
      code: 'UNAUTHORIZED_MEMBER',
      message: 'التسجيل في الفعاليات متاح فقط للأعضاء المقبولين والنشطين.',
      details: rawMessage,
    };
  }

  if (rawCode === 'P0002') {
    return {
      code: 'EVENT_NOT_FOUND',
      message: 'تعذر العثور على الفعالية في دليل الفعاليات.',
      details: rawMessage,
    };
  }

  return {
    code: rawCode || 'REGISTRATION_OPERATION_FAILED',
    message: rawMessage || 'تعذر استكمال عملية التسجيل في الفعالية.',
    details: typeof err.details === 'string' ? err.details : undefined,
  };
}

export function createEventRegistrationGateway(client: EventRegistrationClient) {
  return {
    async register(eventId: string): Promise<ServiceResult<EventRegistrationResult>> {
      try {
        const response = await client.rpc('register_event_participation', {
          p_event_id: eventId,
        });

        if (response.error) {
          return { ok: false, error: mapError(response.error) };
        }

        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        const rec = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;

        return {
          ok: true,
          data: {
            eventId,
            isRegistered: Boolean(rec.is_registered ?? true),
            registeredCount: safeNumber(rec.registered_count),
          },
        };
      } catch (err: unknown) {
        return { ok: false, error: mapError(err) };
      }
    },

    async unregister(eventId: string): Promise<ServiceResult<EventRegistrationResult>> {
      try {
        const response = await client.rpc('unregister_event_participation', {
          p_event_id: eventId,
        });

        if (response.error) {
          return { ok: false, error: mapError(response.error) };
        }

        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        const rec = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;

        return {
          ok: true,
          data: {
            eventId,
            isRegistered: Boolean(rec.is_registered ?? false),
            registeredCount: safeNumber(rec.registered_count),
          },
        };
      } catch (err: unknown) {
        return { ok: false, error: mapError(err) };
      }
    },

    async listMyRegisteredEventIds(): Promise<ServiceResult<string[]>> {
      try {
        const response = await client.rpc('list_my_event_registrations');
        if (response.error) {
          return { ok: false, error: mapError(response.error) };
        }

        const rows = Array.isArray(response.data) ? response.data : [];
        const eventIds = rows
          .map((r: unknown) => {
            if (r && typeof r === 'object') {
              const rec = r as Record<string, unknown>;
              return typeof rec.event_id === 'string' ? rec.event_id : '';
            }
            return '';
          })
          .filter(Boolean);

        return { ok: true, data: eventIds };
      } catch (err: unknown) {
        return { ok: false, error: mapError(err) };
      }
    },
  };
}
