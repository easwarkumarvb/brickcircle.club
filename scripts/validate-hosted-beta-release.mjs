import assert from 'node:assert/strict';
export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const PULL_REQUEST_NUMBER = 176;
export const HEAD_BRANCH = 'dev/exchange-outlier-ux-20261018';
export const HEAD_SHA = 'ffac9f4d77f05e9fcbf7b4a04bcc16acbb54cacd';
export const RELEASE_SHA = '5c5a5c4c3eb7fd4bda2e502244edf60829b90595';
export const CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';
export const WORKFLOW_REF = REPOSITORY + '/.github/workflows/hosted-supabase-beta-release.yml@refs/heads/main';
export function validateSelection({repository, ref, eventName, workflowRef, number, sha, confirmation, pr}) {
  assert.equal(repository, REPOSITORY);
  assert.equal(ref, 'refs/heads/main');
  assert.equal(eventName, 'workflow_dispatch');
  assert.equal(workflowRef, WORKFLOW_REF);
  assert.equal(number, String(PULL_REQUEST_NUMBER));
  assert.equal(sha, RELEASE_SHA);
  assert.equal(confirmation, CONFIRMATION);
  assert.equal(pr?.number, PULL_REQUEST_NUMBER);
  assert.equal(pr.state, 'closed');
  assert.equal(pr.merged, true);
  assert.equal(pr.merge_commit_sha, RELEASE_SHA);
  assert.equal(pr.head.repo?.full_name, REPOSITORY);
  assert.equal(pr.head.ref, HEAD_BRANCH);
  assert.equal(pr.head.sha, HEAD_SHA);
  assert.equal(pr.base.repo?.full_name, REPOSITORY);
  assert.equal(pr.base.ref, 'main');
  return RELEASE_SHA;
}
