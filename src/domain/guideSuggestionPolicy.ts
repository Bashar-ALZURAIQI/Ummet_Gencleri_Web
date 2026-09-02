export const GUIDE_SUGGESTION_STATUSES = ['PENDING', 'REVIEWING', 'IMPLEMENTED', 'REJECTED'] as const;

export type GuideSuggestionStatus = typeof GUIDE_SUGGESTION_STATUSES[number];

export interface GuideSuggestionInput {
  studentName: string;
  subject: string;
  description: string;
}

export type GuideSuggestionField = keyof GuideSuggestionInput;

export type GuideSuggestionValidationResult =
  | { ok: true; value: GuideSuggestionInput }
  | { ok: false; errors: Partial<Record<GuideSuggestionField, string>> };

const LIMITS: Record<GuideSuggestionField, number> = {
  studentName: 120,
  subject: 200,
  description: 4000,
};

const REQUIRED_MESSAGES: Record<GuideSuggestionField, string> = {
  studentName: 'اسم الطالب مطلوب.',
  subject: 'موضوع الاقتراح مطلوب.',
  description: 'الشرح أو التفاصيل مطلوبة.',
};

const LENGTH_MESSAGES: Record<GuideSuggestionField, string> = {
  studentName: 'اسم الطالب طويل جداً.',
  subject: 'موضوع الاقتراح طويل جداً.',
  description: 'الشرح أو التفاصيل طويلة جداً.',
};

export function validateGuideSuggestionInput(input: GuideSuggestionInput): GuideSuggestionValidationResult {
  const value: GuideSuggestionInput = {
    studentName: input.studentName.trim(),
    subject: input.subject.trim(),
    description: input.description.trim(),
  };
  const errors: Partial<Record<GuideSuggestionField, string>> = {};

  (Object.keys(value) as GuideSuggestionField[]).forEach((field) => {
    if (!value[field]) errors[field] = REQUIRED_MESSAGES[field];
    else if (value[field].length > LIMITS[field]) errors[field] = LENGTH_MESSAGES[field];
  });

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function canManageGuideSuggestions(role: string | null | undefined): boolean {
  return role === 'PRESIDENT' || role === 'ACADEMIC_HEAD';
}

export function isGuideSuggestionStatus(value: unknown): value is GuideSuggestionStatus {
  return typeof value === 'string' && GUIDE_SUGGESTION_STATUSES.includes(value as GuideSuggestionStatus);
}
