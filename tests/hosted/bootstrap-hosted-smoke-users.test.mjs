import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADULT_ATTESTATION,
  ADULT_VERSION,
  buildFixtureCredentials,
  githubEnvPayload,
  validateBootstrapEnvironment
} from '../../scripts/bootstrap-hosted-smoke-users.mjs';
import { STAGING_CONFIRMATION } from '../../scripts/hosted-exchange-smoke.mjs';

const baseEnv = {
  BC_HOSTED_SMOKE_CONFIRMATION: STAGING_CONFIRMATION,
  BC_STAGING_SUPABASE_URL: 'https://staging-project.supabase.co',
  BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
  BC_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_staging',
  BC_STAGING_SUPABASE_PROJECT_REF: 'staging-project',
  BC_PRODUCTION_SUPABASE_PROJECT_REF: 'production-project',
  BC_STAGING_ALLOWED_EMAIL_DOMAIN: 'example.test',
  GITHUB_ENV: '/tmp/github-env',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '2'
};

test('bootstrap environment fails closed to the approved isolated staging project', () => {
  const config = validateBootstrapEnvironment(baseEnv);
  assert.equal(config.domain, 'example.test');
  assert.equal(config.runTag, '123456789-2');
  assert.equal(config.githubEnv, '/tmp/github-env');
});
test('bootstrap refuses production, mismatched, public, or unconfirmed targets', () => {
  assert.throws(
    () => validateBootstrapEnvironment({ ...baseEnv, BC_HOSTED_SMOKE_CONFIRMATION: 'no' }),
    /confirmation/
  );
  assert.throws(
    () => validateBootstrapEnvironment({ ...baseEnv, BC_PRODUCTION_SUPABASE_PROJECT_REF: 'staging-project' }),
    /equals production/
  );
  assert.throws(
    () => validateBootstrapEnvironment({ ...baseEnv, BC_STAGING_SUPABASE_URL: 'https://wrong-project.supabase.co' }),
    /does not match/
  );
  assert.throws(
    () => validateBootstrapEnvironment({ ...baseEnv, BC_STAGING_ALLOWED_EMAIL_DOMAIN: 'gmail.com' }),
    /requires example\.test/
  );
  assert.throws(
    () => validateBootstrapEnvironment({
      ...baseEnv,
      BC_STAGING_SUPABASE_SECRET_KEY: baseEnv.BC_STAGING_SUPABASE_PUBLISHABLE_KEY
    }),
    /must differ/
  );
});

test('fixture credentials are deterministic for deterministic entropy', () => {
  const fixture = buildFixtureCredentials({
    label: 'B',
    runTag: '123-4',
    domain: 'example.test',
    emailNonce: '0011223344556677',
    passwordNonce: '0123456789abcdef0123456789abcdef0123456789abcdef'
  });
  assert.equal(fixture.email, 'bc-smoke-123-4-b-001122334455@example.test');
  assert.equal(fixture.password, 'Bc!1-0123456789abcdef0123456789abcdef0123456789abcdef');
  assert.equal(ADULT_VERSION, '2026-09-11');
  assert.match(ADULT_ATTESTATION, /^I confirm that I am at least 18 years old/);
});
test('GitHub environment payload exports exactly the six generated smoke variables', () => {
  const credentials = ['A', 'B', 'C'].map((label, index) => ({
    label,
    email: `${label.toLowerCase()}-${index}@example.test`,
    password: `synthetic-${index}`
  }));
  const payload = githubEnvPayload(credentials);
  const lines = payload.trim().split('\n');
  assert.equal(lines.length, 6);
  for (const label of ['A', 'B', 'C']) {
    assert.ok(lines.some(line => line.startsWith(`BC_STAGING_USER_${label}_EMAIL=`)));
    assert.ok(lines.some(line => line.startsWith(`BC_STAGING_USER_${label}_PASSWORD=`)));
  }
});

test('hosted workflow provisions a fresh trio before smoke and no longer consumes static user secrets', () => {
  const workflow = readFileSync('.github/workflows/hosted-supabase-exchange-smoke.yml', 'utf8');
  assert.match(workflow, /Provision fresh hosted smoke users/);
  assert.match(workflow, /node scripts\/bootstrap-hosted-smoke-users\.mjs/);
  assert.match(workflow, /BC_STAGING_SUPABASE_SECRET_KEY: \$\{\{ secrets\.BC_STAGING_SUPABASE_SECRET_KEY \}\}/);
  assert.doesNotMatch(workflow, /secrets\.BC_STAGING_USER_[ABC]_(?:EMAIL|PASSWORD)/);
  assert.ok(workflow.indexOf('Verify staging safety guards') < workflow.indexOf('Provision fresh hosted smoke users'));
  assert.ok(workflow.indexOf('Provision fresh hosted smoke users') < workflow.indexOf('Run hosted canonical exchange smoke'));
});
