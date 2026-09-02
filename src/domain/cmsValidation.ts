export interface CmsValidationResult {
  valid: boolean;
  invalid: string[];
}

const required = (pairs: ReadonlyArray<readonly [string, unknown]>): CmsValidationResult => {
  const invalid = pairs
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([field]) => field);
  return { valid: invalid.length === 0, invalid };
};

export const validateGuideSection = (value: { label: string; title: string; intro: string }) => required([
  ['secLabel', value.label],
  ['secTitle', value.title],
  ['secIntro', value.intro],
]);

export const validateGuideItem = (value: { heading: string; body: string }) => required([
  ['itemHeading', value.heading],
  ['itemBody', value.body],
]);

export const validateGuideContact = (value: { label: string; value: string }) => required([
  ['contactLabel', value.label],
  ['contactValue', value.value],
]);

export const validateFaqCategory = (value: { title: string }) => required([
  ['catTitle', value.title],
]);

export const validateFaqItem = (value: { question: string; answer: string }) => required([
  ['qQuestion', value.question],
  ['qAnswer', value.answer],
]);
