export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const welcomeMessageDismissalKey = (userId: string): string =>
  `welcome_message_dismissed_${userId}`;

export const readWelcomeMessageDismissed = (
  storage: StorageLike,
  userId: string,
): boolean => {
  try {
    return storage.getItem(welcomeMessageDismissalKey(userId)) === 'true';
  } catch {
    return false;
  }
};

export const dismissWelcomeMessage = (
  storage: StorageLike,
  userId: string,
): boolean => {
  try {
    storage.setItem(welcomeMessageDismissalKey(userId), 'true');
    return true;
  } catch {
    return false;
  }
};
