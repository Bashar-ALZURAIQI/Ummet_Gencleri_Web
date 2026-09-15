/** Manual achievements block of the Programs page.
 *  Counts are exclusively editor-provided; they are never derived from events. */
export interface ProgramsAchievements {
  title: string;
  text: string;
  eventsCount: number;
  studentsCount: number;
  universitiesCount: number;
}

/** Safe fallback aligned with the legacy public copy (86 / 1200 / 24). */
export const DEFAULT_PROGRAMS_ACHIEVEMENTS: ProgramsAchievements = {
  title: 'إنجازات نفخر بها',
  text: 'نظّمنا حتى الآن أكثر من {events} فعالية في ورش عمل ومحاضرات وبرامج تدريبية وحملات تطوعية، استفاد منها أكثر من {students} طالب جامعي من {universities} جامعة.',
  eventsCount: 86,
  studentsCount: 1200,
  universitiesCount: 24,
};

/**
 * Fills every missing or invalid achievements field with the safe default so
 * legacy stored content never renders a blank banner before the first edit.
 */
export function normalizeProgramsAchievements(
  value?: Partial<ProgramsAchievements> | null,
): ProgramsAchievements {
  const toNumber = (raw: unknown): number => Number(raw ?? NaN);
  const eventsCount = toNumber(value?.eventsCount);
  const studentsCount = toNumber(value?.studentsCount);
  const universitiesCount = toNumber(value?.universitiesCount);
  return {
    title:
      typeof value?.title === 'string' && value.title.trim()
        ? value.title
        : DEFAULT_PROGRAMS_ACHIEVEMENTS.title,
    text:
      typeof value?.text === 'string' && value.text.trim()
        ? value.text
        : DEFAULT_PROGRAMS_ACHIEVEMENTS.text,
    eventsCount: Number.isFinite(eventsCount)
      ? eventsCount
      : DEFAULT_PROGRAMS_ACHIEVEMENTS.eventsCount,
    studentsCount: Number.isFinite(studentsCount)
      ? studentsCount
      : DEFAULT_PROGRAMS_ACHIEVEMENTS.studentsCount,
    universitiesCount: Number.isFinite(universitiesCount)
      ? universitiesCount
      : DEFAULT_PROGRAMS_ACHIEVEMENTS.universitiesCount,
  };
}

/**
 * Merges the achievements block into any Programs content payload, preserving
 * every unrelated header field and keeping the `achievements` shape complete.
 */
export function withProgramsAchievements<T extends { achievements?: Partial<ProgramsAchievements> | null }>(
  value?: T | null,
): T & { achievements: ProgramsAchievements } {
  if (!value || typeof value !== 'object') {
    return {
      badge: '',
      title: '',
      description: '',
      achievements: { ...DEFAULT_PROGRAMS_ACHIEVEMENTS },
    } as unknown as T & { achievements: ProgramsAchievements };
  }
  return { ...value, achievements: normalizeProgramsAchievements(value.achievements) } as T & { achievements: ProgramsAchievements };
}

/**
 * Replaces the counted placeholders ({events}, {students}, {universities})
 * inside a localized descriptive text with the editor-provided numbers.
 * Texts without placeholders are returned unchanged.
 */
export function interpolateProgramsAchievementsText(
  text: string,
  counts: Pick<ProgramsAchievements, 'eventsCount' | 'studentsCount' | 'universitiesCount'>,
): string {
  return text
    .replace(/\{events\}/g, String(counts.eventsCount))
    .replace(/\{students\}/g, String(counts.studentsCount))
    .replace(/\{universities\}/g, String(counts.universitiesCount));
}