import type { AdminTab } from './appNavigation.ts';
import { isValidAdminTab } from './appNavigation.ts';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
}

function resolveStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  return null;
}

function tabStorageKey(userId: string): string {
  return `ummet_last_admin_tab_${userId.trim()}`;
}

/**
 * Saves the user's last visited Admin tab in session storage.
 * Storage is strictly isolated per authenticated user ID.
 */
export function saveLastAdminTab(
  userId: string,
  tab: AdminTab,
  storage?: StorageLike,
): void {
  if (!userId || !isValidAdminTab(tab)) return;
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return;

  try {
    targetStorage.setItem(tabStorageKey(userId), tab);
  } catch (error) {
    console.warn('Failed to persist admin tab memory to sessionStorage:', error);
  }
}

/**
 * Loads the user's last visited Admin tab from session storage.
 * Returns null if not found or if the stored value is invalid.
 */
export function loadLastAdminTab(
  userId: string,
  storage?: StorageLike,
): AdminTab | null {
  if (!userId) return null;
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return null;

  try {
    const raw = targetStorage.getItem(tabStorageKey(userId));
    return isValidAdminTab(raw) ? raw : null;
  } catch (error) {
    console.warn('Failed to read admin tab memory from sessionStorage:', error);
    return null;
  }
}

/**
 * Clears the stored Admin tab. If a specific userId is provided, clears only
 * that user's record; otherwise clears active user memory if possible.
 */
export function clearLastAdminTab(
  userId?: string,
  storage?: StorageLike,
): void {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return;

  try {
    if (userId) {
      targetStorage.removeItem(tabStorageKey(userId));
    }
  } catch (error) {
    console.warn('Failed to clear admin tab memory from sessionStorage:', error);
  }
}
