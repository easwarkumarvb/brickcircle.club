import assert from 'node:assert/strict';

export const PULL_REQUEST_NUMBER = 160;
export const HEAD_BRANCH = 'integration/beta-illustration-three-photos';
export const BASE_BRANCH = 'integration/admin-security-reliability';
export const CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';
export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/hosted-supabase-pr160.yml@refs/heads/main`;

export function validateSelection({repository, ref, eventName, workflowRef, number, sha, confirmation, pr}) {
  assert.equal(repository, REPOSITORY);
  assert.equal(ref, 'refs/heads/main');
  assert.equal(eventName, 'workflow_dispatch');
  assert.equal(workflowRef, WORKFLOW_REF);
  assert.equal(number, String(PULL_REQUEST_NUMBER));
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(confirmation, CONFIRMATION);
  assert.equal(pr?.number, PULL_REQUEST_NUMBER);
  assert.equal(pr.state, 'open');
  assert.equal(pr.merged, false);
  assert.equal(pr.head.repo?.full_name, REPOSITORY);
  assert.equal(pr.head.ref, HEAD_BRANCH);
  assert.equal(pr.head.sha, sha);
  assert.equal(pr.base.repo?.full_name, REPOSITORY);
  assert.equal(pr.base.ref, BASE_BRANCH);
  return sha;
}
