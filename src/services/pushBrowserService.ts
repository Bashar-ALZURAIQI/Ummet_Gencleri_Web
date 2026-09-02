import { disablePushSubscription } from './pushSubscriptionService.ts';

export async function detachCurrentPushBindingBeforeLogout(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const result = await disablePushSubscription(subscription.endpoint);
  if (!result.ok) throw new Error(result.error.code);
}
