import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STAGING_CONFIRMATION,
  idempotencyKey,
  loadHostedSmokeConfig,
  projectRefFromUrl,
  redactIdentifier,
  serializeRedactedReport,
  validateDispatcherSelection,
  validateStagingEmails
} from '../../scripts/hosted-exchange-smoke.mjs';

const valid = {
  BC_HOSTED_SMOKE_CONFIRMATION: STAGING_CONFIRMATION,
  BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER: '102',
  BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA: '092dfe54073016526ade49f8a1ecfb577cb30561',
  BC_STAGING_SUPABASE_URL: 'https://staging-project.supabase.co',
  BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
  BC_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_staging',
  BC_STAGING_NOTIFICATION_MODE: 'outbox-only',
  BC_STAGING_SUPABASE_PROJECT_REF: 'staging-project',
  BC_PRODUCTION_SUPABASE_PROJECT_REF: 'production-project',
  BC_STAGING_ALLOWED_EMAIL_DOMAIN: 'example.test',
  BC_STAGING_USER_A_EMAIL: 'a@example.test',
  BC_STAGING_USER_A_PASSWORD: 'password-a',
  BC_STAGING_USER_B_EMAIL: 'b@example.test',
  BC_STAGING_USER_B_PASSWORD: 'password-b',
  BC_STAGING_USER_C_EMAIL: 'c@example.test',
  BC_STAGING_USER_C_PASSWORD: 'password-c',
  BC_STAGING_SET_A: '42143-1',
  BC_STAGING_SET_B: '42141-1'
};

test('accepts an explicitly confirmed isolated hosted staging target', () => {
  const config = loadHostedSmokeConfig(valid);
  assert.equal(config.expectedProjectRef, 'staging-project');
  assert.equal(config.productionProjectRef, 'production-project');
  assert.equal(config.users.length, 3);
  assert.equal(config.pullRequestNumber, 102);
  assert.equal(config.headSha, valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA);
});

test('validates immutable dispatcher PR and SHA inputs', () => {
  assert.deepEqual(validateDispatcherSelection('102', valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA), {
    pullRequestNumber: 102,
    headSha: valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA
  });
  for (const pr of ['', '0', '-1', '102x']) assert.throws(() => validateDispatcherSelection(pr, valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA));
  for (const sha of ['', 'abc', valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA.toUpperCase()]) assert.throws(() => validateDispatcherSelection('102', sha));
});

test('dispatcher is manual-only and validates the same-repository canonical PR before staging', () => {
  const workflow = readFileSync('.github/workflows/hosted-supabase-exchange-smoke.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request_target|pull_request|push|schedule):/m);
  assert.match(workflow, /pr\.head\.repo\?\.full_name !== `\$\{owner\}\/\$\{repo\}`/);
  assert.match(workflow, /pr\.head\.ref !== 'codex\/canonical-exchange-state-machine'/);
  assert.match(workflow, /pr\.head\.sha !== expectedSha/);
  assert.ok(workflow.indexOf('validate-pr:') < workflow.indexOf('environment: hosted-supabase-staging'));
  assert.match(workflow, /ref: \$\{\{ needs\.validate-pr\.outputs\.head_sha \}\}/);
});

test('refuses a missing explicit confirmation', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_HOSTED_SMOKE_CONFIRMATION: '' }), /Missing required environment variable/);
});

test('refuses a staging ref that equals production', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_PRODUCTION_SUPABASE_PROJECT_REF: 'staging-project' }), /equals the production project ref/);
});

test('refuses a URL whose project ref differs from the approved staging ref', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SUPABASE_URL: 'https://wrong-project.supabase.co' }), /does not match/);
});

test('refuses local, custom-domain, path-bearing and non-HTTPS targets', () => {
  for (const url of [
    'http://staging-project.supabase.co',
    'https://localhost:54321',
    'https://staging.example.com',
    'https://staging-project.supabase.co/rest/v1'
  ]) assert.throws(() => projectRefFromUrl(url));
});

test('requires three distinct staging identities and two distinct products', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_USER_C_EMAIL: valid.BC_STAGING_USER_A_EMAIL }), /three distinct/);
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SET_B: valid.BC_STAGING_SET_A }), /must be different/);
});

test('requires a non-routable or explicitly approved staging email domain', () => {
  const users = [
    { label: 'A', email: 'a@example.test' },
    { label: 'B', email: 'b@example.test' },
    { label: 'C', email: 'c@example.test' }
  ];
  assert.equal(validateStagingEmails(users, 'example.test').length, 3);
  assert.equal(validateStagingEmails(users.map(user => ({ ...user, email: user.email.replace('example.test', 'sink.invalid') })), 'sink.invalid', 'sink.invalid').length, 3);
  assert.throws(() => validateStagingEmails(users, ''), /Missing required/);
  assert.throws(() => validateStagingEmails(users, 'gmail.com'), /Public email/);
  assert.throws(() => validateStagingEmails(users, 'sink.invalid', 'different.invalid'), /explicitly approved/);
  assert.throws(() => validateStagingEmails([{ ...users[0], email: 'a@example.test' }, { ...users[1], email: 'b@sink.invalid' }, users[2]], 'example.test'), /match the approved domain/);
  assert.throws(() => validateStagingEmails(users.map(user => ({ ...user, email: `${user.label.toLowerCase()}@brickcircle.club` })), 'brickcircle.club', 'brickcircle.club'), /Production-like/);
  assert.throws(() => validateStagingEmails([{ ...users[0], email: 'not-an-email' }, users[1], users[2]], 'example.test'), /Malformed/);
});

test('refuses reuse of a public API key as the server secret', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SUPABASE_SECRET_KEY: valid.BC_STAGING_SUPABASE_PUBLISHABLE_KEY }), /must be different/);
});

test('requires an outbox-only staging notification configuration', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_NOTIFICATION_MODE: 'deliver' }), /must equal outbox-only/);
});

test('generates deterministic per-intent idempotency keys', () => {
  assert.equal(idempotencyKey('run-1', 'counter'), idempotencyKey('run-1', 'counter'));
  assert.notEqual(idempotencyKey('run-1', 'counter'), idempotencyKey('run-1', 'accept'));
  assert.notEqual(idempotencyKey('run-1', 'counter'), idempotencyKey('run-2', 'counter'));
});

test('serializes only redacted, credential-free evidence', () => {
  const redacted = redactIdentifier('11111111-1111-4111-8111-111111111111');
  const serialized = serializeRedactedReport({ ok: true, case: redacted, projectRef: 'staging-project' });
  assert.match(serialized, /id:[0-9a-f]{12}/);
  assert.doesNotMatch(serialized, /11111111-1111-4111-8111-111111111111/);
  assert.throws(() => serializeRedactedReport({ email: 'a@example.test' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ password: 'hidden' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'https:\/\/staging-project.supabase.co' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'sb_secret_example' }), /Refusing/);
});
