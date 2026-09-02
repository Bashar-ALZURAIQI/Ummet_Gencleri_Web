import { supabase } from '../lib/supabase.ts';
import {
  createApplicationEmailNotificationGateway,
  type ApplicationEmailClient,
  type ApplicationEmailEventType,
} from '../domain/applicationEmailNotification.ts';

const applicationEmailGateway = createApplicationEmailNotificationGateway(
  supabase as unknown as ApplicationEmailClient,
);

export const sendApplicationNotification = (
  applicationId: string,
  eventType: ApplicationEmailEventType,
) => applicationEmailGateway.send(applicationId, eventType);

export const retryApplicationEmailNotification = (
  applicationId: string,
  eventType: ApplicationEmailEventType,
) => applicationEmailGateway.retry(applicationId, eventType);

export const listApplicationEmailNotifications = () => applicationEmailGateway.list();
