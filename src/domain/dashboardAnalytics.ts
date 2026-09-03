import {
  categoryLabels,
  type EventCategory,
  type UEvent,
} from '../data/mockData.ts';

export const EVENT_CATEGORY_HEX_COLORS: Record<EventCategory, string> = {
  workshop: '#1e3454',
  lecture: '#d49a24',
  volunteer: '#10b981',
  training: '#0ea5e9',
  trip: '#f43f5e',
  entertainment: '#8b5cf6',
  visit: '#ec4899',
};

export const ARABIC_CALENDAR_MONTHS = [
  'ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
  'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
] as const;

export interface MonthBucket {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  key: string;   // "YYYY-MM"
  label: string; // Arabic short month label e.g. "ينا", "فبر"
}

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface CategoryDataPoint {
  category?: EventCategory;
  label: string;
  value: number;
  color: string;
}

/**
 * Generates 6 sequential calendar month buckets backwards from the reference date.
 * Accurately handles year boundaries (e.g. crossing Dec to Jan).
 */
export function generateSixMonthBuckets(referenceDate: Date = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  for (let i = 5; i >= 0; i--) {
    const target = new Date(refYear, refMonth - i, 1);
    const yr = target.getFullYear();
    const m = target.getMonth();
    buckets.push({
      year: yr,
      month: m,
      key: `${yr}-${String(m + 1).padStart(2, '0')}`,
      label: ARABIC_CALENDAR_MONTHS[m],
    });
  }

  return buckets;
}

export interface MemberGrowthInputItem {
  id?: string;
  status: string;
  decidedAt?: string | null;
}

/**
 * Calculates the monthly accepted member growth series over 6 calendar month buckets.
 * Source: student_applications.status === 'accepted' AND decided_at.
 * Items with null/undefined decidedAt are strictly excluded without date fabrication.
 */
export function calculateMemberGrowthSeries(
  applications: MemberGrowthInputItem[],
  buckets: MonthBucket[],
): SeriesPoint[] {
  const countsByKey = new Map<string, number>();
  for (const bucket of buckets) {
    countsByKey.set(bucket.key, 0);
  }

  for (const app of applications) {
    if (app.status !== 'accepted') continue;
    if (!app.decidedAt) continue;

    const parsed = new Date(app.decidedAt);
    if (Number.isNaN(parsed.getTime())) continue;

    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    if (countsByKey.has(key)) {
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
    }
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: countsByKey.get(bucket.key) ?? 0,
  }));
}

export interface EventRegistrationInputItem {
  eventId?: string;
  userId?: string;
  status: 'active' | 'cancelled';
  registeredAt: string;
}

/**
 * Calculates the monthly event registrations series over 6 calendar month buckets ("تسجيلات الفعاليات").
 * Counts genuine registration cycles by registered_at.
 * A later cancellation does NOT erase the historical registration cycle.
 * Pre-ledger months report 0.
 */
export function calculateEventParticipationSeries(
  registrations: EventRegistrationInputItem[],
  buckets: MonthBucket[],
): SeriesPoint[] {
  const countsByKey = new Map<string, number>();
  for (const bucket of buckets) {
    countsByKey.set(bucket.key, 0);
  }

  for (const reg of registrations) {
    if (!reg.registeredAt) continue;

    const parsed = new Date(reg.registeredAt);
    if (Number.isNaN(parsed.getTime())) continue;

    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    if (countsByKey.has(key)) {
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
    }
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: countsByKey.get(bucket.key) ?? 0,
  }));
}

export interface ProfileInputItem {
  id: string;
  status: 'active' | 'inactive' | 'removed' | 'banned' | string;
}

export interface ApplicationInputItem {
  studentUserId?: string;
  status: string;
}

/**
 * Authoritative Total Members Semantic:
 * - Deduplicated set of all profiles with status = 'active'
 *   (including administratively bootstrapped executive accounts)
 * - PLUS profiles with status = 'inactive' that have a student_application with status = 'accepted'.
 * - Excludes: 'removed', 'banned', pending applicants, rejected applicants, anonymous users.
 * - Prevents duplicate counting when an active profile also has an accepted application.
 */
export function calculateTotalMembersCount(
  profiles: ProfileInputItem[],
  applications: ApplicationInputItem[],
): number {
  const acceptedUserIds = new Set<string>();
  for (const app of applications) {
    if (app.status === 'accepted' && app.studentUserId) {
      acceptedUserIds.add(app.studentUserId);
    }
  }

  const memberIds = new Set<string>();

  for (const profile of profiles) {
    if (!profile.id) continue;
    if (profile.status === 'removed' || profile.status === 'banned') continue;

    if (profile.status === 'active') {
      memberIds.add(profile.id);
    } else if (profile.status === 'inactive' && acceptedUserIds.has(profile.id)) {
      memberIds.add(profile.id);
    }
  }

  return memberIds.size;
}

/**
 * Authoritative Active Members Semantic:
 * - Every profile with status = 'active'.
 */
export function calculateActiveMembersCount(profiles: ProfileInputItem[]): number {
  return profiles.filter((p) => p.status === 'active').length;
}

/**
 * Calculates event count distribution by category from currently published CMS events.
 * Categories with 0 events are filtered out.
 */
export function calculateCategoryDistribution(
  events: Pick<UEvent, 'category'>[],
): CategoryDataPoint[] {
  const counts: Record<EventCategory, number> = {
    workshop: 0,
    lecture: 0,
    volunteer: 0,
    training: 0,
    trip: 0,
    entertainment: 0,
    visit: 0,
  };

  for (const e of events) {
    if (e.category && counts[e.category] !== undefined) {
      counts[e.category]++;
    }
  }

  const categories = Object.keys(categoryLabels) as EventCategory[];
  return categories
    .filter((c) => counts[c] > 0)
    .map((c) => ({
      label: categoryLabels[c],
      value: counts[c],
      color: EVENT_CATEGORY_HEX_COLORS[c],
    }));
}

/**
 * Calculates event participation by category by summing active registrations
 * mapped to currently published event categories.
 */
export function calculateParticipationByCategory(
  events: Pick<UEvent, 'id' | 'category'>[],
  activeRegistrationsByEventId: Record<string, number>,
): CategoryDataPoint[] {
  const sums: Record<EventCategory, number> = {
    workshop: 0,
    lecture: 0,
    volunteer: 0,
    training: 0,
    trip: 0,
    entertainment: 0,
    visit: 0,
  };

  for (const e of events) {
    if (!e.id || !e.category || sums[e.category] === undefined) continue;
    const count = activeRegistrationsByEventId[e.id] ?? 0;
    if (count > 0) {
      sums[e.category] += count;
    }
  }

  const categories = Object.keys(categoryLabels) as EventCategory[];
  return categories
    .filter((c) => sums[c] > 0)
    .map((c) => ({
      category: c,
      label: categoryLabels[c],
      value: sums[c],
      color: EVENT_CATEGORY_HEX_COLORS[c],
    }));
}
