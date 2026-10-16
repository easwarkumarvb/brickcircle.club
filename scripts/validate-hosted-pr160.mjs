import assert from 'node:assert/strict';

export const PULL_REQUEST_NUMBER = 160;
export const EXPECTED_HEAD_SHA = 'a1cfb51f1bb37572e1d5e20a01a13c261d9d3c7e';
export const HEAD_BRANCH = 'integration/beta-illustration-three-photos';
export const CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';
export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/hosted-supabase-pr160.yml@refs/heads/main`;

export function validateSelection({repository, ref, eventName, workflowRef, number, sha, confirmation, pr}) {
  assert.equal(repository, REPOSITORY);
  assert.equal(ref, 'refs/heads/main');
  assert.equal(eventName, 'workflow_dispatch');
  assert.equal(workflowRef, WORKFLOW_REF);
  assert.equal(number, String(PULL_REQUEST_NUMBER));
  assert.equal(sha, EXPECTED_HEAD_SHA);
  assert.equal(confirmation, CONFIRMATION);
  assert.equal(pr?.number, PULL_REQUEST_NUMBER);
  assert.equal(pr.state, 'open');
  assert.equal(pr.merged, false);
  assert.equal(pr.head.repo?.full_name, REPOSITORY);
  assert.equal(pr.head.ref, HEAD_BRANCH);
  assert.equal(pr.head.sha, EXPECTED_HEAD_SHA);
  assert.equal(pr.base.repo?.full_name, REPOSITORY);
  assert.equal(pr.base.ref, 'main');
  return EXPECTED_HEAD_SHA;
}
