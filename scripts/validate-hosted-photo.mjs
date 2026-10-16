import assert from 'node:assert/strict';
export const CANDIDATE_SHA = 'd05a26a2cbdd97a5be489ca076fd8c9a8d38d2ad';
export const STAGING_REF = 'tteyypklldgwwicrgjzt';
export const PRODUCTION_REF = 'nsxtromjdpdscknadxez';
export const CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';
export const PROVENANCE = [
  {number:143,head:'90d56bcd62235e112a2874a7b6cb1ad5cc5a1206',merge:CANDIDATE_SHA,branch:'dev/photo-storage-permission-qa'},
  {number:144,head:'3c709326be7b5c2f6e74b35182d68a844b69cb04',merge:'ee32e27f4e3252c626acfe2598bd7e1a196ad70d',branch:'dev/permanent-ux-qa'}
];
export function validateSelection({repository,ref,eventName,sha,confirmation,prs}) {
  assert.equal(repository,'easwarkumarvb/brickcircle.club');
  assert.equal(ref,'refs/heads/main');
  assert.equal(eventName,'workflow_dispatch');
  assert.equal(sha,CANDIDATE_SHA);
  assert.equal(confirmation,CONFIRMATION);
  assert.equal(prs?.length,2);
  for(const expected of PROVENANCE){
    const pr=prs.find(pr=>pr.number===expected.number);
    assert.equal(pr?.merged,true);assert.equal(pr.state,'closed');
    assert.equal(pr.merge_commit_sha,expected.merge);
    assert.equal(pr.head.sha,expected.head);assert.equal(pr.head.ref,expected.branch);
    assert.equal(pr.head.repo?.full_name,repository);
    assert.equal(pr.base.ref,'main');assert.equal(pr.base.repo?.full_name,repository);
  }
  return CANDIDATE_SHA;
}
export function validateTarget(env,{publicOnly=false,expectedSha=CANDIDATE_SHA}={}) {
  assert.match(expectedSha,/^[0-9a-f]{40}$/);
  assert.equal(env.BC_HOSTED_SMOKE_CONFIRMATION,CONFIRMATION);
  assert.equal(env.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA,expectedSha);
  assert.equal(env.BC_STAGING_SUPABASE_PROJECT_REF,STAGING_REF);
  assert.equal(env.BC_PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_REF);
  assert.equal(env.BC_STAGING_SUPABASE_URL,`https://${STAGING_REF}.supabase.co`);
  assert.equal(env.BC_STAGING_ALLOWED_EMAIL_DOMAIN,'example.test');
  assert.equal(env.BC_STAGING_NOTIFICATION_MODE,'outbox-only');
  assert.ok(env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY);
  if(publicOnly)assert.ok(!env.BC_STAGING_SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY,'Server credential forbidden in public harness');
}
export function guardedFetch(fetchImpl=fetch) {
  return async(input,init={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    assert.equal(url.origin,`https://${STAGING_REF}.supabase.co`,'Transport rejected');
    assert.ok(!url.username&&!url.password&&!url.hash,'Transport rejected');
    assert.ok(/^\/(auth|rest|storage)\/v1\//.test(url.pathname),'Transport rejected');
    // Override Request/init redirect handling: even an otherwise valid staging
    // response may redirect credentials or a bearer capability to production.
    return fetchImpl(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  };
}
