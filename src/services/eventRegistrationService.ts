import { supabase } from '../lib/supabase.ts';
import {
  createEventRegistrationGateway,
  type EventRegistrationClient,
  type EventRegistrationResult,
  type ServiceError,
  type ServiceResult,
} from '../domain/eventRegistrationGateway.ts';

const gateway = createEventRegistrationGateway(supabase as unknown as EventRegistrationClient);

export type { EventRegistrationResult, ServiceError, ServiceResult };

export function registerForEventParticipation(
  eventId: string,
): Promise<ServiceResult<EventRegistrationResult>> {
  return gateway.register(eventId);
}

export function unregisterFromEventParticipation(
  eventId: string,
): Promise<ServiceResult<EventRegistrationResult>> {
  return gateway.unregister(eventId);
}

export function listMyRegisteredEventIds(): Promise<ServiceResult<string[]>> {
  return gateway.listMyRegisteredEventIds();
}

export const registerForEvent = registerForEventParticipation;
export const unregisterFromEvent = unregisterFromEventParticipation;
