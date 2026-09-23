import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGING_CONFIRMATION,
  loadHostedSmokeConfig,
  projectRefFromUrl
} from '../../scripts/hosted-exchange-smoke.mjs';

const valid = {
  BC_HOSTED_SMOKE_CONFIRMATION: STAGING_CONFIRMATION,
  BC_STAGING_SUPABASE_URL: 'https://staging-project.supabase.co',
  BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
  BC_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_staging',
  BC_STAGING_NOTIFICATION_MODE: 'outbox-only',
  BC_STAGING_SUPABASE_PROJECT_REF: 'staging-project',
  BC_PRODUCTION_SUPABASE_PROJECT_REF: 'production-project',
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

test('refuses reuse of a public API key as the server secret', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SUPABASE_SECRET_KEY: valid.BC_STAGING_SUPABASE_PUBLISHABLE_KEY }), /must be different/);
});

test('requires an outbox-only staging notification configuration', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_NOTIFICATION_MODE: 'deliver' }), /must equal outbox-only/);
});
