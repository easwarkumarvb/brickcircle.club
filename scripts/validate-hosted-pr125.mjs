import assert from 'node:assert/strict';
export const STAGING_CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';

export const PR125_SHA = '1eb64e59f000f3a93f55906ff55e9a194a70eee0';
export const STAGING_REF = 'tteyypklldgwwicrgjzt';
export const PRODUCTION_REF = 'nsxtromjdpdscknadxez';

// Deliberately not a general-purpose PR runner. Any new head needs trusted-main review.
export function validateSelection({ pr, repository, ref, number, sha, confirmation }) {
  assert.equal(ref, 'refs/heads/main', 'Dispatch must use trusted main');
  assert.equal(repository, 'easwarkumarvb/brickcircle.club');
  assert.equal(String(number), '125');
  assert.equal(sha, PR125_SHA);
  assert.equal(confirmation, STAGING_CONFIRMATION);
  assert.equal(pr.number, 125);
  assert.equal(pr.state, 'open');
  assert.equal(pr.base.ref, 'main');
  assert.equal(pr.base.repo?.full_name, repository);
  assert.equal(pr.head.repo?.full_name, repository);
  assert.equal(pr.head.ref, 'opencode/conversation-first-exchanges');
  assert.equal(pr.head.sha, sha);
  return sha;
}

export function validateTarget(env) {
  assert.equal(env.BC_HOSTED_SMOKE_CONFIRMATION, STAGING_CONFIRMATION);
  assert.equal(String(env.BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER), '125');
  assert.equal(env.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA, PR125_SHA);
  assert.equal(env.BC_STAGING_SUPABASE_PROJECT_REF, STAGING_REF);
  assert.equal(env.BC_PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_REF);
  assert.equal(env.BC_STAGING_SUPABASE_URL, `https://${STAGING_REF}.supabase.co`);
  assert.equal(env.BC_STAGING_ALLOWED_EMAIL_DOMAIN, 'example.test');
  assert.equal(env.BC_STAGING_NOTIFICATION_MODE, 'outbox-only');
  assert.ok(env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY);
}
