import assert from 'node:assert/strict';

export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const PULL_REQUEST_NUMBER = 178;
export const HEAD_BRANCH = 'dev/beta-feedback-20261019';
export const HEAD_SHA = '0c02e2a344bbf11aae9fffadd654bbe0b15b259f';
export const MERGE_SHA = 'e135cde511440f73d36c34a4058383f9169d530e';
export const CONFIRMATION = 'RUN_STAGING_ADMIN_MFA_READINESS';
export const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/hosted-admin-mfa-release-readiness.yml@refs/heads/main`;

export function validateSelection({ repository, ref, eventName, workflowRef, dispatchSha,
  number, sha, confirmation, pr }) {
  assert.equal(repository, REPOSITORY);
  assert.equal(ref, 'refs/heads/main');
  assert.equal(eventName, 'workflow_dispatch');
  assert.equal(workflowRef, WORKFLOW_REF);
  assert.match(dispatchSha, /^[0-9a-f]{40}$/);
  assert.equal(number, String(PULL_REQUEST_NUMBER));
  assert.equal(sha, MERGE_SHA);
  assert.equal(confirmation, CONFIRMATION);
  assert.equal(pr?.number, PULL_REQUEST_NUMBER);
  assert.equal(pr.state, 'closed');
  assert.equal(pr.merged, true);
  assert.equal(pr.merge_commit_sha, MERGE_SHA);
  assert.equal(pr.head.repo?.full_name, REPOSITORY);
  assert.equal(pr.head.ref, HEAD_BRANCH);
  assert.equal(pr.head.sha, HEAD_SHA);
  assert.equal(pr.base.repo?.full_name, REPOSITORY);
  assert.equal(pr.base.ref, 'main');
  return { headSha: HEAD_SHA, mergeSha: MERGE_SHA, runnerSha: dispatchSha };
}

export function assertRunnerCheckout(expected, actual) {
  if (!/^[0-9a-f]{40}$/.test(expected) || actual !== expected)
    throw new Error('Trusted runner checkout required');
}
