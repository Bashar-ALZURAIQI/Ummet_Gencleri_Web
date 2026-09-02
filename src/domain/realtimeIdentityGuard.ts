export interface IdentitySubscriptionToken {
  generation: number;
  userId: string;
}

export interface IdentitySubscriptionGeneration {
  activate(userId: string): IdentitySubscriptionToken;
  invalidate(token: IdentitySubscriptionToken): void;
  invalidateAll(): void;
  isActive(token: IdentitySubscriptionToken, userId: string): boolean;
}

export function createIdentitySubscriptionGeneration(): IdentitySubscriptionGeneration {
  let generation = 0;
  let active: IdentitySubscriptionToken | null = null;

  return {
    activate(userId) {
      active = { generation: ++generation, userId };
      return active;
    },
    invalidate(token) {
      if (active?.generation === token.generation && active.userId === token.userId) {
        active = null;
      }
    },
    invalidateAll() {
      generation += 1;
      active = null;
    },
    isActive(token, userId) {
      return active?.generation === token.generation
        && active.userId === token.userId
        && token.userId === userId;
    },
  };
}

const REALTIME_WARNING = 'تعذر الاتصال المباشر بتحديثات الحساب. تم إخفاء الصلاحيات مؤقتاً حتى تأكيد الجلسة وعودة الاتصال.';

export function reduceRealtimeWarning(
  current: string | null,
  event: { kind: 'error' | 'subscribed'; active: boolean },
): string | null {
  if (!event.active) return current;
  return event.kind === 'error' ? REALTIME_WARNING : null;
}
