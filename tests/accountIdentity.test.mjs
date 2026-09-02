import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const identity = await import('../src/domain/accountIdentity.ts');
const mappers = await import('../src/domain/supabaseMappers.ts');

const appContextSource = readFileSync(
  fileURLToPath(new URL('../src/context/AppContext.tsx', import.meta.url)),
  'utf8',
);
const appContextAst = ts.createSourceFile(
  'AppContext.tsx',
  appContextSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const appRouterAst = ts.createSourceFile(
  'App.tsx',
  readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function findVariableInitializer(sourceFile, name) {
  let initializer;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
    ) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(initializer, `missing ${name} implementation`);
  return initializer;
}

function findSupabaseAuthCallback(sourceFile, methodName) {
  let callback;
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === methodName
      && ts.isPropertyAccessExpression(node.expression.expression)
      && node.expression.expression.name.text === 'auth'
      && node.arguments[0]
    ) {
      callback = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(callback, `missing Supabase Auth callback for ${methodName}`);
  return callback;
}

function firstCallPosition(node, calledName) {
  let position;
  const visit = (child) => {
    if (
      position === undefined
      && ts.isCallExpression(child)
      && (
        (ts.isIdentifier(child.expression) && child.expression.text === calledName)
        || (ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === calledName)
      )
    ) {
      position = child.getStart();
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  assert.notEqual(position, undefined, `missing call to ${calledName}`);
  return position;
}

function identifierNames(node) {
  const names = new Set();
  const visit = (child) => {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

function calledSupabaseAuthMethods(node) {
  const methods = [];
  const visit = (child) => {
    if (
      ts.isCallExpression(child)
      && ts.isPropertyAccessExpression(child.expression)
      && ts.isPropertyAccessExpression(child.expression.expression)
      && child.expression.expression.name.text === 'auth'
      && ts.isIdentifier(child.expression.expression.expression)
      && child.expression.expression.expression.text === 'supabase'
    ) {
      methods.push(child.expression.name.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return methods;
}

function calledSupabaseTableMethods(node, tableName) {
  const methods = [];
  const visit = (child) => {
    if (
      ts.isCallExpression(child)
      && ts.isPropertyAccessExpression(child.expression)
      && ts.isCallExpression(child.expression.expression)
    ) {
      const fromCall = child.expression.expression;
      if (
        ts.isPropertyAccessExpression(fromCall.expression)
        && fromCall.expression.name.text === 'from'
        && ts.isIdentifier(fromCall.expression.expression)
        && fromCall.expression.expression.text === 'supabase'
        && ts.isStringLiteral(fromCall.arguments[0])
        && fromCall.arguments[0].text === tableName
      ) {
        methods.push(child.expression.name.text);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return methods;
}

function hasConjunctionWith(node, requiredNames) {
  let found = false;
  const visit = (child) => {
    if (
      ts.isBinaryExpression(child)
      && child.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const names = identifierNames(child);
      if (requiredNames.every((name) => names.has(name))) found = true;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

test('AccountProfile rejects executive roles while profile updates exclude them', () => {
  // Reintroducing `role` to AccountProfile makes this @ts-expect-error unused.
  const tscBin = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  const result = spawnSync(process.execPath, [
    tscBin,
    '--noEmit',
    '--strict',
    '--target', 'ES2020',
    '--module', 'ESNext',
    '--moduleResolution', 'bundler',
    '--allowImportingTsExtensions',
    '--skipLibCheck',
    'tests/accountIdentity.contract.ts',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal('role' in identity.sanitizeProfileUpdates({ role: 'PRESIDENT' }), false);
});

test('resolveAssignedRole uses the assignment role rather than an email-shaped identity', () => {
  // A regression that inferred roles from `president` in an email would return PRESIDENT here.
  assert.equal(
    identity.resolveAssignedRole({ userId: 'user-1', role: 'MEDIA_HEAD' }),
    'MEDIA_HEAD',
  );
});

test('resolveAssignedRole defaults an unassigned president-looking account to STUDENT', () => {
  // Removing the STUDENT fallback would reintroduce email-based privilege escalation.
  assert.equal(identity.resolveAssignedRole(undefined), 'STUDENT');
});

test('the former master email is a STUDENT when its authenticated UUID has no assignment', () => {
  // Reintroducing email-pattern or metadata authorization would make this account PRESIDENT.
  const mapped = mappers.mapSupabaseIdentity(
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'president@ummet.org',
    },
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Former demo president',
      status: 'active',
    },
    null,
  );

  assert.equal(mapped.currentUser.role, 'STUDENT');
  assert.equal(mapped.currentUser.committee, undefined);
});

test('AppContext login has one Supabase password path and no local authority inputs', () => {
  // Adding any local member/password fallback or a master-account branch is an auth bypass.
  const allNames = identifierNames(appContextAst);
  for (const forbiddenName of [
    'MASTER_EMAIL',
    'MASTER_PASSWORD',
    'MASTER_ID',
    'isMasterEmail',
    'ensureMasterPresident',
    'boardCredentialFor',
    'syncBoardCredentials',
    'emailToRole',
    'LS_CREDENTIALS_KEY',
    'LS_AUTH_VERSION_KEY',
    'AUTH_VERSION',
  ]) {
    assert.equal(allNames.has(forbiddenName), false, `${forbiddenName} must not exist in AppContext runtime`);
  }

  const login = findVariableInitializer(appContextAst, 'login');
  const loginNames = identifierNames(login);
  assert.deepEqual(calledSupabaseAuthMethods(login), ['signInWithPassword']);
  assert.equal(loginNames.has('applySession'), true);
  for (const forbiddenInput of [
    'students',
    'members',
    'localStorage',
    'findStudentFor',
    'enterSession',
    'resolveRoleForEmail',
  ]) {
    assert.equal(loginNames.has(forbiddenInput), false, `login must not trust ${forbiddenInput}`);
  }
});

test('registration delegates application creation to the Auth trigger', () => {
  const register = findVariableInitializer(appContextAst, 'registerWithApplication');
  assert.deepEqual(calledSupabaseAuthMethods(register), ['signUp']);
  assert.equal(calledSupabaseTableMethods(register, 'student_applications').includes('insert'), false);
});

test('auth listener classifies events before advancing the shared epoch', () => {
  const listener = findSupabaseAuthCallback(appContextAst, 'onAuthStateChange');
  assert.ok(
    firstCallPosition(listener, 'classifyAuthEvent') < firstCallPosition(listener, 'beginEvent'),
    'unsupported events must be ignored before they can invalidate owned auth work',
  );
});

test('login and signup use exact-session epoch ownership instead of same-user adoption', () => {
  for (const operationName of ['login', 'registerWithApplication']) {
    const operation = findVariableInitializer(appContextAst, operationName);
    assert.equal(identifierNames(operation).has('resolveOwnedOperationEpoch'), true);
  }
});

test('private dashboard rendering waits for Supabase Auth initialization', () => {
  // Removing the initialization gate can flash a private route before session verification finishes.
  assert.equal(hasConjunctionWith(appRouterAst, ['authInitializing', 'isDashboard']), true);
});

test('visibleHistoryFor gives the president every history entry', () => {
  const entries = [
    { id: 'entry-1', submittedByUserId: 'member-1' },
    { id: 'entry-2', submittedByUserId: 'member-2' },
    { id: 'entry-3' },
  ];

  assert.deepEqual(
    identity.visibleHistoryFor(entries, { userId: 'president-1', role: 'PRESIDENT' }),
    entries,
  );
});

test('visibleHistoryFor limits an executive member to entries submitted by that user id', () => {
  const entries = [
    { id: 'mine', submittedByUserId: 'member-1' },
    { id: 'another-member', submittedByUserId: 'member-2' },
    { id: 'legacy-without-owner' },
  ];

  assert.deepEqual(
    identity.visibleHistoryFor(entries, { userId: 'member-1', role: 'MEDIA_HEAD' }),
    [{ id: 'mine', submittedByUserId: 'member-1' }],
  );
});

test('visibleHistoryFor ignores matching names, emails and former positions when UUID ownership differs', () => {
  const entries = [{
    id: 'another-member',
    submittedByUserId: 'member-2',
    applicantName: 'نفس الاسم',
    submittedByEmail: 'same@example.org',
    applicantRole: 'المسؤول الإعلامي',
  }];

  assert.deepEqual(
    identity.visibleHistoryFor(entries, {
      userId: 'member-1',
      role: 'MEDIA_HEAD',
      name: 'نفس الاسم',
      email: 'same@example.org',
      position: 'المسؤول الإعلامي',
    }),
    [],
  );
});

test('visibleHistoryFor prevents a student from viewing history', () => {
  assert.deepEqual(
    identity.visibleHistoryFor(
      [{ id: 'entry-1', submittedByUserId: 'member-1' }],
      { userId: 'student-1', role: 'STUDENT' },
    ),
    [],
  );
});

test('visibleHistoryFor only exposes an ownerless legacy entry to the president', () => {
  const legacyEntry = [{ id: 'legacy-without-owner' }];

  assert.deepEqual(
    identity.visibleHistoryFor(legacyEntry, { userId: 'member-1', role: 'MEDIA_HEAD' }),
    [],
  );
  assert.deepEqual(
    identity.visibleHistoryFor(legacyEntry, { userId: 'president-1', role: 'PRESIDENT' }),
    legacyEntry,
  );
});

test('sanitizeProfileUpdates preserves editable contact fields but excludes loginEmail and role', () => {
  // A sanitization regression could let a profile form submit identity or authorization fields.
  assert.deepEqual(
    identity.sanitizeProfileUpdates({
      name: 'Member Name',
      contactEmail: 'contact@example.org',
      phone: '+90 555 000 0000',
      bio: 'Short profile',
      photo: 'avatars/member.webp',
      loginEmail: 'login@example.org',
      role: 'PRESIDENT',
    }),
    {
      name: 'Member Name',
      contactEmail: 'contact@example.org',
      phone: '+90 555 000 0000',
      bio: 'Short profile',
      photo: 'avatars/member.webp',
    },
  );
});

test('validateAvatarFile accepts JPEG, PNG, and WebP files no larger than 5MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.deepEqual(identity.validateAvatarFile({ type, size: 5 * 1024 * 1024 }), { valid: true });
  }
});

test('validateAvatarFile rejects unsupported formats and files over 5MB', () => {
  assert.equal(identity.validateAvatarFile({ type: 'image/gif', size: 1024 }).valid, false);
  assert.equal(identity.validateAvatarFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }).valid, false);
});
