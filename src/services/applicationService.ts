import { supabase } from '../lib/supabase.ts';
import {
  createApplicationService,
  type ApplicationClient,
} from '../domain/applicationGateway.ts';

const applicationService = createApplicationService(supabase as unknown as ApplicationClient);

export const listVisibleStudentApplications = () => applicationService.listVisible();
export const scheduleStudentApplicationInterview = applicationService.scheduleInterview;
export const decideStudentApplication = applicationService.decide;
