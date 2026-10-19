import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROJECT, guardedFetch } from '../../scripts/hosted-admin-smoke.mjs';
import {
  assertRunnerCheckout, CONFIRMATION, HEAD_BRANCH, HEAD_SHA, MERGE_SHA, PULL_REQUEST_NUMBER,
  REPOSITORY, validateSelection, WORKFLOW_REF,
} from '../../scripts/validate-admin-mfa-release.mjs';
import {
  assertPublishableKey, configFromEnv, MissingPrerequisitesError, REQUIRED_ENV, runFromEnv,
  validateAdminMfaConfig,
} from '../../scripts/hosted-admin-mfa-release-readiness.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const supportId = '33333333-3333-4333-8333-333333333333';
const runnerSha = 'a'.repeat(40);
function releasePr() {
  return {
    number: PULL_REQUEST_NUMBER,
    state: 'closed',
    merged: true,
    merge_commit_sha: MERGE_SHA,
    head: { repo: { full_name: REPOSITORY }, ref: HEAD_BRANCH, sha: HEAD_SHA },
    base: { repo: { full_name: REPOSITORY }, ref: 'main' },
  };
}
function selection(overrides = {}) {
  return validateSelection({
    repository: REPOSITORY, ref: 'refs/heads/main', eventName: 'workflow_dispatch',
    workflowRef: WORKFLOW_REF, dispatchSha: runnerSha, number: '178', sha: MERGE_SHA,
    confirmation: CONFIRMATION, pr: releasePr(), ...overrides,
  });
}
function env(overrides = {}) {
  return {
    BC_STAGING_SUPABASE_URL: `https://${PROJECT}.supabase.co`,
    BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_public_key',
    BC_STAGING_NOTIFICATION_MODE: 'outbox-only',
    BC_ADMIN_MFA_CONFIRMATION: CONFIRMATION,
    BC_ADMIN_MFA_PULL_REQUEST_NUMBER: '178',
    BC_ADMIN_MFA_RELEASE_HEAD_SHA: HEAD_SHA,
    BC_ADMIN_MFA_RELEASE_MERGE_SHA: MERGE_SHA,
    BC_ADMIN_MFA_RUNNER_SHA: runnerSha,
    BC_ADMIN_MFA_MEMBER_EMAIL: 'owned-member@example.test',
    BC_ADMIN_MFA_MEMBER_PASSWORD: 'member-test-password',
    BC_ADMIN_MFA_ADMIN_EMAIL: 'owned-admin@example.test',
    BC_ADMIN_MFA_ADMIN_PASSWORD: 'admin-test-password',
    BC_ADMIN_MFA_ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    BC_ADMIN_MFA_RUN_ID: id,
    BC_ADMIN_MFA_CASE_ID: caseId,
    BC_ADMIN_MFA_SUPPORT_ID: supportId,
    ...overrides,
  };
}

test('merged release provenance pins PR 178 and keeps dispatch harness SHA separate', () => {
  assert.deepEqual(selection(), { headSha: HEAD_SHA, mergeSha: MERGE_SHA, runnerSha });
  for (const overrides of [
    { repository: 'other/repository' }, { ref: 'refs/heads/dev' }, { eventName: 'push' },
    { workflowRef: `${REPOSITORY}/.github/workflows/other.yml@refs/heads/main` },
    { dispatchSha: 'main' }, { number: '124' }, { sha: HEAD_SHA },
    { confirmation: 'wrong' }, { pr: { ...releasePr(), merged: false } },
    { pr: { ...releasePr(), merge_commit_sha: HEAD_SHA } },
    { pr: { ...releasePr(), head: { ...releasePr().head, sha: 'f'.repeat(40) } } },
    { pr: { ...releasePr(), head: { ...releasePr().head, ref: 'other' } } },
    { pr: { ...releasePr(), base: { ...releasePr().base, ref: 'dev' } } },
  ]) assert.throws(() => selection(overrides));
});

test('trusted checkout validation is distinct from the release reference', () => {
  assertRunnerCheckout(runnerSha, runnerSha);
  assert.notEqual(runnerSha, MERGE_SHA);
  for (const [expected, actual] of [[runnerSha, 'b'.repeat(40)], ['main', 'main']])
    assert.throws(() => assertRunnerCheckout(expected, actual), { message: 'Trusted runner checkout required' });
});

test('missing protected fixture configuration reports names only and never constructs a client', async () => {
  assert.throws(() => configFromEnv({ secret: 'never-print-this' }), error => {
    assert.ok(error instanceof MissingPrerequisitesError);
    for (const name of REQUIRED_ENV) assert.ok(error.message.includes(name));
    assert.ok(!error.message.includes('never-print-this'));
    return true;
  });
  let calls = 0;
  await assert.rejects(runFromEnv(env(), {
    actualRunnerSha: 'b'.repeat(40), factory: () => { calls++; }, transport: () => { calls++; },
  }), { message: 'Trusted runner checkout required' });
  await assert.rejects(runFromEnv({ BC_ADMIN_MFA_RUNNER_SHA: runnerSha }, {
    actualRunnerSha: runnerSha, factory: () => { calls++; }, transport: () => { calls++; },
  }), error => error instanceof MissingPrerequisitesError);
  assert.equal(calls, 0);
});

test('MFA configuration is exact staging, merged release, two separate disposable users, and public-key only', () => {
  const config = configFromEnv(env());
  assert.doesNotThrow(() => validateAdminMfaConfig(config));
  for (const overrides of [
    { BC_STAGING_SUPABASE_URL: 'https://nsxtromjdpdscknadxez.supabase.co' },
    { BC_STAGING_SUPABASE_URL: `https://${PROJECT}.supabase.co/` },
    { BC_STAGING_NOTIFICATION_MODE: 'provider-enabled' },
    { BC_ADMIN_MFA_RELEASE_HEAD_SHA: 'f'.repeat(40) },
    { BC_ADMIN_MFA_RELEASE_MERGE_SHA: HEAD_SHA },
    { BC_ADMIN_MFA_ADMIN_EMAIL: 'owned-member@example.test' },
    { BC_ADMIN_MFA_ADMIN_EMAIL: 'admin@example.com' },
    { BC_ADMIN_MFA_CASE_ID: id },
    { BC_ADMIN_MFA_ADMIN_TOTP_SECRET: '' },
  ]) assert.throws(() => validateAdminMfaConfig(configFromEnv(env(overrides))));
  assert.ok(!REQUIRED_ENV.some(name => /SECRET_KEY|SERVICE_ROLE/i.test(name)));
});

test('new runner accepts only publishable or legacy anon keys and rejects privileged keys before client or transport', async () => {
  const jwt = role => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.doesNotThrow(() => assertPublishableKey('sb_publishable_test_key'));
  assert.doesNotThrow(() => assertPublishableKey(jwt('anon')));
  const invalidKeys = ['sb_secret_test_key', jwt('service_role'), 'eyJmalformed', 'not-a-key'];
  let calls = 0;
  for (const key of invalidKeys) {
    await assert.rejects(runFromEnv(env({ BC_STAGING_SUPABASE_PUBLISHABLE_KEY: key }), {
      actualRunnerSha: runnerSha, factory: () => { calls++; }, transport: () => { calls++; },
    }), { message: 'Supabase public API key required' });
  }
  const serviceCredential = 'never-include-this-secret-value';
  await assert.rejects(runFromEnv(env({ SUPABASE_SERVICE_ROLE_KEY: serviceCredential }), {
    actualRunnerSha: runnerSha, factory: () => { calls++; }, transport: () => { calls++; },
  }), error => {
    assert.equal(error.message, 'Privileged Supabase credential environment variable is forbidden');
    assert.ok(!error.message.includes(serviceCredential));
    return true;
  });
  assert.doesNotThrow(() => configFromEnv(env({ SUPABASE_SERVICE_ROLE_KEY: '' })));
  for (const name of ['SUPABASE_SECRET_KEY', 'BC_STAGING_SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'BC_STAGING_SUPABASE_SERVICE_ROLE_KEY'])
    await assert.rejects(runFromEnv(env({ [name]: 'redacted-secret' }), {
      actualRunnerSha: runnerSha, factory: () => { calls++; }, transport: () => { calls++; },
    }), { message: 'Privileged Supabase credential environment variable is forbidden' });
  assert.equal(calls, 0);
});

test('MFA transport rejects production, non-API paths, escapes, and redirects', async () => {
  let calls = 0;
  const fetcher = guardedFetch(`https://${PROJECT}.supabase.co`, async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return new Response('{}');
  });
  for (const url of [
    'https://nsxtromjdpdscknadxez.supabase.co/auth/v1/token',
    'https://tteyypklldgwwicrgjzt.supabase.co/storage/v1/object',
    `https://${PROJECT}.supabase.co/auth/v1/../../other`,
  ]) await assert.rejects(fetcher(url));
  assert.equal(calls, 0);
  await fetcher(`https://${PROJECT}.supabase.co/auth/v1/token`);
  assert.equal(calls, 1);
});

test('runner and workflow preserve secret boundaries, API-only evidence, and legacy PR 124 defaults', async () => {
  const workflow = await readFile('.github/workflows/hosted-admin-mfa-release-readiness.yml', 'utf8');
  const runner = await readFile('scripts/hosted-admin-mfa-release-readiness.mjs', 'utf8');
  const runbook = await readFile('docs/hosted-admin-mfa-release-readiness-runbook.md', 'utf8');
  const legacyWorkflow = await readFile('.github/workflows/hosted-supabase-admin-smoke.yml', 'utf8');
  const core = await readFile('scripts/hosted-admin-smoke.mjs', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: hosted-supabase-staging/);
  assert.ok(workflow.indexOf('Verify trusted runner checkout before any staging access') <
    workflow.indexOf('Run server-only staging Admin MFA readiness check'));
  assert.ok(workflow.indexOf('Revalidate exact merged PR 178 after environment approval') <
    workflow.indexOf('Run server-only staging Admin MFA readiness check'));
  assert.match(workflow, /ref: \$\{\{ needs\.validate\.outputs\.runner_sha \}\}/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.doesNotMatch(workflow, /BC_STAGING_SUPABASE_SECRET_KEY|service_role|pull_request_target|path: candidate/);
  assert.match(runner, /assertRunnerCheckout\(env\.BC_ADMIN_MFA_RUNNER_SHA, actualRunnerSha\)/);
  assert.ok(runner.indexOf('assertRunnerCheckout(env.BC_ADMIN_MFA_RUNNER_SHA, actualRunnerSha)') <
    runner.indexOf('const config = configFromEnv(env)'));
  assert.match(runner, /server-only Supabase Auth and API evidence/);
  assert.match(runner, /no browser, deployment, or physical UI proof/);
  assert.match(legacyWorkflow, /PR 124/);
  assert.match(core, /assert\.equal\(c\.pr, '124'\)/);
  assert.match(core, /validate = validateConfig/);
  assert.doesNotMatch(runner, /auth\.admin|createUser|deleteUser|forgeJWT/);
  assert.ok(runbook.includes('*before* inserting anything into `private.exchange_admins`'));
  assert.ok(runbook.includes('*before* the'));
  assert.ok(runbook.includes('positive hosted run:'));
  assert.match(runbook, /not an application connector permission/);
});
