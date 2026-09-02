/**
 * Strict form validation helpers shared across all data-entry forms.
 * Every form uses: red borders + focus on the first empty field + an Arabic
 * alert, and no submit happens while any required field is blank.
 */

/** True when the value is effectively empty (null/undefined/whitespace-only). */
export const isBlank = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
};

/** Returns the subset of `fields` whose value inside `form` is blank. */
export const emptyFieldsOf = (form: Record<string, unknown>, fields: string[]): string[] =>
  fields.filter((f) => isBlank(form[f]));

/**
 * Marks blank fields as invalid, focuses the first empty field and shows the
 * standard Arabic alert. Returns `true` when the form is valid.
 *
 * Fields must carry `id={`fld_${name}`}` so the helper can focus them.
 */
export const validateRequired = (
  form: Record<string, unknown>,
  fields: string[],
  setInvalid: (ids: string[]) => void,
  alertMsg = 'يرجى تعبئة كافة الحقول المطلوبة قبل الإرسال/الحفظ'
): boolean => {
  const empty = emptyFieldsOf(form, fields);
  setInvalid(empty);
  if (empty.length > 0) {
    const first = document.getElementById(`fld_${empty[0]}`);
    if (first) {
      (first as HTMLElement).focus();
      (first as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
    alert(alertMsg);
    return false;
  }
  return true;
};

/**
 * Validates an arbitrary set of conditions (used for dynamic/grouped fields
 * such as list rows). Each check maps `key` → a field id; checks with
 * `ok: false` are flagged as invalid, the first one is focused, and the
 * standard Arabic alert is shown. Returns `true` when everything passes.
 */
export const validateChecks = (
  checks: { key: string; ok: boolean }[],
  setInvalid: (ids: string[]) => void,
  alertMsg = 'يرجى تعبئة كافة الحقول المطلوبة قبل الإرسال/الحفظ'
): boolean => {
  const empty = checks.filter((c) => !c.ok).map((c) => c.key);
  setInvalid(empty);
  if (empty.length > 0) {
    const first = document.getElementById(`fld_${empty[0]}`);
    if (first) {
      (first as HTMLElement).focus();
      (first as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
    alert(alertMsg);
    return false;
  }
  return true;
};

export type InvalidSetter = (updater: string[] | ((prev: string[]) => string[])) => void;

/** Clear a field's invalid flag as soon as the user types into it. */
export const clearInvalid = (setInvalid: InvalidSetter, field: string): void => {
  setInvalid((prev) => prev.filter((k) => k !== field));
};

/** `true` when the field is currently flagged as invalid (red border). */
export const isInvalid = (invalid: string[], field: string): boolean =>
  invalid.includes(field);

/** Field id used by `validateRequired` to focus the first empty input. */
export const fieldId = (field: string): string => `fld_${field}`;

/**
 * Turkish mobile number rule: exactly 11 digits starting with `05`.
 * Accepts already-sanitized numeric strings (e.g. `05321234567`).
 */
export const isValidPhoneTR = (v: string): boolean => /^05\d{9}$/.test(v);
