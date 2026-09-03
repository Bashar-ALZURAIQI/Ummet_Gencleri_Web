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
