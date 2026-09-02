import { validateAvatarFile, type AvatarFileLike } from './accountIdentity.ts';

export interface EditableProfileForm {
  name?: unknown;
  contactEmail?: unknown;
  phone?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  bio?: unknown;
}

export interface EditableProfilePayload {
  name: string;
  contactEmail: string;
  phone: string;
  university: string;
  major: string;
  year: string;
  bio: string;
  [key: string]: unknown;
}

export type ProfileValidation = { ok: true } | { ok: false; error: string };

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildProfileUpdatePayload(input: EditableProfileForm): EditableProfilePayload {
  return {
    name: text(input.name),
    contactEmail: text(input.contactEmail),
    phone: text(input.phone),
    university: text(input.university),
    major: text(input.major),
    year: text(input.year),
    bio: text(input.bio),
  };
}

export function validateContactEmail(value: string): ProfileValidation {
  const email = value.trim();
  return !email || CONTACT_EMAIL_PATTERN.test(email)
    ? { ok: true }
    : { ok: false, error: 'يرجى إدخال بريد تواصل صالح.' };
}

export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): ProfileValidation {
  if (!currentPassword) return { ok: false, error: 'يرجى إدخال كلمة المرور الحالية.' };
  if (newPassword.length < 8) return { ok: false, error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.' };
  if (newPassword !== confirmation) return { ok: false, error: 'تأكيد كلمة المرور الجديدة غير مطابق.' };
  return { ok: true };
}

export function validateProfileAvatar(file: AvatarFileLike): ProfileValidation {
  const result = validateAvatarFile(file);
  if (result.valid) return { ok: true };
  return result.error === 'unsupported-type'
    ? { ok: false, error: 'صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.' }
    : { ok: false, error: 'حجم الصورة أكبر من 5 ميجابايت.' };
}
