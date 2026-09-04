export interface MonthlyCountPoint {
  year: number;
  month: number;
  count: number;
}

export interface DashboardAnalyticsMetrics {
  totalMembersCount: number;
  activeMembersCount: number;
  pendingApplicationsCount: number;
  sixMonthMemberGrowth: MonthlyCountPoint[];
  sixMonthEventParticipations: MonthlyCountPoint[];
  eventParticipationById: Record<string, number>;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface RealtimeSubscriptionFilter {
  event: string;
  schema: string;
  table: string;
  filter?: string;
}

export interface DashboardRealtimeChannel {
  on(
    type: 'postgres_changes',
    filter: RealtimeSubscriptionFilter,
    callback: (payload: unknown) => void,
  ): DashboardRealtimeChannel;
  subscribe(callback?: (status: string, error?: unknown) => void): DashboardRealtimeChannel;
}

export interface DashboardRealtimeClient {
  channel(topic: string): DashboardRealtimeChannel;
  removeChannel(channel: DashboardRealtimeChannel): Promise<unknown> | unknown;
}

export interface DashboardAnalyticsClient {
  rpc(
    name: 'get_admin_dashboard_metrics',
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

const safeNumber = (val: unknown): number =>
  typeof val === 'number' && Number.isFinite(val) ? val : 0;

function parseMonthlyPoints(raw: unknown): MonthlyCountPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: MonthlyCountPoint[] = [];

  for (const item of raw) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const yr = safeNumber(rec.year);
      const mon = safeNumber(rec.month);
      const c = safeNumber(rec.count);
      if (yr > 0 && mon >= 1 && mon <= 12) {
        points.push({ year: yr, month: mon, count: c });
      }
    }
  }

  return points;
}

function parseParticipationById(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === 'string' && key.trim()) {
      out[key.trim()] = safeNumber(val);
    }
  }

  return out;
}

export function mapDashboardAnalyticsMetrics(raw: unknown): DashboardAnalyticsMetrics {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') {
    return {
      totalMembersCount: 0,
      activeMembersCount: 0,
      pendingApplicationsCount: 0,
      sixMonthMemberGrowth: [],
      sixMonthEventParticipations: [],
      eventParticipationById: {},
    };
  }

  const rec = row as Record<string, unknown>;

  return {
    totalMembersCount: safeNumber(rec.total_members_count),
    activeMembersCount: safeNumber(rec.active_members_count),
    pendingApplicationsCount: safeNumber(rec.pending_applications_count),
    sixMonthMemberGrowth: parseMonthlyPoints(rec.six_month_member_growth),
    sixMonthEventParticipations: parseMonthlyPoints(rec.six_month_event_participations),
    eventParticipationById: parseParticipationById(rec.event_participation_by_id),
  };
}

export function createDashboardAnalyticsGateway(
  client: DashboardAnalyticsClient & Partial<DashboardRealtimeClient>,
) {
  return {
    async loadMetrics(): Promise<ServiceResult<DashboardAnalyticsMetrics>> {
      try {
        const response = await client.rpc('get_admin_dashboard_metrics');
        if (response.error) {
          const err = response.error as Record<string, unknown>;
          return {
            ok: false,
            error: {
              code: typeof err.code === 'string' ? err.code : 'ANALYTICS_LOAD_FAILED',
              message: typeof err.message === 'string' ? err.message : 'تعذر تحميل إحصائيات لوحة التحكم.',
              details: typeof err.details === 'string' ? err.details : undefined,
            },
          };
        }

        return {
          ok: true,
          data: mapDashboardAnalyticsMetrics(response.data),
        };
      } catch (err: unknown) {
        const errorLike = err as Record<string, unknown> | null;
        return {
          ok: false,
          error: {
            code: 'ANALYTICS_LOAD_UNEXPECTED',
            message: 'حدث خطأ غير متوقع أثناء تحميل إحصائيات الإدارة.',
            details: typeof errorLike?.message === 'string' ? errorLike.message : undefined,
          },
        };
      }
    },

    subscribeToUpdates(
      onUpdate: () => void,
      options: { debounceMs?: number } = {},
    ): () => void {
      if (typeof client.channel !== 'function' || typeof client.removeChannel !== 'function') {
        return () => {};
      }

      const debounceMs = options.debounceMs ?? 300;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let disposed = false;

      const trigger = () => {
        if (disposed) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (disposed) return;
          onUpdate();
        }, debounceMs);
      };

      const channel = client
        .channel('dashboard-analytics-events')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'dashboard_analytics_events' },
          trigger,
        );

      channel.subscribe();

      return () => {
        disposed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void client.removeChannel?.(channel);
      };
    },
  };
}
