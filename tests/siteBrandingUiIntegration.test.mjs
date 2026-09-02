import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('site branding panel is president-only and uses the managed site-logo field without a URL input', async () => {
  const panel = await read('src/components/SiteBrandingPanel.tsx');

  assert.match(panel, /currentUser\?\.role\s*!==\s*'PRESIDENT'/);
  assert.match(panel, /return null/);
  assert.match(panel, /<ManagedFileField/);
  assert.match(panel, /usage="site-logo"/);
  assert.match(panel, /label="شعار الاتحاد"/);
  assert.match(panel, /siteContent\.brand\.logoUrl/);
  assert.match(panel, /<Users/);
  assert.doesNotMatch(panel, /type=["']url["']/);
  assert.doesNotMatch(panel, /رابط الشعار/);
});

test('panel shows confirmed Arabic feedback and logs replacement failures', async () => {
  const panel = await read('src/components/SiteBrandingPanel.tsx');

  assert.match(panel, /TransientToast/);
  assert.match(panel, /تم تحديث شعار الاتحاد بنجاح\./);
  assert.match(panel, /جاري الرفع/);
  assert.match(panel, /console\.error\('\[site-branding\] replace failed', result\.error\)/);
  assert.match(panel, /result\.error\.message/);
  assert.match(panel, /result\.data\.warnings/);
  assert.match(panel, /console\.warn\('\[site-branding\] replace warnings'/);
});

test('panel distinguishes an indeterminate publication without claiming a definitive failure', async () => {
  const [panel, lifecycle] = await Promise.all([
    read('src/components/SiteBrandingPanel.tsx'),
    read('src/domain/siteBrandingLifecycle.ts'),
  ]);

  assert.match(panel, /result\.committed/);
  assert.match(panel, /result\.committed\s*\?\s*result\.error\.message/);
  assert.match(lifecycle, /تعذر تأكيد نتيجة تحديث الشعار؛ حدّث الصفحة قبل إعادة المحاولة\./);
  assert.doesNotMatch(panel, /الشعار القديم محفوظ|لم يُنشر التعديل/);
});

test('site-logo field exposes JPEG PNG WebP help and a custom confirmed-success message', async () => {
  const field = await read('src/components/ManagedFileField.tsx');

  assert.match(field, /successMessage\?: string/);
  assert.match(field, /usage === 'site-logo'/);
  assert.match(field, /JPEG أو PNG أو WebP، بحد أقصى 5 MB\./);
  assert.match(field, /successMessage \?\?/);
});

test('context exposes optional persisted logo fields and an upload-compatible replacement result', async () => {
  const context = await read('src/context/AppContext.tsx');

  assert.match(context, /logoUrl\?: string/);
  assert.match(context, /logoPath\?: string/);
  assert.match(context, /replaceSiteLogo:/);
  assert.match(context, /Promise<SiteLogoReplacementResult>/);
  assert.doesNotMatch(context, /logoUrl:\s*['"]https?:/);
});
