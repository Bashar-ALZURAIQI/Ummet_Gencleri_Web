import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, 'utf8');
const appContextSource = read('src/context/AppContext.tsx');
const mockDataSource = read('src/data/mockData.ts');
const setupFunctionSource = read('supabase/functions/setup-board-accounts/index.ts');
const readme = read('README.md');

const appContextAst = ts.createSourceFile(
  'AppContext.tsx',
  appContextSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function findVariableInitializer(name) {
  let initializer;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appContextAst);
  assert.ok(initializer, `missing ${name}`);
  return initializer;
}

function calledNames(node) {
  const names = [];
  const visit = (child) => {
    if (ts.isCallExpression(child)) {
      if (ts.isIdentifier(child.expression)) names.push(child.expression.text);
      if (ts.isPropertyAccessExpression(child.expression)) names.push(child.expression.name.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

test('deprecated board account endpoint is permanently gone and contains no credential material', () => {
  assert.match(setupFunctionSource, /status:\s*410/);
  assert.match(setupFunctionSource, /disabled|removed|migration/i);
  assert.doesNotMatch(setupFunctionSource, /createClient|SERVICE_ROLE|DEFAULT_PASSWORD|password\s*[:=]|@ummet\./i);
  assert.doesNotMatch(setupFunctionSource, /Access-Control-Allow-Origin|corsHeaders|\*\s*["']/i);
});

test('runtime contains no master, demo, credential-cache, or email-role authority names', () => {
  const runtime = [appContextSource, mockDataSource, read('src/lib/supabase.ts')].join('\n');
  for (const forbidden of [
    'MASTER_PASSWORD',
    'MASTER_EMAIL',
    'demoAccounts',
    'app_credentials',
    'emailToRole',
  ]) {
    assert.equal(runtime.includes(forbidden), false, `${forbidden} remains in runtime`);
  }
});

test('public mock board defaults contain stable legacy ids instead of executive login emails', () => {
  assert.doesNotMatch(
    mockDataSource,
    /(?:president|vice\.president|media|academic|supervisory|activities|finance)@ummet\.org/i,
  );
  assert.match(mockDataSource, /legacy-executive:presidency/);
});

test('applications load only from the RLS service and never merge or persist local authority', () => {
  assert.doesNotMatch(appContextSource, /LS_APPLICATIONS_KEY|LS_LEGACY_APPLICATIONS_KEY|persistApplicationsToLS/);
  assert.doesNotMatch(appContextSource, /\.from\(['"]student_applications['"]\)/);
  assert.doesNotMatch(appContextSource, /\.from\(['"]profiles['"]\)\.upsert/);
  assert.match(appContextSource, /listVisibleStudentApplications/);
  assert.equal(calledNames(findVariableInitializer('registerWithApplication')).includes('setApplications'), false);
});

test('application decisions wait for confirmed service results before publishing state', () => {
  const scheduleSource = findVariableInitializer('scheduleInterview').getText(appContextAst);
  const decisionSource = findVariableInitializer('decideApplication').getText(appContextAst);

  assert.match(scheduleSource, /await scheduleStudentApplicationInterview/);
  assert.match(scheduleSource, /if \(!result\.ok\)/);
  assert.ok(scheduleSource.indexOf('await scheduleStudentApplicationInterview') < scheduleSource.indexOf('setApplications'));

  assert.match(decisionSource, /await decideStudentApplication/);
  assert.match(decisionSource, /if \(!result\.ok\)/);
  assert.ok(decisionSource.indexOf('await decideStudentApplication') < decisionSource.indexOf('setApplications'));
  assert.doesNotMatch(decisionSource, /\.upsert|emailKey|\.email\s*===/);
});

test('a student application is selected only by authenticated UUID', () => {
  const myApplication = findVariableInitializer('myApplication').getText(appContextAst);
  assert.match(myApplication, /studentId\s*===\s*currentUser\.userId/);
  assert.doesNotMatch(myApplication, /email|emailKey/);
});

test('README documents secure deployment and the complete account lifecycle without secrets', () => {
  for (const phrase of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'migrations',
    'avatars',
    'Realtime',
    'بريد الدخول',
    'البريد للتواصل',
    'كلمة المرور',
    'نقل الرئيس',
    'تهيئة الرئيس الأول',
    "position_key = 'PRESIDENT'",
    'سجل التعديلات',
    'setup-board-accounts',
    'Supabase project',
  ]) {
    assert.equal(readme.includes(phrase), true, `README is missing ${phrase}`);
  }
  assert.doesNotMatch(readme, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/);
  assert.match(readme, /auth\.users[\s\S]*executive_assignments[\s\S]*profiles/);
  assert.match(
    readme,
    /INSERT INTO public\.executive_assignments[\s\S]*position_key, committee_key[\s\S]*'PRESIDENT', 'presidency'/,
  );
});
