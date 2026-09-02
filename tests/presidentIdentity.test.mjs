import test from 'node:test';
import assert from 'node:assert/strict';

const profileUtils = await import('../src/utils/profileNormalize.ts');

test('the saved executive-board president name wins over stale account and default names', () => {
  assert.equal(typeof profileUtils.resolvePresidentName, 'function');
  assert.equal(
    profileUtils.resolvePresidentName('بشار الزريقي', 'د. عبد الله قوني', 'د. عبد الله قوني'),
    'بشار الزريقي',
  );
});

test('the saved president member name is used when the executive-board name is blank', () => {
  assert.equal(typeof profileUtils.resolvePresidentName, 'function');
  assert.equal(
    profileUtils.resolvePresidentName('   ', 'بشار الزريقي', 'د. عبد الله قوني'),
    'بشار الزريقي',
  );
});

test('the default president name is only used when no saved identity exists', () => {
  assert.equal(typeof profileUtils.resolvePresidentName, 'function');
  assert.equal(
    profileUtils.resolvePresidentName(undefined, null, 'د. عبد الله قوني'),
    'د. عبد الله قوني',
  );
});

test('a divergent legacy president is reconciled to one identity across all three stores', () => {
  assert.equal(typeof profileUtils.resolvePresidentIdentity, 'function');
  assert.deepEqual(
    profileUtils.resolvePresidentIdentity({
      executiveName: 'بشار الزريقي',
      memberName: 'د. عبد الله قوني',
      defaultName: 'د. عبد الله قوني',
      masterEmail: 'president@ummet.org',
      presidentRole: 'PRESIDENT',
      presidentRoleLabel: 'رئيس الاتحاد',
      committee: 'presidency',
    }),
    {
      name: 'بشار الزريقي',
      executive: { name: 'بشار الزريقي', email: 'president@ummet.org', role: 'رئيس الاتحاد' },
      member: { name: 'بشار الزريقي', email: 'president@ummet.org', role: 'PRESIDENT', committee: 'presidency', status: 'active' },
      session: { name: 'بشار الزريقي', email: 'president@ummet.org', role: 'PRESIDENT', committee: 'presidency' },
    },
  );
});

test('an arbitrary edited name keeps the immutable master email and president role', () => {
  assert.equal(typeof profileUtils.resolvePresidentIdentity, 'function');
  const identity = profileUtils.resolvePresidentIdentity({
    executiveName: 'اسم جديد تماماً',
    memberName: 'اسم قديم',
    defaultName: 'الاسم الافتراضي',
    masterEmail: 'president@ummet.org',
    presidentRole: 'PRESIDENT',
    presidentRoleLabel: 'رئيس الاتحاد',
    committee: 'presidency',
  });

  assert.equal(identity.executive.name, 'اسم جديد تماماً');
  assert.equal(identity.member.name, 'اسم جديد تماماً');
  assert.equal(identity.session.name, 'اسم جديد تماماً');
  assert.equal(identity.executive.email, 'president@ummet.org');
  assert.equal(identity.member.role, 'PRESIDENT');
  assert.equal(identity.session.committee, 'presidency');
});
