import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

const getObjectKeysRecursively = (obj, prefix = '') => {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getObjectKeysRecursively(value, fullPath);
    }
    return [fullPath];
  });
};

test('1. AR/TR/EN dictionaries expose required auth keys', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredAuthKeys = [
    'auth.login',
    'auth.loginTitle',
    'auth.loginSubtitle',
    'auth.registerTitle',
    'auth.forgotPasswordTitle',
    'auth.forgotPasswordSubtitle',
    'auth.updatePasswordTitle',
    'auth.updatePasswordSubtitle',
    'auth.verifyingRecoveryTitle',
    'auth.verifyingRecoverySubtitle',
    'auth.verifyingRecoveryMessage',
    'auth.invalidLinkTitle',
    'auth.invalidLinkSubtitle',
    'auth.invalidLinkAlert',
    'auth.requestNewResetLink',
    'auth.email',
    'auth.password',
    'auth.newPassword',
    'auth.confirmPassword',
    'auth.fullName',
    'auth.namePlaceholder',
    'auth.university',
    'auth.universityPlaceholder',
    'auth.major',
    'auth.majorPlaceholder',
    'auth.year',
    'auth.selectYearPlaceholder',
    'auth.years.first',
    'auth.years.second',
    'auth.years.third',
    'auth.years.fourth',
    'auth.years.postgraduate',
    'auth.phone',
    'auth.phoneHelper',
    'auth.motivation',
    'auth.motivationPlaceholder',
    'auth.loginAction',
    'auth.loggingIn',
    'auth.forgotPassword',
    'auth.noAccount',
    'auth.createAccountLink',
    'auth.haveAccount',
    'auth.loginLink',
    'auth.submitApplication',
    'auth.creatingAccount',
    'auth.sendResetLink',
    'auth.sendingResetLink',
    'auth.backToLogin',
    'auth.saveNewPassword',
    'auth.savingNewPassword',
    'auth.passwordUpdated',
    'auth.showPassword',
    'auth.hidePassword',
    'auth.registrationNoticeLabel',
    'auth.registrationNoticeText',
    'auth.passwordHint',
    'auth.registrationSuccess',
    'auth.errors.fillEmailPassword',
    'auth.errors.invalidCredentials',
    'auth.errors.invalidEmail',
    'auth.errors.resetLinkSent',
    'auth.errors.resetLinkFailed',
    'auth.errors.passwordMin8',
    'auth.errors.passwordMismatch',
    'auth.errors.updatePasswordFailed',
    'auth.errors.updatePasswordSuccess',
    'auth.errors.fillRequired',
    'auth.errors.phoneFormat',
    'auth.errors.registrationFailed',
    'common.requiredField',
  ];

  const arKeys = new Set(getObjectKeysRecursively(ar));
  const trKeys = new Set(getObjectKeysRecursively(tr));
  const enKeys = new Set(getObjectKeysRecursively(en));

  for (const k of requiredAuthKeys) {
    assert.ok(arKeys.has(k), `Missing key in ar.ts: ${k}`);
    assert.ok(trKeys.has(k), `Missing key in tr.ts: ${k}`);
    assert.ok(enKeys.has(k), `Missing key in en.ts: ${k}`);
  }
});

test('2. Recursive dictionary parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = getObjectKeysRecursively(ar).sort();
  const trKeys = getObjectKeysRecursively(tr).sort();
  const enKeys = getObjectKeysRecursively(en).sort();

  assert.deepEqual(arKeys, trKeys, 'ar and tr key sets must match');
  assert.deepEqual(arKeys, enKeys, 'ar and en key sets must match');
});

test('3. LoginPage static labels use translations', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /useTranslation/, 'AuthPages.tsx must import useTranslation');
  // Should not have raw Arabic titles in LoginPage
  assert.doesNotMatch(code, /<AuthShell\s+title="تسجيل الدخول"/);
  assert.doesNotMatch(code, /subtitle="ادخل إلى بوابتك الخاصة"/);
  assert.match(code, /t\(['"]auth\.forgotPassword['"]/);
  assert.doesNotMatch(code, />\s*هل نسيت كلمة المرور؟\s*</);
  assert.doesNotMatch(code, /'جارٍ الدخول\.\.\.'\s*:\s*'دخول'/);
  assert.doesNotMatch(code, /ليس لديك حساب؟/);
  assert.doesNotMatch(code, />\s*أنشئ حسابًا\s*</);
});

test('4. RegisterPage static labels use translations', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /<AuthShell\s+title="إنشاء حساب جديد"/);
  assert.doesNotMatch(code, />ملاحظة:</);
  assert.doesNotMatch(code, /بعد إنشاء الحساب، سيكون طلبك قيد المراجعة/);
  assert.doesNotMatch(code, /placeholder="اسمك الكامل"/);
  assert.doesNotMatch(code, /placeholder="اسم جامعتك"/);
  assert.doesNotMatch(code, /placeholder="تخصصك"/);
  assert.doesNotMatch(code, /<option>السنة الأولى<\/option>/);
  assert.doesNotMatch(code, /<option>السنة الثانية<\/option>/);
  assert.doesNotMatch(code, /<option>السنة الثالثة<\/option>/);
  assert.doesNotMatch(code, /<option>السنة الرابعة<\/option>/);
  assert.doesNotMatch(code, /<option>دراسات عليا<\/option>/);
  assert.doesNotMatch(code, /'جارٍ الإنشاء\.\.\.'\s*:\s*'تقديم طلب الانضمام'/);
  assert.doesNotMatch(code, /لديك حساب بالفعل؟/);
  assert.doesNotMatch(code, />\s*سجّل الدخول\s*</);
});

test('5. ForgotPasswordPage static labels use translations', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /<AuthShell\s+title="استعادة كلمة المرور"/);
  assert.doesNotMatch(code, /subtitle="سنرسل إليك رابطاً آمناً لتعيين كلمة مرور جديدة"/);
  assert.doesNotMatch(code, /'جارٍ إرسال الرابط\.\.\.'\s*:\s*'إرسال رابط الاستعادة'/);
  assert.doesNotMatch(code, /العودة إلى تسجيل الدخول/);
});

test('6. UpdatePasswordPage static labels use translations', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /title="رابط الاستعادة غير صالح"/);
  assert.doesNotMatch(code, /subtitle="قد يكون الرابط منتهياً أو سبق استخدامه"/);
  assert.doesNotMatch(code, /طلب رابط استعادة جديد/);
  assert.doesNotMatch(code, /subtitle="اختر كلمة مرور قوية لحماية حسابك"/);
  assert.doesNotMatch(code, />كلمة المرور الجديدة\s*<PasswordField/);
  assert.doesNotMatch(code, />تأكيد كلمة المرور الجديدة\s*<PasswordField/);
  assert.doesNotMatch(code, /'حفظ كلمة المرور الجديدة'/);
  assert.doesNotMatch(code, /جارٍ التحقق من الرابط الآمن\.\.\./);
});

test('7. Password show/hide accessibility labels are translated if present', async () => {
  const pwCode = await read('src/components/PasswordField.tsx');

  assert.match(pwCode, /useTranslation/, 'PasswordField.tsx must use useTranslation');
  assert.match(pwCode, /t\(['"]auth\.(hidePassword|showPassword)['"]/);
});

test('8. Validation presentation messages use translations', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /'الرجاء إدخال البريد وكلمة المرور'/);
  assert.doesNotMatch(code, /'البريد الإلكتروني أو كلمة المرور غير صحيحة'/);
  assert.doesNotMatch(code, /'يرجى إدخال بريد إلكتروني صالح\.'/);
  assert.match(code, /t\(['"]auth\.errors\.resetLinkSent['"]/);
  assert.doesNotMatch(code, /text:\s*['"]تم إرسال رابط الاستعادة إلى بريدك الإلكتروني['"]/);
  assert.doesNotMatch(code, /'تعذر إرسال رابط الاستعادة\.'/);
  assert.match(code, /t\(['"]auth\.errors\.updatePasswordSuccess['"]/);
  assert.doesNotMatch(code, /text:\s*['"]تم تغيير كلمة المرور بنجاح['"]/);
  assert.doesNotMatch(code, /'تعذر إنشاء الحساب'/);
});

test('9. User-entered email remains untouched', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /setEmail\(e\.target\.value\)|setEmail\(event\.target\.value\)/);
  assert.match(code, /login\(email\.trim\(\),\s*password\)/);
  assert.match(code, /requestPasswordReset\(normalizedEmail\)/);
});

test('10. User-entered name remains untouched', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /form\.name\.trim\(\)/);
  assert.match(code, /setForm\({\s*\.\.\.form,\s*name:\s*e\.target\.value\s*}\)/);
});

test('11. Password values remain untouched', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /setPassword\(e\.target\.value\)|setPassword\(event\.target\.value\)/);
  assert.match(code, /updateRecoveredPassword\(password\)/);
});

test('12. Technical fields retain intended LTR behavior', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  // Technical inputs (email, phone) retain dir="ltr"
  assert.match(code, /type="email"[\s\S]*?dir="ltr"/);
  assert.match(code, /type="tel"[\s\S]*?dir="ltr"/);
});

test('13. Existing auth function calls are unchanged', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /login\(email\.trim\(\),\s*password\)/);
  assert.match(code, /requestPasswordReset\(normalizedEmail\)/);
  assert.match(code, /updateRecoveredPassword\(password\)/);
  assert.match(code, /finishPasswordRecovery\(\)/);
  assert.match(code, /registerWithApplication\(/);
});

test('14. Existing view transitions are unchanged', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /setView\({\s*kind:\s*['"]forgot-password['"]\s*}\)/);
  assert.match(code, /setView\({\s*kind:\s*['"]register['"]\s*}\)/);
  assert.match(code, /setView\({\s*kind:\s*['"]login['"]\s*}\)/);
});

test('15. No /ar, /tr, /en URL routing added in AuthPages', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /['"]\/(ar|tr|en)\//);
});

test('16. No machine translation API added', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /google\.translate|translate\.googleapis|deepl/i);
});

test('17. No Supabase schema or direct auth alteration added in AuthPages', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.doesNotMatch(code, /supabase\.from/);
  assert.doesNotMatch(code, /supabase\.rpc/);
});

test('18. Brand in AuthShell uses resolvePublicBrandName', async () => {
  const code = await read('src/pages/AuthPages.tsx');

  assert.match(code, /resolvePublicBrandName/, 'AuthShell footer should resolve brand name for active locale');
  assert.doesNotMatch(code, /<CheckCircle2[^>]*\/>\s*اتحاد شباب الأمة\s*<\/div>/);
});
