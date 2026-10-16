import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  CONFIRMATION,
  HEAD_BRANCH,
  BASE_BRANCH,
  PULL_REQUEST_NUMBER,
  REPOSITORY,
  WORKFLOW_REF,
  validateSelection
} from '../../scripts/validate-hosted-pr160.mjs';
import {validateTarget} from '../../scripts/validate-hosted-photo.mjs';

const EXPECTED_HEAD_SHA = '2cde4e3806dfec9a5b5566202db399bfb7accf37';
const pr = () => ({
  number: PULL_REQUEST_NUMBER,
  state: 'open',
  merged: false,
  head: {repo: {full_name: REPOSITORY}, ref: HEAD_BRANCH, sha: EXPECTED_HEAD_SHA},
  base: {repo: {full_name: REPOSITORY}, ref: BASE_BRANCH}
});
const selection = () => ({
  repository: REPOSITORY,
  ref: 'refs/heads/main',
  eventName: 'workflow_dispatch',
  workflowRef: WORKFLOW_REF,
  number: String(PULL_REQUEST_NUMBER),
  sha: EXPECTED_HEAD_SHA,
  confirmation: CONFIRMATION,
  pr: pr()
});

test('PR160 selection requires its exact open same-repository head and trusted manual workflow', () => {
  assert.equal(validateSelection(selection()), EXPECTED_HEAD_SHA);
  for (const [field, value] of [
    ['repository', 'other/repo'],
    ['ref', 'refs/heads/feature'],
    ['eventName', 'pull_request'],
    ['workflowRef', 'other/repo/.github/workflows/hosted-supabase-pr160.yml@refs/heads/main'],
    ['number', '159'],
    ['sha', 'f'.repeat(40)],
    ['sha', 'not-a-full-commit-sha'],
    ['confirmation', 'yes']
  ]) assert.throws(() => validateSelection({...selection(), [field]: value}));
  for (const mutate of [
    value => { value.state = 'closed'; },
    value => { value.merged = true; },
    value => { value.head.repo.full_name = 'fork/brickcircle.club'; },
    value => { value.head.ref = 'other-branch'; },
    value => { value.head.sha = 'f'.repeat(40); },
    value => { value.base.repo.full_name = 'fork/brickcircle.club'; },
    value => { value.base.ref = 'main'; }
  ]) {
    const value = selection();
    mutate(value.pr);
    assert.throws(() => validateSelection(value));
  }
});

test('PR160 staging target remains staging-only, outbox-only, and secret-free for the public harness', () => {
  const env = {
    BC_HOSTED_SMOKE_CONFIRMATION: CONFIRMATION,
    BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA: EXPECTED_HEAD_SHA,
    BC_STAGING_SUPABASE_PROJECT_REF: 'tteyypklldgwwicrgjzt',
    BC_PRODUCTION_SUPABASE_PROJECT_REF: 'nsxtromjdpdscknadxez',
    BC_STAGING_SUPABASE_URL: 'https://tteyypklldgwwicrgjzt.supabase.co',
    BC_STAGING_ALLOWED_EMAIL_DOMAIN: 'example.test',
    BC_STAGING_NOTIFICATION_MODE: 'outbox-only',
    BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'public-fixture'
  };
  validateTarget(env, {publicOnly: true, expectedSha: EXPECTED_HEAD_SHA});
  for (const [field, value] of [
    ['BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA', 'f'.repeat(40)],
    ['BC_STAGING_SUPABASE_URL', 'https://nsxtromjdpdscknadxez.supabase.co'],
    ['BC_STAGING_SUPABASE_PROJECT_REF', 'nsxtromjdpdscknadxez'],
    ['BC_STAGING_ALLOWED_EMAIL_DOMAIN', 'example.com'],
    ['BC_STAGING_NOTIFICATION_MODE', 'provider'],
    ['BC_STAGING_SUPABASE_SECRET_KEY', 'private-fixture'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'private-fixture']
  ]) assert.throws(() => validateTarget({...env, [field]: value}, {publicOnly: true, expectedSha: EXPECTED_HEAD_SHA}));
});

test('new manual workflow preserves pinned workflows and keeps candidate tests ahead of scoped staging secrets', async () => {
  const source = await readFile('.github/workflows/hosted-supabase-pr160.yml', 'utf8');
  assert.ok(source.includes('workflow_dispatch:'));
  assert.ok(source.includes('Manual dispatch requires a separately reviewed copy on the default branch'));
  assert.ok(!/^  (push|pull_request):/m.test(source));
  assert.ok(source.includes('environment: hosted-supabase-staging'));
  assert.ok(source.includes('# Configure required human reviewers and restrict this environment to the trusted default branch.'));
  assert.ok(source.includes('group: hosted-supabase-exchange-smoke'));
  assert.equal((source.match(/validateSelection\(\{/g) ?? []).length, 2);
  assert.ok(source.includes('ref: ${{ needs.validate.outputs.head_sha }}'));
  assert.ok(source.includes('RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE'));
  assert.ok(source.includes('tests/isolated/owner-photo-gallery.spec.ts'));
  assert.ok(source.includes('tests/static/owner-photo-gallery-runtime.test.mjs'));
  assert.ok(source.includes('npm run smoke:hosted:exchange'));
  assert.ok(source.includes('hosted-photo-privileged.mjs audit'));
  assert.ok(!source.includes('secrets.BC_PRODUCTION'));
  assert.ok(!source.includes('apply_migration'));
  const tests = source.indexOf('tests/isolated/owner-photo-gallery.spec.ts');
  const bootstrap = source.indexOf('hosted-photo-privileged.mjs bootstrap');
  const firstStagingSecret = source.indexOf('secrets.BC_STAGING_SUPABASE_URL');
  assert.ok(tests >= 0 && bootstrap > tests);
  assert.ok(firstStagingSecret > tests);
  for (const file of ['hosted-supabase-pr125.yml', 'hosted-supabase-pr138.yml', 'hosted-photo-verification.yml']) {
    assert.ok(await readFile(`.github/workflows/${file}`, 'utf8'));
  }
});
