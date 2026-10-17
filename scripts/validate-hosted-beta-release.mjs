import assert from 'node:assert/strict';
export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const PULL_REQUEST_NUMBER = 168;
export const HEAD_BRANCH = 'release/beta-consolidated-20261017';
export const HEAD_SHA = 'e5de20ca3a52a420c966a28e7556acbad137d0a1';
export const RELEASE_SHA = '1cc2b24a6c2c348dc95f320fa9970a7bac8ba90a';
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
