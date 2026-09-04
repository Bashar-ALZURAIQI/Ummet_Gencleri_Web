import { supabase } from '../lib/supabase.ts';
import {
  createDashboardAnalyticsGateway,
  type DashboardAnalyticsClient,
  type DashboardAnalyticsMetrics,
  type ServiceResult,
} from '../domain/dashboardAnalyticsGateway.ts';

const gateway = createDashboardAnalyticsGateway(supabase as unknown as DashboardAnalyticsClient);

export type { DashboardAnalyticsMetrics, MonthlyCountPoint } from '../domain/dashboardAnalyticsGateway.ts';

export function loadAdminDashboardMetrics(): Promise<ServiceResult<DashboardAnalyticsMetrics>> {
  return gateway.loadMetrics();
}

export function subscribeToDashboardAnalyticsUpdates(
  onUpdate: () => void,
  options?: { debounceMs?: number },
): () => void {
  return gateway.subscribeToUpdates(onUpdate, options);
}

export {
  deriveParticipationByCategory,
  calculateParticipationByCategory,
  calculateCategoryDistribution,
  alignMonthlyCountPointsToBuckets,
  deriveAuthoritativeMemberGrowthSeries,
  deriveAuthoritativeEventParticipationSeries,
  generateSixMonthBuckets,
  type ParticipationByCategoryOptions,
  type CategoryDataPoint,
  type SeriesPoint,
  type MonthBucket,
} from '../domain/dashboardAnalytics.ts';
